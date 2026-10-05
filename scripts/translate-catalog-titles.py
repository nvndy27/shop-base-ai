#!/usr/bin/env python3
"""Translate priced source catalog titles locally, checkpointing without changing the source data."""
import argparse
import datetime
import json
import pathlib
import re
import time
import ctranslate2
from transformers import AutoTokenizer

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / 'data/amazon-2023'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--limit', type=int, default=0, help='Translate at most this many missing titles; 0 means all')
parser.add_argument('--batch-size', type=int, default=32)
args = parser.parse_args()
if args.limit < 0 or not 1 <= args.batch_size <= 32:
    parser.error('Invalid limit or batch size')
output = DATA / 'titles-vi.json'
existing = {row['id']: row for row in json.loads(output.read_text())} if output.exists() else {}
source_rows = [json.loads(line) for line in (DATA / 'products.jsonl').open()]
rows = [row for row in source_rows if row['price'] is not None and (row['id'] not in existing or existing[row['id']]['original'] != row['title'])]
# Group similar lengths to reduce padding work on CPU; output is keyed by ASIN.
rows.sort(key=lambda row: (len(row['title']) // 40, row['id']))
if args.limit:
    rows = rows[:args.limit]
model_path = DATA / 'envit5-model'
tokenizer = AutoTokenizer.from_pretrained(str(model_path / 'source'), local_files_only=True, trust_remote_code=False)
translator = ctranslate2.Translator(str(model_path / 'int8'), device='cpu', compute_type='int8', intra_threads=6)

def encode(text):
    return tokenizer.convert_ids_to_tokens(tokenizer.encode('en: ' + text))

def decode(result):
    text = tokenizer.decode(tokenizer.convert_tokens_to_ids(result.hypotheses[0]), skip_special_tokens=True).strip()
    return re.sub(r'^vi:\s*', '', text).strip()

start = time.monotonic()

def checkpoint():
    # Drop translations for removed/changed records. Atomic replacement keeps readers safe.
    valid = {row['id']: row['title'] for row in source_rows}
    saved = [row for row in existing.values() if valid.get(row['id']) == row['original']]
    temporary = output.with_suffix('.partial.json')
    temporary.write_text(json.dumps(saved, ensure_ascii=False) + '\n')
    temporary.replace(output)

for index in range(0, len(rows), args.batch_size):
    batch = rows[index:index + args.batch_size]
    encoded = []
    layouts = []
    full_inputs = [encode(row['title']) for row in batch]
    if any(len(tokens) > 500 for tokens in full_inputs):
        raise ValueError('Title exceeds model input limit; refusing silent truncation')
    full_results = translator.translate_batch(full_inputs, beam_size=2, max_decoding_length=512)
    full_titles = []
    invariants = []
    for row, full_result in zip(batch, full_results):
        # Translate text spans around immutable brand names, model codes and specifications.
        # No placeholders: translation models can corrupt placeholder strings too.
        brand = row.get('store', '').strip()
        brands = [brand] if brand and brand.lower() not in {'unknown', 'generic'} else []
        pattern = r'\b(?=[A-Za-z0-9./-]*\d)[A-Za-z0-9]+(?:[./-][A-Za-z0-9]+)*\b|\b[A-Z]{2,}\b'
        if brands:
            pattern = r'(?<![\w./-])(?:' + '|'.join(re.escape(value) for value in brands) + r')(?![\w./-])|' + pattern
        spans = []
        cursor = 0
        for match in re.finditer(pattern, row['title'], flags=re.IGNORECASE if brands else 0):
            # Case-insensitive brand matching must not accidentally protect all lowercase words.
            value = match.group(0)
            if not any(value.casefold() == b.casefold() for b in brands) and not any(c.isdigit() for c in value) and not value.isupper():
                continue
            gap = row['title'][cursor:match.start()]
            if gap:
                spans.append(gap)
            spans.append(('protected', value))
            cursor = match.end()
        if cursor < len(row['title']):
            spans.append(row['title'][cursor:])
        required = re.findall(r'\b(?=[A-Za-z0-9./-]*\d)[A-Za-z0-9]+(?:[./-][A-Za-z0-9]+)*\b', row['title'])
        if brands and re.search(r'(?<!\w)' + re.escape(brand) + r'(?!\w)', row['title'], flags=re.IGNORECASE):
            required.append(brand)
        invariants.append(required)
        candidate = decode(full_result)
        valid = bool(candidate) and len(candidate) <= 1500 and '<' not in candidate and '>' not in candidate
        valid = valid and all(value.casefold() in candidate.casefold() for value in required)
        # If the model copied English unchanged, try translating the descriptive spans instead.
        valid = valid and any(c in 'ăâđêôơưàáảãạèéẻẽẹìíỉĩịòóỏõọùúủũụỳýỷỹỵ' for c in candidate.lower())
        full_titles.append(candidate if valid else None)
        if valid:
            layouts.append([])
            continue
        layout = []
        for span in spans:
            if isinstance(span, tuple):
                layout.append(span[1])
            elif not any(c.isalpha() for c in span):
                layout.append(span)
            else:
                match = re.search(r'[A-Za-z].*[A-Za-z]', span, flags=re.DOTALL)
                if not match:
                    layout.append(span)
                    continue
                leading, core, trailing = span[:match.start()], match.group(0), span[match.end():]
                tokens = encode(core)
                if len(tokens) > 500:
                    raise ValueError('Title exceeds model input limit; refusing silent truncation')
                layout.append((len(encoded), leading, core, trailing))
                encoded.append(tokens)
        layouts.append(layout)
    results = translator.translate_batch(encoded, beam_size=2, max_decoding_length=512) if encoded else []
    for row, layout, full_title, required in zip(batch, layouts, full_titles, invariants):
        if full_title is not None:
            existing[row['id']] = {'id': row['id'], 'original': row['title'], 'vi': full_title}
            continue
        parts = []
        for span in layout:
            if isinstance(span, str):
                parts.append(span)
                continue
            number, leading, original_span, trailing = span
            text = decode(results[number])
            if not text or '<' in text or '>' in text or len(text) > 1500:
                text = original_span.strip()
            parts.append(leading + text + trailing)
        translated = ''.join(parts).strip()
        if not all(value.casefold() in translated.casefold() for value in required):
            translated = row['title']
        if translated and len(translated) <= 1500:
            existing[row['id']] = {'id': row['id'], 'original': row['title'], 'vi': translated}
    checkpoint()
    done = min(index + args.batch_size, len(rows))
    print(f'Translated batch {done}/{len(rows)}; saved {len(existing)} titles; elapsed {time.monotonic() - start:.0f}s', flush=True)
(DATA / 'translation-report.json').write_text(json.dumps({'model': 'VietAI/envit5-translation',
    'engine': 'CTranslate2 CPU int8', 'created_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'translated': len(existing), 'changed_titles': sum(row['vi'] != row['original'] for row in existing.values()), 'priced_source': sum(row['price'] is not None for row in source_rows),
    'notes': 'Machine translations for display; originals retained; no source database/index writes.'}, indent=2) + '\n')
