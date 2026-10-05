import { expect, it, vi } from 'vitest';
import { createExchangeReader, createProductPresenter } from '../../apps/web/src/server/catalog/presentation';
import type { Product } from '../../apps/web/src/server/catalog/contracts';
const product: Product = {id:'B000000001',title:'Headphones X100',category:'Electronics',category_name_vi:'Điện tử',description:'',features:[],image_urls:['https://m.media-amazon.com/test.jpg'],price_usd:19.99,currency:'USD',store_name:'Brand',average_rating:null};
it('deduplicates exchange requests, caches valid snapshots, and refuses stale/future or invalid rates', async () => {
  const now = Date.parse('2026-10-03T10:00:00Z');
  const valid = {result:'success',base_code:'USD',time_last_update_unix:now / 1000,rates:{VND:25954}};
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(valid));
  const reader = createExchangeReader(fetcher, () => now);
  const values = await Promise.all([reader(),reader(),reader()]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(values[0]?.rate).toBe(25954);
  await reader();
  expect(fetcher).toHaveBeenCalledTimes(1);
  for (const invalid of [{...valid,base_code:'VND'},{...valid,rates:{VND:0}},
    {...valid,time_last_update_unix:now/1000-49*3600},{...valid,time_last_update_unix:now/1000+3600}]) {
    expect(await createExchangeReader(async () => Response.json(invalid), () => now)()).toBeNull();
  }
});
it('falls back to USD after expiry/outage, throttles failed retries and recovers', async () => {
  let now = Date.parse('2026-10-03T10:00:00Z');
  const fetcher = vi.fn<typeof fetch>().mockImplementationOnce(async () => Response.json({result:'success',base_code:'USD',time_last_update_unix:now/1000,rates:{VND:25000}}))
    .mockImplementationOnce(async () => {throw new Error('offline');})
    .mockImplementationOnce(async () => Response.json({result:'success',base_code:'USD',time_last_update_unix:now/1000,rates:{VND:26000}}));
  const read = createExchangeReader(fetcher, () => now);
  expect((await read())?.rate).toBe(25000);
  now += 25*3600000;
  expect(await read()).toBeNull();
  expect(await read()).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(2);
  now += 61000;
  expect((await read())?.rate).toBe(26000);
});
it('converts only display values, preserves source prices and ignores outdated translations', async () => {
  const rate = vi.fn().mockResolvedValue({rate:25954,updated_at:'2026-10-03T00:00:00Z'});
  const titles = async () => new Map([[product.id,{original:product.title,vi:'Tai nghe X100'}]]);
  const present = createProductPresenter(rate,titles);
  const viRows = await present([product],'vi');
  expect(viRows[0]).toMatchObject({display_title:'Tai nghe X100',display_price:518820,display_currency:'VND',price_usd:19.99,currency:'USD'});
  expect(product.title).toBe('Headphones X100');
  expect((await present([{...product,title:'Changed'}],'vi'))[0]?.display_title).toBe('Changed');
  expect((await present([{...product,price_usd:null}],'vi'))[0]?.display_price).toBeNull();
  const english = await present([product],'en');
  expect(english[0]).toMatchObject({display_title:product.title,display_price:19.99,display_currency:'USD'});
  expect(rate).toHaveBeenCalledTimes(3);
  expect((await present([{...product,price_usd:1e15}],'vi'))[0]?.display_currency).toBe('USD');
  expect((await createProductPresenter(async () => null,titles)([product],'vi'))[0]).toMatchObject({display_currency:'USD',display_price:19.99,exchange:null});
});

it('refreshes at the provider next update rather than retaining yesterday rates for another full day',async()=>{
  let now=Date.parse('2026-10-03T10:00:00Z');
  const fetcher=vi.fn<typeof fetch>().mockImplementation(async()=>Response.json({result:'success',base_code:'USD',time_last_update_unix:now/1000,time_next_update_unix:now/1000+3600,rates:{VND:25954}}));
  const read=createExchangeReader(fetcher,()=>now);
  await read();now+=3600001;await read();
  expect(fetcher).toHaveBeenCalledTimes(2);
});
