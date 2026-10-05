import assert from 'node:assert/strict';
const base=process.argv[2]||'http://localhost:3000';
if(!['http://localhost:3000','http://localhost:5175'].includes(base))throw new Error('Use a configured local API');
async function get(path,status=200){const response=await fetch(base+'/api/v1/'+path,{signal:AbortSignal.timeout(15000)});const body=await response.json();assert.equal(response.status,status,JSON.stringify(body));return body;}
const categories=await get('catalog/categories');assert.equal(categories.items.length,5);
assert.equal(categories.items.reduce((n,c)=>n+c.products,0),7803);
const first=await get('products?limit=24');assert.equal(first.items.length,24);assert.equal(first.total,7803);assert.equal(first.engine,'supabase');assert(first.items.every(p=>p.price_usd>0));
const second=await get('products?limit=24&after='+first.next_after);assert(!second.items.some(p=>first.items.some(other=>p.id===other.id)));
const detail=await get('products/'+first.items[0].id);assert.equal(detail.id,first.items[0].id);assert.equal(detail.currency,'USD');
const search=await get('search?q=kitchen');assert(search.items.length>0);assert.equal(search.engine,'elasticsearch');assert(search.items.every(p=>p.price_usd>0));
const accented=await get('search?q='+encodeURIComponent('điện tử'));
const folded=await get('search?q=dien%20tu');assert.equal(accented.total,folded.total);assert(accented.total>0);
const filtered=await get('search?q=kitchen&category=Home_and_Kitchen');assert(filtered.items.length>0);assert(filtered.items.every(p=>p.category==='Home_and_Kitchen'));
const suggestions=await get('search/suggestions?q=kit');assert(suggestions.items.length>0&&suggestions.items.length<=6);
const sorted=await get('search?sort=price_asc');assert(sorted.items.length>0);assert(sorted.items.every(p=>p.price_usd>0));
assert(sorted.items.every((p,i)=>i===0||p.price_usd>=sorted.items[i-1].price_usd));
await get('search?limit=999',422);await get('search?query=%7B%7D',422);await get('products/BAAAAAAAAA',404);
console.log(JSON.stringify({base,products:first.total,categories:categories.items.length,detail:detail.id,kitchen:search.total,accented:accented.total,folded:folded.total,suggestions:suggestions.items.length,priceSort:'pass',pagination:'pass',validation:'pass'}));
