#!/usr/bin/env python3
"""Read-only verification of local catalog translations and unchanged source provenance."""
import hashlib
import json
import pathlib
import re

DATA = pathlib.Path(__file__).resolve().parents[1] / 'data/amazon-2023'
source_path = DATA / 'products.jsonl'
manifest = json.loads((DATA / 'manifest.json').read_text())
assert hashlib.sha256(source_path.read_bytes()).hexdigest() == manifest['sha256'], 'Source dataset changed'
source = {row['id']: row for row in map(json.loads, source_path.open()) if row['price'] is not None}
rows = json.loads((DATA / 'titles-vi.json').read_text())
assert len(rows) == len(source) == 7803
assert len({row['id'] for row in rows}) == len(rows)
for row in rows:
    original = source[row['id']]
    assert row['original'] == original['title'], 'Translation does not match current source'
    assert 0 < len(row['vi'].encode('utf-16-le')) // 2 <= 1500
    assert len(row['original'].encode('utf-16-le')) // 2 <= 500
    for token in re.findall(r'\b(?=[A-Za-z0-9./-]*\d)[A-Za-z0-9]+(?:[./-][A-Za-z0-9]+)*\b', row['original']):
        assert token.casefold() in row['vi'].casefold(), 'Numeric specification was changed'
    brand = original.get('store', '').strip()
    if brand and brand.lower() not in {'unknown', 'generic'} and re.search(r'(?<!\w)' + re.escape(brand) + r'(?!\w)', row['original'], flags=re.IGNORECASE) is not None:
        assert brand.casefold() in row['vi'].casefold(), 'Source brand was changed'
print(json.dumps({'prepared':len(rows),'changed':sum(row['vi'] != row['original'] for row in rows),
    'source_hash_verified': True, 'numeric_specs_verified': True, 'known_brands_verified': True}))
