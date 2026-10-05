import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

describe("academic catalog import isolation", () => {
  it("allows trusted import and denies user reads/writes without exposing saleable products", async () => {
    const db = new PGlite();
    try {
      await db.exec(await readFile(new URL("../../supabase/tests/bootstrap.sql", import.meta.url), "utf8"));
      await db.exec(await readFile(new URL("../../supabase/migrations/202610020001_academic_catalog_import.sql", import.meta.url), "utf8"));
      const key = "amazon-2023-aaaaaaaaaaaa";
      await db.query("insert into catalog_import.datasets(dataset_key,source_sha256,source_url,expected_products) values ($1,$2,'https://amazon-reviews-2023.github.io/',1)", [key, "a".repeat(64)]);
      await db.query(`insert into catalog_import.products(dataset_key,source_id,title,category,category_name_vi,description,features,source_categories,image_urls,store_name)
        values ($1,'B000000001',$2,'Electronics','Điện tử','','[]','[]','["https://m.media-amazon.com/test.jpg"]','')`, [key, "Title '; drop schema public; --"]);
      expect((await db.query("select count(*)::integer as count from catalog_import.products")).rows).toEqual([{ count: 1 }]);
      for (const role of ["anon", "authenticated"]) {
        await db.exec(`set role ${role}`);
        await expect(db.query("select * from catalog_import.products")).rejects.toMatchObject({ code: "42501" });
        await expect(db.query("delete from catalog_import.products")).rejects.toMatchObject({ code: "42501" });
        await db.exec("reset role");
      }
      await db.exec("set role service_role");
      expect((await db.query("select price_usd from catalog_import.products")).rows).toEqual([{ price_usd: null }]);
      await expect(db.query("delete from catalog_import.products")).rejects.toMatchObject({ code: "42501" });
      await db.exec("reset role");
      for (const price of [-1, 0, "NaN"]) {
        await expect(db.query("update catalog_import.products set price_usd=$1", [price])).rejects.toMatchObject({ code: "23514" });
      }
      const rls = await db.query<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where oid in ('catalog_import.datasets'::regclass,'catalog_import.products'::regclass)");
      expect(rls.rows.every(row => row.relrowsecurity)).toBe(true);
    } finally {
      await db.close();
    }
  });
});
