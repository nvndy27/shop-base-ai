#!/usr/bin/env python3
"""Download VietAI model data and convert to a local int8 CPU translation model."""
import hashlib
import json
import os
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEST = ROOT / 'data/amazon-2023/envit5-model'
MODEL = 'VietAI/envit5-translation'
REVISION = '840bc88104d5a4277af740eaedb024df8c3093e7'
DEST.mkdir(parents=True, exist_ok=True)
os.environ.setdefault('HF_HOME', str(DEST / 'cache'))
from huggingface_hub import snapshot_download
from ctranslate2.converters import TransformersConverter
print('Downloading VietAI English-Vietnamese model data...', flush=True)
source = snapshot_download(MODEL, revision=REVISION, local_dir=DEST / 'source',
    allow_patterns=['config.json', 'pytorch_model.bin', 'tokenizer_config.json', 'special_tokens_map.json',
                    'tokenizer.json', 'spiece.model', 'added_tokens.json', 'README.md', 'LICENSE*'])
model = DEST / 'int8'
if not model.exists():
    print('Converting model to int8...', flush=True)
    # Built-in Transformers classes only. Never execute repository model code.
    TransformersConverter(source, load_as_float16=True, trust_remote_code=False).convert(str(model), quantization='int8')
files = {}
for file in pathlib.Path(source).glob('*'):
    if file.is_file() and file.suffix in {'.bin', '.model', '.json'}:
        digest = hashlib.sha256()
        with file.open('rb') as stream:
            while chunk := stream.read(1024 * 1024):
                digest.update(chunk)
        files[file.name] = {'bytes': file.stat().st_size, 'sha256': digest.hexdigest()}
(DEST / 'source.json').write_text(json.dumps({'model': MODEL, 'revision': REVISION, 'license': 'OpenRAIL', 'files': files}, indent=2) + '\n')
print('Local translation model ready.', flush=True)
