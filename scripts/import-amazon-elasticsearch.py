#!/usr/bin/env python3
"""Import the validated academic catalog into the local TLS Elasticsearch only."""
import base64
import hashlib
import json
import pathlib
import ssl
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / "data/amazon-2023"
URL = "https://localhost:9200"
ALIAS = "shopbase-amazon-catalog"


def main():
    manifest = json.loads((DATA / "manifest.json").read_text())
    source = DATA / "products.jsonl"
    with source.open("rb") as file:
        digest = hashlib.file_digest(file, "sha256").hexdigest()
    if digest != manifest["sha256"]:
        raise ValueError("Dataset SHA-256 mismatch")
    with source.open(encoding="utf-8") as file:
        records = [json.loads(line) for line in file]
    if len(records) != manifest["products"] or len({item["id"] for item in records}) != len(records):
        raise ValueError("Dataset count/uniqueness mismatch")
    password = (DATA / ".elasticsearch.password").read_text().strip()
    context = ssl.create_default_context(cafile=str(DATA / "elasticsearch-ca.crt"))
    authorization = "Basic " + base64.b64encode(("elastic:" + password).encode()).decode()

    def request(method, path, body=None, ndjson=False, missing_ok=False):
        payload = body.encode() if ndjson else json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(URL + path, data=payload, method=method, headers={
            "Authorization": authorization,
            "Content-Type": "application/x-ndjson" if ndjson else "application/json",
        })
        try:
            with urllib.request.urlopen(req, context=context, timeout=60) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if missing_ok and error.code == 404:
                return {"indices": [], "aliases": []}
            # Do not print response bodies that could include security data.
            raise RuntimeError(f"Elasticsearch HTTP {error.code} for {method} {path}") from None

    index = "shopbase-amazon-" + digest[:12]
    properties = {
        "id": {"type": "keyword"},
        "title": {"type": "text", "fields": {"folded": {"type": "text", "analyzer": "folded"}, "raw": {"type": "keyword", "ignore_above": 500}}},
        "category": {"type": "keyword"},
        "category_name_vi": {"type": "text", "analyzer": "folded"},
        "source_categories": {"type": "keyword"},
        "description": {"type": "text", "analyzer": "folded"},
        "features": {"type": "text", "analyzer": "folded"},
        "price": {"type": "double"}, "currency": {"type": "keyword"},
        "images": {"type": "keyword", "index": False, "doc_values": False},
        "store": {"type": "keyword"}, "average_rating": {"type": "float"},
        "source": {"type": "keyword"},
        "suggest_text": {"type": "search_as_you_type", "analyzer": "folded"},
    }
    existing = request("GET", "/_resolve/index/" + index + "?expand_wildcards=all", missing_ok=True)
    if not existing["indices"]:
        request("PUT", "/" + index, {
            "settings": {"number_of_shards": 1, "number_of_replicas": 0,
                         "analysis": {"analyzer": {"folded": {"type": "custom", "tokenizer": "standard", "filter": ["lowercase", "asciifolding"]}}}},
            "mappings": {"dynamic": "strict", "_meta": {"dataset_sha256": digest, "academic_fixture": True}, "properties": properties},
        })
    else:
        mapping = request("GET", "/" + index + "/_mapping")
        if mapping[index]["mappings"].get("_meta", {}).get("dataset_sha256") != digest:
            raise ValueError("Existing index belongs to a different dataset")
    for offset in range(0, len(records), 500):
        lines = []
        for item in records[offset:offset + 500]:
            document = {**item, "suggest_text": [item["title"], item["category_name_vi"]]}
            lines.extend([json.dumps({"index": {"_index": index, "_id": item["id"]}}), json.dumps(document, ensure_ascii=False, allow_nan=False)])
        result = request("POST", "/_bulk", "\n".join(lines) + "\n", ndjson=True)
        if result.get("errors"):
            raise RuntimeError("Bulk import failed; alias not switched")
        print(f"Indexed {min(offset + 500, len(records))}/{len(records)}", flush=True)
    request("POST", "/" + index + "/_refresh")
    count = request("GET", "/" + index + "/_count")["count"]
    if count != len(records):
        raise ValueError("Index count differs from dataset")
    aliases = request("GET", "/_resolve/index/" + ALIAS + "?expand_wildcards=all", missing_ok=True)
    old = [name for entry in aliases.get("aliases", []) for name in entry["indices"]]
    actions = [{"remove": {"index": name, "alias": ALIAS}} for name in old if name != index]
    actions.append({"add": {"index": index, "alias": ALIAS}})
    request("POST", "/_aliases", {"actions": actions})
    tests = {}
    for query in ("điện tử", "dien tu", "kitchen"):
        results = request("POST", "/" + ALIAS + "/_search", {"size": 3, "query": {"multi_match": {"query": query, "type": "bool_prefix", "fields": ["suggest_text", "suggest_text._2gram", "suggest_text._3gram"]}}})
        tests[query] = results["hits"]["total"]["value"]
    if not tests["điện tử"] or tests["điện tử"] != tests["dien tu"] or not tests["kitchen"]:
        raise ValueError("Search smoke checks failed")
    request("POST", "/" + index + "/_flush")
    report = {"alias": ALIAS, "index": index, "products": count,
              "dataset_sha256": digest, "search_checks": tests,
              "store_bytes": request("GET", "/" + index + "/_stats/store")["_all"]["primaries"]["store"]["size_in_bytes"]}
    (DATA / "elasticsearch-import-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
