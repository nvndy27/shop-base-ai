import { expect,it,vi } from 'vitest';
import { AppError } from '@shop/domain';
vi.mock('server-only',()=>({}));
import { createCatalogHandler } from '../../apps/web/src/server/catalog/http';
import { buildSearchQuery } from '../../apps/web/src/server/catalog/elasticsearch';
import { catalogQuery,type Product } from '../../apps/web/src/server/catalog/contracts';
const product:Product={id:'B000000001',title:'Kitchen',category:'Electronics',category_name_vi:'Điện tử',description:'',features:[],image_urls:['https://m.media-amazon.com/test.jpg'],price_usd:19.99,currency:'USD',store_name:'',average_rating:null};
it('hydrates and orders search IDs from PostgreSQL, discarding missing source records',async()=>{
  const read=vi.fn().mockResolvedValue([product]);
  const search=vi.fn().mockResolvedValue({ids:['B000000002',product.id],total:2});
  const handler=createCatalogHandler({repository:()=>({read,categories:async()=>[]}),search:{search},appOrigin:()=> 'http://localhost:5175'});
  const result=await handler(new Request('http://localhost/api/v1/search?q=kitchen'));
  expect(result.status).toBe(200);
  expect((await result.json()).items).toEqual([product]);
  expect(read).toHaveBeenCalledWith({ids:['B000000002',product.id],category:'',limit:24});
  for(const suffix of ['limit=41','page=1000','sort=script','query=%7B%7D','q=a&q=b']){
    expect((await handler(new Request('http://localhost/api/v1/search?'+suffix))).status).toBe(422);
  }
  expect((await handler(new Request('http://localhost/api/v1/products/B000000001',{method:'DELETE'}))).status).toBe(405);
  expect((await handler(new Request('http://localhost/api/v1/products',{headers:{origin:'https://evil.example'}}))).status).toBe(403);
});
it('builds server-owned DSL with exact category filters, bounded paging, and missing-price sort',()=>{
  const result=buildSearchQuery(catalogQuery.parse({q:'điện tử',category:'Electronics',sort:'price_asc',page:'2',limit:'24'}));
  expect(result.from).toBe(24);
  expect(result._source).toBe(false);
  expect(result.query.bool.filter).toEqual([{range:{price:{gt:0}}},{term:{category:'Electronics'}}]);
  expect(result.sort).toContainEqual({price:{order:'asc',missing:'_last'}});
  expect(buildSearchQuery(catalogQuery.parse({q:'kit'}),true).size).toBe(6);
});
it('reports a search outage without substituting local fixture results',async()=>{
  const read=vi.fn();
  const handler=createCatalogHandler({repository:()=>({read,categories:async()=>[]}),search:{search:async()=>{throw new AppError(503,'SEARCH_UNAVAILABLE','Tìm kiếm tạm thời không khả dụng.');}},appOrigin:()=> 'http://localhost:5175'});
  const response=await handler(new Request('http://localhost/api/v1/search?q=kitchen'));
  expect(response.status).toBe(503);
  expect((await response.json()).error.code).toBe('SEARCH_UNAVAILABLE');
  expect(read).not.toHaveBeenCalled();
});

it('applies validated display language to list, detail and suggestions without changing search authority',async()=>{
  const present=vi.fn(async(items:Product[],language:'vi'|'en')=>items.map(p=>({...p,display_title:language==='vi'?'Nhà bếp':p.title})));
  const handler=createCatalogHandler({repository:()=>({read:async()=>[product],categories:async()=>[]}),
    search:{search:async()=>({ids:[product.id],total:1})},appOrigin:()=> 'http://localhost:5175',present});
  for(const path of ['products','products/'+product.id,'search?q=kitchen']){
    const response=await handler(new Request('http://localhost/api/v1/'+path+(path.includes('?')?'&':'?')+'language=vi'));
    expect(response.status).toBe(200);
    const payload=await response.json();
    expect((payload.items?.[0]??payload).display_title).toBe('Nhà bếp');
  }
  const suggestions=await handler(new Request('http://localhost/api/v1/search/suggestions?q=kitchen&language=vi'));
  expect((await suggestions.json()).items[0]).toMatchObject({label:'Nhà bếp',query:'Kitchen'});
  for(const path of ['products?language=fr','products/'+product.id+'?language=vi&language=en']){
    expect((await handler(new Request('http://localhost/api/v1/'+path))).status).toBe(422);
  }
});
