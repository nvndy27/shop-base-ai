import { z } from '@shop/contracts';
export const categoryId = z.enum(['All_Beauty','Electronics','Cell_Phones_and_Accessories','Home_and_Kitchen','Grocery_and_Gourmet_Food']);
export const asin = z.string().regex(/^[A-Z0-9]{10}$/);
export const catalogQuery = z.strictObject({
  language: z.enum(['vi','en']).default('en'),
  q: z.string().trim().max(120).default(''),
  category: z.union([categoryId,z.literal('')]).default(''),
  after: z.union([asin,z.literal('')]).default(''),
  page: z.coerce.number().int().min(1).max(80).default(1),
  limit: z.coerce.number().int().min(1).max(40).default(24),
  sort: z.enum(['relevance','price_asc','price_desc','rating']).default('relevance'),
});
export const productDto = z.object({
  id: asin,title:z.string().max(500),category:categoryId,category_name_vi:z.string(),
  description:z.string(),features:z.array(z.string()).max(8),
  image_urls:z.array(z.url().refine(v=>new URL(v).protocol==='https:' && new URL(v).hostname==='m.media-amazon.com')).min(1).max(12),
  price_usd:z.number().positive().nullable(),currency:z.literal('USD'),store_name:z.string(),average_rating:z.number().min(0).max(5).nullable(),
});
export const categoriesDto=z.array(z.object({id:categoryId,name:z.string(),products:z.number().int().nonnegative()}));
export type Product=z.infer<typeof productDto>;
export type CatalogQuery=z.infer<typeof catalogQuery>;
export type CatalogRepository={
  read:(query:{ids?:string[];category?:string;after?:string;limit:number})=>Promise<Product[]>;
  categories:()=>Promise<z.infer<typeof categoriesDto>>;
};
export type SearchResult={ids:string[];total:number};
export type SearchAdapter={search:(query:CatalogQuery,suggest:boolean)=>Promise<SearchResult>};
