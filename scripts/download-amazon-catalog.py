#!/usr/bin/env python3
"""Download a bounded product-only sample; never execute dataset loading code."""
import argparse
import datetime
import gzip
import hashlib
import json
import math
import pathlib
import re
import urllib.parse
import urllib.request

SOURCES = {
    "All_Beauty": "Mỹ phẩm",
    "Electronics": "Điện tử",
    "Cell_Phones_and_Accessories": "Điện thoại và phụ kiện",
    "Home_and_Kitchen": "Nhà cửa và đồ bếp",
    "Grocery_and_Gourmet_Food": "Thực phẩm và đồ uống",
}
BASE = "https://mcauleylab.ucsd.edu/public_datasets/data/amazon_2023/raw/meta_categories/"


def text(value, limit=500):
    return value.strip()[:limit] if isinstance(value, str) else ""


def texts(value, count=10, limit=1000):
    return [text(item, limit) for item in value[:count] if text(item, limit)] if isinstance(value, list) else []


def normalize(item, category):
    if not isinstance(item, dict):
        return None
    asin = text(item.get("parent_asin"), 30)
    title = text(item.get("title"), 500)
    if not re.fullmatch(r"[A-Z0-9]{10}", asin) or not title:
        return None
    images = []
    source_images = item.get("images")
    for image in source_images[:12] if isinstance(source_images, list) else []:
        if not isinstance(image, dict):
            continue
        url = text(image.get("large") or image.get("hi_res") or image.get("thumb"), 2048)
        try:
            parsed = urllib.parse.urlsplit(url)
        except ValueError:
            continue
        if parsed.scheme == "https" and parsed.hostname == "m.media-amazon.com" and not parsed.username and not parsed.password and url not in images:
            images.append(url)
    if not images:
        return None
    try:
        if isinstance(item.get("price"), bool):
            raise ValueError("Boolean is not a price")
        price = float(item.get("price"))
        price = price if math.isfinite(price) and price > 0 else None
    except (ValueError, TypeError):
        price = None
    rating = item.get("average_rating")
    if isinstance(rating, bool) or not isinstance(rating, (int, float)) or not math.isfinite(rating) or not 0 <= rating <= 5:
        rating = None
    return {
        "id": asin, "title": title, "category": category,
        "category_name_vi": SOURCES[category],
        "source_categories": texts(item.get("categories")),
        "description": "\n".join(texts(item.get("description"), 8, 1000)),
        "features": texts(item.get("features"), 8, 1000),
        "price": price, "currency": "USD", "images": images,
        "store": text(item.get("store"), 200),
        "average_rating": rating,
        "source": "Amazon Reviews 2023",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--per-category", type=int, default=4000)
    parser.add_argument("--output", type=pathlib.Path, default=pathlib.Path("data/amazon-2023"))
    args = parser.parse_args()
    if not 1 <= args.per_category <= 20000:
        parser.error("--per-category must be between 1 and 20000")
    args.output.mkdir(parents=True, exist_ok=True)
    final = args.output / "products.jsonl"
    manifest = args.output / "manifest.json"
    if final.exists() or manifest.exists():
        parser.error("Output exists; choose another folder to preserve the previous download")
    partial = args.output / "products.partial.jsonl"
    seen = set()
    stats = []
    digest = hashlib.sha256()
    with partial.open("wb") as output:
        for category in SOURCES:
            url = BASE + "meta_" + category + ".jsonl.gz"
            count = scanned = missing_price = 0
            print(f"Downloading {category} (target {args.per_category})...", flush=True)
            request = urllib.request.Request(url, headers={"User-Agent": "ShopBaseAcademicCatalog/1.0"})
            with urllib.request.urlopen(request, timeout=60) as response:
                if urllib.parse.urlsplit(response.url).hostname != "mcauleylab.ucsd.edu":
                    raise ValueError("Unexpected source redirect")
                with gzip.GzipFile(fileobj=response) as stream:
                    while count < args.per_category:
                        line = stream.readline(1024 * 1024 + 1)
                        if not line:
                            break
                        if len(line) > 1024 * 1024:
                            raise ValueError("Source record exceeds 1 MiB")
                        scanned += 1
                        record = normalize(json.loads(line), category)
                        if not record or record["id"] in seen:
                            continue
                        seen.add(record["id"])
                        encoded = (json.dumps(record, ensure_ascii=False, allow_nan=False) + "\n").encode()
                        output.write(encoded)
                        digest.update(encoded)
                        count += 1
                        missing_price += record["price"] is None
            stats.append({"category": category, "name_vi": SOURCES[category], "url": url, "products": count, "records_scanned": scanned, "missing_price": missing_price})
            print(f"Saved {count} {category} products ({missing_price} without price).", flush=True)
    partial.rename(final)
    manifest.write_text(json.dumps({
        "source": "Amazon Reviews 2023 / McAuley Lab",
        "source_page": "https://amazon-reviews-2023.github.io/",
        "downloaded_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "products": len(seen), "bytes": final.stat().st_size,
        "sha256": digest.hexdigest(), "categories": stats,
        "sampling": "First valid unique product metadata records with title and HTTPS image, up to target per category. Not a random sample or the complete dataset.",
        "notes": "Original English content; Vietnamese top-level category labels only. Historical USD prices; missing prices remain null. Image URLs only, no image files/reviews/users downloaded. No invented inventory, shops or variants. Not imported into database or Elasticsearch.",
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Completed: {len(seen)} products, {final.stat().st_size} bytes. Manifest: {manifest}", flush=True)


if __name__ == "__main__":
    main()
