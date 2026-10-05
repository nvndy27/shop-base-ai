import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { expect,it } from 'vitest';
it('exposes bounded source metadata while keeping source tables private and other datasets hidden',async()=>{
  const db=new PGlite();
  try{
    for(const file of ['supabase/tests/bootstrap.sql','supabase/migrations/202610020001_academic_catalog_import.sql','supabase/migrations/202610030001_catalog_read_api.sql','supabase/migrations/202610030002_priced_catalog.sql'])await db.exec(await readFile(file,'utf8'));
    for(const key of ['amazon-2023-0dac845f97a1','amazon-2023-aaaaaaaaaaaa']){
      await db.query("insert into catalog_import.datasets values ($1,$2,'https://amazon-reviews-2023.github.io/',1,now())",[key,'a'.repeat(64)]);
      await db.query("insert into catalog_import.products(dataset_key,source_id,title,category,category_name_vi,description,features,source_categories,image_urls,store_name) values ($1,'B000000001','Kitchen','Electronics','Điện tử','','[]','[]','[\"https://m.media-amazon.com/test.jpg\"]','')",[key]);
    }
    await db.exec("update catalog_import.products set price_usd=10 where source_id='B000000001';");
    await db.exec("insert into catalog_import.products select dataset_key,'B000000002',title,category,category_name_vi,description,features,source_categories,image_urls,null,source_currency,store_name,average_rating from catalog_import.products where dataset_key='amazon-2023-0dac845f97a1';");
    for(const role of ['anon','authenticated']){
      await db.exec(`set role ${role}`);
      const rows=await db.query<{data:unknown[]}>('select public.read_academic_catalog() as data');
      expect(rows.rows[0]?.data).toHaveLength(1);
      expect((await db.query<{data:{products:number}[]}>('select public.academic_catalog_categories() as data')).rows[0]?.data[0]?.products).toBe(1);
      expect((await db.query<{data:unknown[]}>('select public.read_academic_catalog($1) as data',[['B000000002']])).rows[0]?.data).toEqual([]);
      await expect(db.query('select * from catalog_import.products')).rejects.toMatchObject({code:'42501'});
      await expect(db.query('delete from catalog_import.products')).rejects.toMatchObject({code:'42501'});
      for(const args of [[null,'','',41],[null,'invalid','',24],[['invalid'],'','',24],[Array(41).fill('B000000001'),'','',24]]){
        await expect(db.query('select public.read_academic_catalog($1,$2,$3,$4)',args)).rejects.toMatchObject({code:'22023'});
      }
      await db.exec('reset role');
    }
  }finally{await db.close();}
});
