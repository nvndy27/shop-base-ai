import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { normalizeDemo } from './demo-commerce.mjs';

const [productPath, cartPath] = process.argv.slice(2);
if (!productPath || !cartPath) throw new Error('Usage: node scripts/import-demo-commerce.mjs <products.json> <carts.json>');
const [products, carts] = await Promise.all([readFile(productPath, 'utf8'), readFile(cartPath, 'utf8')]);
const data = normalizeDemo(JSON.parse(products), JSON.parse(carts));
const output = new URL('../frontend/src/data/commerce-demo.json', import.meta.url);
await mkdir(new URL('.', output), { recursive: true });
await writeFile(output, `${JSON.stringify({
  provenance: { source: 'DummyJSON', productsUrl: 'https://dummyjson.com/products', cartsUrl: 'https://dummyjson.com/carts', licenseUrl: 'https://github.com/Ovi/DummyJSON/blob/master/LICENSE', importedAt: new Date().toISOString(), productsSha256: createHash('sha256').update(products).digest('hex'), cartsSha256: createHash('sha256').update(carts).digest('hex'), demoVndMultiplier: 25000, note: 'Products and carts from DummyJSON. Shops, VND prices, order states/dates and suborders are synthetic demo fixtures; not real transactions or an exchange-rate quote.' },
  ...data,
}, null, 2)}\n`);
console.log(`Prepared ${data.products.length} products, ${data.categories.length} categories, ${data.shops.length} demo shops, ${data.carts.length} carts and ${data.orders.length} synthetic orders.`);
