import { z } from '@shop/contracts';
const text = (max: number) => z.string().transform(v => v.normalize('NFC').trim().replace(/\s+/gu, ' ')).pipe(z.string().min(1).max(max));
const code = (max: number) => z.string().transform(v => v.trim().toUpperCase()).pipe(z.string().max(max).regex(/^[A-Z0-9][A-Z0-9_-]*$/));
const optionalText = z.string().transform(v => v.trim() || null).nullable().optional();
export const phone = z.string().regex(/^[+0-9 .-]+$/).transform(v => v.replace(/[ .-]/g, '').replace(/^0/, '+84')).pipe(z.string().regex(/^\+84[1-9][0-9]{8}$/));
const email = z.string().trim().transform(v => v === '' ? null : v.replace(/@([^@]+)$/, (_, domain: string) => '@' + domain.toLowerCase())).pipe(z.email().max(254).nullable()).nullable().optional();
export const price = z.number().int().min(0).max(99999999999999);
export const quantity = z.number().int().min(1).max(1000000);
export const inputs = {
 categories: z.strictObject({code: code(20), name: text(100), description: optionalText}),
 products: z.strictObject({sku: code(40), category_id: z.uuid(), name: text(200), description: optionalText, unit: text(30), current_price: price}),
 customers: z.strictObject({code: code(30), full_name: text(150), phone, email, address: text(300)}),
 warehouses: z.strictObject({code: code(20), name: text(100), address: text(300)})
};
export const resource = z.enum(['categories','products','customers','warehouses']);
export type Resource = z.infer<typeof resource>;
export const pagination = z.strictObject({page: z.coerce.number().int().min(1).max(100000).default(1), page_size: z.coerce.number().int().min(1).max(100).default(20)});
