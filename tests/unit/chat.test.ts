import { afterEach,describe,expect,it,vi } from 'vitest';
import { AppError } from '@shop/domain';
import { inputs } from '../../apps/web/src/server/chat/contracts';
import { createChatHandler, isChatPath } from '../../apps/web/src/server/chat/http';

const conversation='30000000-0000-4000-8000-000000000001';
const shop='20000000-0000-4000-8000-000000000001';
const conversationDto={id:conversation,shop_id:shop,shop_name:'Shop A',shop_slug:'shop-a',counterpart_name:'Shop A',
  context_product_id:null,context_order_id:null,last_message_at:'2026-10-05T00:00:00Z',created_at:'2026-10-05T00:00:00Z',
  unread_count:0,last_message:null};
const messageDto={id:conversation,sequence:1,kind:'text',body:'Xin chào',mine:true,client_message_id:conversation,created_at:'2026-10-05T00:00:00Z'};
function handlerWith(rpc:ReturnType<typeof vi.fn>,authenticate=vi.fn()){
  return {authenticate,rpc,handler:createChatHandler({authenticate,rpc:rpc as never,appOrigin:()=> 'http://localhost:5175'})};
}
describe('Chat API boundaries',()=>{
  afterEach(()=>vi.restoreAllMocks());
  it('routes only the chat namespace',()=>{
    expect(isChatPath('/api/v1/chat')).toBe(true);
    expect(isChatPath('/api/v1/chat/conversations')).toBe(true);
    expect(isChatPath(`/api/v1/chat/conversations/${conversation}/messages`)).toBe(true);
    expect(isChatPath('/api/v1/chatter')).toBe(false);
    expect(isChatPath('/api/v1/cart')).toBe(false);
  });
  it('rejects client-supplied scope, unknown keys and null context before any RPC',()=>{
    expect(inputs.message_send.safeParse({conversation_id:conversation,body:'Xin chào'}).success).toBe(false);
    expect(inputs.message_send.safeParse({conversation_id:conversation,body:'Xin chào',client_message_id:conversation,conversation_scope:shop}).success).toBe(false);
    expect(inputs.message_send.safeParse({conversation_id:conversation,body:'   ',client_message_id:conversation}).success).toBe(false);
    expect(inputs.conversation_open.safeParse({shop_id:shop,context_product_id:null}).success).toBe(false);
    expect(inputs.conversation_open.safeParse({shop_id:shop}).success).toBe(true);
    expect(inputs.conversation_read.safeParse({conversation_id:conversation}).success).toBe(false);
  });
  it('rejects cross-origin and unauthenticated calls before the RPC runs',async()=>{
    const rpc=vi.fn(),authenticate=vi.fn().mockRejectedValue(new AppError(401,'UNAUTHENTICATED','Vui lòng đăng nhập.'));
    const {handler}=handlerWith(rpc,authenticate);
    const foreign=await handler(new Request('http://localhost/api/v1/chat/conversations',{headers:{Origin:'https://evil.invalid'}}));
    expect(foreign.status).toBe(403);expect(authenticate).not.toHaveBeenCalled();
    const anonymous=await handler(new Request('http://localhost/api/v1/chat/conversations'));
    expect(anonymous.status).toBe(401);expect(rpc).not.toHaveBeenCalled();
  });
  it('blocks path scope overrides and unsupported query parameters',async()=>{
    const rpc=vi.fn().mockResolvedValue({message:messageDto});
    const {handler}=handlerWith(rpc);
    const override=await handler(new Request(`http://localhost/api/v1/chat/conversations/${conversation}/messages`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({conversation_id:shop,body:'Xin chào',client_message_id:conversation})}));
    expect(override.status).toBe(422);expect(rpc).not.toHaveBeenCalled();
    const query=await handler(new Request(`http://localhost/api/v1/chat/conversations/${conversation}/messages?raw=1`,{method:'POST'}));
    expect(query.status).toBe(422);expect(rpc).not.toHaveBeenCalled();
  });
  it('passes path and query scope into the RPC and validates private output',async()=>{
    const rpc=vi.fn().mockResolvedValue({items:[messageDto],has_more:true});
    const {handler}=handlerWith(rpc);
    const page=await handler(new Request(`http://localhost/api/v1/chat/conversations/${conversation}?limit=20&before_seq=9`));
    expect(page.status).toBe(200);
    expect(rpc.mock.calls[0]![1]).toBe('messages');
    expect(rpc.mock.calls[0]![2]).toMatchObject({conversation_id:conversation,limit:20,before_seq:9});

    const leaked=vi.fn().mockResolvedValue({items:[{...conversationDto,buyer_id:shop}]});
    expect((await handlerWith(leaked).handler(new Request('http://localhost/api/v1/chat/conversations'))).status).toBe(503);
  });
  it('creates a conversation and a message with 201',async()=>{
    const open=vi.fn().mockResolvedValue({conversation:conversationDto});
    const {handler}=handlerWith(open);
    const created=await handler(new Request('http://localhost/api/v1/chat/conversations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({shop_id:shop})}));
    expect(created.status).toBe(201);
    expect(open.mock.calls[0]![2]).toMatchObject({shop_id:shop});

    const send=vi.fn().mockResolvedValue({message:messageDto});
    const sent=await handlerWith(send).handler(new Request(`http://localhost/api/v1/chat/conversations/${conversation}/messages`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({body:'Xin chào',client_message_id:conversation})}));
    expect(sent.status).toBe(201);
    expect(send.mock.calls[0]![2]).toMatchObject({conversation_id:conversation,body:'Xin chào',client_message_id:conversation});
  });
  it('returns 404 for an unrouted chat path',async()=>{
    const rpc=vi.fn();
    expect((await handlerWith(rpc).handler(new Request(`http://localhost/api/v1/chat/conversations/${conversation}`,{method:'DELETE'}))).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });
});
