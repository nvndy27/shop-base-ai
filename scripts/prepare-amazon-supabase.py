#!/usr/bin/env python3
"""Prepare a transaction SQL import for admin psql. Does not connect to a database."""
import hashlib
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / "data/amazon-2023"


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def main():
    manifest = json.loads((DATA / "manifest.json").read_text())
    source = DATA / "products.jsonl"
    with source.open("rb") as file:
        sha = hashlib.file_digest(file, "sha256").hexdigest()
    if sha != manifest["sha256"]:
        raise ValueError("Dataset hash mismatch")
    with source.open(encoding="utf-8") as file:
        rows = [json.loads(line) for line in file]
    if len(rows) != manifest["products"] or len({row["id"] for row in rows}) != len(rows):
        raise ValueError("Dataset count/uniqueness mismatch")
    key = "amazon-2023-" + sha[:12]
    output = DATA / "import-supabase.sql"
    with output.open("w", encoding="utf-8") as file:
        file.write("\\set ON_ERROR_STOP on\nbegin;\nset local standard_conforming_strings = on;\n")
        file.write(f"insert into catalog_import.datasets(dataset_key,source_sha256,source_url,expected_products) values ({literal(key)},{literal(sha)},'https://amazon-reviews-2023.github.io/',{len(rows)}) on conflict (dataset_key) do nothing;\n")
        for offset in range(0, len(rows), 250):
            batch = json.dumps(rows[offset:offset + 250], ensure_ascii=False, allow_nan=False)
            file.write(f"""insert into catalog_import.products
(dataset_key,source_id,title,category,category_name_vi,description,features,source_categories,image_urls,price_usd,source_currency,store_name,average_rating)
select {literal(key)},p.id,p.title,p.category,p.category_name_vi,p.description,p.features,p.source_categories,p.images,p.price,p.currency,p.store,p.average_rating
from jsonb_to_recordset({literal(batch)}::jsonb) as p(id text,title text,category text,category_name_vi text,description text,features jsonb,source_categories jsonb,images jsonb,price numeric,currency text,store text,average_rating real)
on conflict (dataset_key,source_id) do update set title=excluded.title,category=excluded.category,category_name_vi=excluded.category_name_vi,description=excluded.description,features=excluded.features,source_categories=excluded.source_categories,image_urls=excluded.image_urls,price_usd=excluded.price_usd,source_currency=excluded.source_currency,store_name=excluded.store_name,average_rating=excluded.average_rating;
""")
        file.write(f"""do $verify$
begin
  if (select count(*) from catalog_import.products where dataset_key={literal(key)}) <> {len(rows)} then
    raise exception 'Catalog import count mismatch';
  end if;
end;
$verify$;
commit;
select category,count(*) as products,count(price_usd) as with_price from catalog_import.products where dataset_key={literal(key)} group by category order by category;
select pg_size_pretty(pg_total_relation_size('catalog_import.products')) as products_with_indexes;
""")
    print(f"Prepared {len(rows)} products in {output}; no database connection made.")


if __name__ == "__main__":
    main()
