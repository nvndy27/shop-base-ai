import { readFile, writeFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// This embedded verification never connects to Supabase or any network database.
const db = new PGlite();
try {
  await db.exec(await readFile(new URL('../supabase/tests/bootstrap.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/202610020001_academic_catalog_import.sql', import.meta.url), 'utf8'));
  const sql = (await readFile(new URL('../data/amazon-2023/import-supabase.sql', import.meta.url), 'utf8')).replace(/^\\set ON_ERROR_STOP on\n/, '');
  await db.exec(sql);
  const counts = await db.query('select category,count(*)::integer as products,count(price_usd)::integer as with_price from catalog_import.products group by category order by category');
  const total = counts.rows.reduce((sum, row) => sum + row.products, 0);
  if (total !== 20000 || counts.rows.length !== 5) throw new Error('Full SQL import verification failed');
  await db.exec(sql);
  const after = await db.query('select count(*)::integer as count from catalog_import.products');
  if (after.rows[0].count !== total) throw new Error('Idempotent re-import verification failed');
  const size = await db.query("select pg_total_relation_size('catalog_import.products')::text as bytes");
  const report = { engine: 'PGlite embedded PostgreSQL verification, not the target Supabase', products: total, categories: counts.rows, idempotent: true, table_with_indexes_bytes: size.rows[0].bytes };
  await writeFile(new URL('../data/amazon-2023/sql-verification-report.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  await db.close();
}
