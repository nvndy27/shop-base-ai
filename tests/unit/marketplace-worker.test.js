import { describe,expect,it,vi } from 'vitest';
import { indexDocument,indexEvent } from '../../scripts/marketplace-elastic.mjs';
describe('Versioned public index worker',()=>{
  it('keeps invisible tombstones and never indexes private order/account fields',()=>{
    expect(indexDocument({id:'id',product:null})).toEqual({id:'id',visible:false,title:'',description:'',category:'',price:0});
    const doc=indexDocument({id:'id',product:{title:'Nước hoa',description:'Test',category:'All_Beauty',variants:[{active:true,price_vnd:10000}],address:'PRIVATE',phone:'PRIVATE'}});
    expect(doc.visible).toBe(true);expect(doc).not.toHaveProperty('address');expect(doc).not.toHaveProperty('phone');
  });
  it('uses external versions, treats stale writes as complete and retries actual errors',async()=>{
    const event={id:'10000000-0000-4000-8000-000000000001',version:3,product:null};const call=vi.fn().mockResolvedValue({status:409});
    await indexEvent(event,call);expect(call.mock.calls[0][0]).toContain('version=3&version_type=external_gte');
    await expect(indexEvent(event,vi.fn().mockResolvedValue({status:503}))).rejects.toThrow();
  });
});
