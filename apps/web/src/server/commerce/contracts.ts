import { z } from '@shop/contracts';
import { categoryId } from '../catalog/contracts';
export const id = z.uuid();
const version = z.number().int().positive();
const money = z.number().int().min(1000).max(100000000);
const text = (max:number) => z.string().trim().min(1).max(max);
const image = z.url().max(1000).regex(/^(?:https:\/\/(?:m\.media-amazon\.com\/images\/I\/[A-Za-z0-9_+.,%~-]+\.(?:jpg|jpeg|png|webp)|[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/course-product-images\/[0-9a-f-]+\/[0-9a-f-]+\.webp)|http:\/\/(?:127\.0\.0\.1|localhost):54321\/storage\/v1\/object\/public\/course-product-images\/[0-9a-f-]+\/[0-9a-f-]+\.webp)$/);
const details = {title:text(200),description:z.string().max(5000),category:categoryId,image_urls:z.array(image).min(1).max(12)};
const variant = {sku:text(60),name:text(100),price_vnd:money};
export const inputs = {
  products:z.strictObject({category:z.union([categoryId,z.literal('')]).default(''),page:z.coerce.number().int().min(1).max(80).default(1)}),
  search:z.strictObject({q:z.string().trim().max(120).default(''),category:z.union([categoryId,z.literal('')]).default(''),page:z.coerce.number().int().min(1).max(80).default(1),sort:z.enum(['relevance','price_asc','price_desc']).default('relevance')}),
  product:z.strictObject({id}),cart:z.strictObject({}),cart_put:z.strictObject({variant_id:id,quantity:z.number().int().min(1).max(99)}),
  cart_delete:z.strictObject({variant_id:id}),quote:z.strictObject({}),
  order_create:z.strictObject({quote_id:id,address_id:id,request_key:id,payment_method:z.literal('cod')}),
  orders:z.strictObject({}),order:z.strictObject({id}),order_cancel:z.strictObject({id,reason:text(500).min(3)}),
  seller_products:z.strictObject({shop_id:id}),seller_orders:z.strictObject({shop_id:id}),
  seller_create:z.strictObject({shop_id:id,...details,...variant,stock:z.number().int().min(0).max(1000000)}),
  seller_update:z.strictObject({shop_id:id,id,version,...details}),
  seller_submit:z.strictObject({shop_id:id,id,version}),seller_archive:z.strictObject({shop_id:id,id,version}),
  seller_variant:z.strictObject({shop_id:id,product_id:id,id:id.optional(),version:version.optional(),...variant,active:z.boolean()}).refine(v=>!v.id||Boolean(v.version)),
  seller_inventory:z.strictObject({shop_id:id,variant_id:id,delta:z.number().int().min(-1000000).max(1000000).refine(v=>v!==0),reason:text(500).min(3),request_key:id}),
  seller_transition:z.strictObject({shop_id:id,id,version,status:z.enum(['confirmed','shipped','delivered','cancelled']),reason:text(500).min(3)}),
  moderate:z.strictObject({id,version,decision:z.enum(['published','rejected']),reason:text(500).min(3)}),
  moderate_list:z.strictObject({}),
  asset_init:z.strictObject({shop_id:id}),
};
export type Operation = keyof typeof inputs;
export const product = z.object({id,shop_id:id,shop_name:z.string(),title:z.string(),description:z.string(),category:categoryId,
  image_urls:z.array(image),version,status:z.enum(['draft','pending','published','rejected','archived']),
  variants:z.array(z.object({id,sku:z.string(),name:z.string(),price_vnd:money,version,active:z.boolean(),available:z.number().int().nonnegative(),on_hand:z.number().int().nonnegative().nullable()}))});
const cartItem=z.object({variant_id:id,product_id:id,shop_id:id,shop_name:z.string(),title:z.string(),sku:z.string(),name:z.string(),price_vnd:money,version,
  quantity:z.number().int().min(1).max(99),available:z.number().int().nonnegative(),image_url:image.nullable(),saleable:z.boolean()});
const orderItem=z.object({id,variant_id:id,title:z.string(),sku:z.string(),name:z.string(),quantity:z.number().int().positive(),price_vnd:money,image_url:image.nullable()});
export const order=z.object({id,total:z.number().int().positive(),currency:z.literal('VND'),payment_method:z.literal('cod'),created_at:z.string(),
  address:z.object({id,recipient_name:z.string(),phone:z.string(),address_line:z.string(),ward:z.string(),district:z.string(),province:z.string(),is_default:z.boolean()}),
  shops:z.array(z.object({id,shop_id:id,shop_name:z.string(),status:z.enum(['pending','confirmed','shipped','delivered','cancelled']),version,total:z.number().int().positive(),items:z.array(orderItem)}))});
const products=z.object({items:z.array(product),total:z.number().int().nonnegative()});
const orders=z.object({items:z.array(order)});
const cart=z.object({items:z.array(cartItem)});
export const outputs:Record<Operation,z.ZodType>={products,search:products,product,cart,cart_put:cart,cart_delete:cart,
  quote:z.object({id,items:z.array(cartItem),subtotal:z.number().int().positive(),shipping:z.literal(0),total:z.number().int().positive(),expires_at:z.string(),currency:z.literal('VND')}),
  order_create:order,orders,order,order_cancel:order,seller_products:z.object({items:z.array(product)}),seller_orders:orders,
  seller_create:product,seller_update:product,seller_submit:product,seller_archive:product,seller_variant:product,seller_inventory:product,seller_transition:order,moderate:product,moderate_list:z.object({items:z.array(product)}),asset_init:z.object({id,path:z.string().regex(/^[0-9a-f-]+\/[0-9a-f-]+\.webp$/)})};
