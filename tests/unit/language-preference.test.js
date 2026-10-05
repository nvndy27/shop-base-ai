import { expect, it } from 'vitest';
import { createLanguageStore, LANGUAGE_KEY } from '../../frontend/src/locale/store.js';
import { formatProductPrice } from '../../frontend/src/catalog/api.js';
it('persists language, updates document language, synchronizes tabs and handles blocked storage', () => {
  const values = new Map(); const events = {};
  const browser = {document:{documentElement:{}},localStorage:{getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)},addEventListener:(key,fn)=>{events[key]=fn;}};
  const store = createLanguageStore(browser);
  expect(store.getSnapshot()).toBe('vi');
  store.setLanguage('en');
  expect(browser.document.documentElement.lang).toBe('en');
  expect(values.get(LANGUAGE_KEY)).toBe('en');
  let changes = 0;
  store.subscribe(()=>changes++);
  events.storage({key:LANGUAGE_KEY,newValue:'vi',storageArea:browser.localStorage});
  expect(changes).toBe(1);
  browser.localStorage.setItem = () => {throw new Error('blocked');};
  expect(()=>store.setLanguage('en')).not.toThrow();
  expect(store.getSnapshot()).toBe('en');
});
it('formats VND without decimals and preserves USD if conversion is unavailable', () => {
  expect(formatProductPrice({price:518821,currency:'VND'})).toContain('518.821');
  expect(formatProductPrice({price:19.99,currency:'USD'})).toContain('19,99');
  expect(formatProductPrice({price:null,currency:'USD'})).toBe('Chưa có giá');
});
