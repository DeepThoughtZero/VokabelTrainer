#!/usr/bin/env python3
"""Validate reviewed page extractions and build the browser vocabulary file."""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path


EXPECTED_PAGES = list(range(285, 319))


def correction_key(item: dict) -> tuple[int, str]:
    return int(item["page"]), str(item["foreign"])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=Path("/tmp/vokabelzombie-ollama"))
    parser.add_argument("--output", type=Path, default=Path("js/vocabs_en_6.js"))
    parser.add_argument(
        "--corrections",
        type=Path,
        default=Path(__file__).with_name("class6_corrections.json"),
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=Path(__file__).with_name("class6_import_report.json"),
    )
    args = parser.parse_args()

    corrections = json.loads(args.corrections.read_text(encoding="utf-8"))
    removals = {correction_key(item): item for item in corrections.get("remove", [])}
    replacements = {correction_key(item): item for item in corrections.get("replace", [])}
    deduplications = {correction_key(item): item for item in corrections.get("deduplicate", [])}

    rows = []
    page_counts = {}
    removed = []
    deduplicated = []
    source_manifest = json.loads(Path(__file__).with_name("class6_pages.json").read_text(encoding="utf-8"))
    source_by_page = {item["page"]: item for item in source_manifest["pages"]}

    for page in EXPECTED_PAGES:
        source = args.input / f"page-{page}.json"
        if not source.is_file():
            raise SystemExit(f"Missing reviewed extraction: {source}")
        data = json.loads(source.read_text(encoding="utf-8"))
        if data.get("page") != page or not isinstance(data.get("entries"), list):
            raise SystemExit(f"Invalid extraction structure: {source}")

        page_rows = []
        seen_deduplication_keys = set()
        for raw in data["entries"]:
            key = (page, str(raw.get("foreign", "")).strip())
            if key in removals:
                removed.append(removals[key])
                continue
            if key in replacements:
                replacement = replacements[key]
                raw = {**raw, **replacement.get("values", {})}

            row = {
                "foreign": str(raw.get("foreign", "")).strip(),
                "german": str(raw.get("german", "")).strip(),
                "unit": str(raw.get("unit", "")).strip(),
                "part": str(raw.get("part", "")).strip(),
                "page": page,
            }
            deduplication_key = (page, row["foreign"])
            if deduplication_key in deduplications:
                if deduplication_key in seen_deduplication_keys:
                    deduplicated.append(deduplications[deduplication_key])
                    continue
                seen_deduplication_keys.add(deduplication_key)
            page_rows.append(row)

        for index, row in enumerate(page_rows, start=1):
            vocab_id = f"en6-p{page}-{index:03d}"
            row["id"] = vocab_id
            row["audio"] = f"assets/audio/vocab/en-6/{vocab_id}.mp3"
            rows.append(row)
        page_counts[str(page)] = len(page_rows)

    errors = []
    for row in rows:
        if not row["foreign"] or not row["german"]:
            errors.append(f"Missing text: {row}")
        if not row["unit"]:
            errors.append(f"Missing unit: {row}")
        if re.search(r"\[[^]]+\]", row["foreign"]):
            errors.append(f"Pronunciation was not removed: {row}")
        if re.search(r"\bp\.\s*\d+", row["foreign"], re.IGNORECASE):
            errors.append(f"Printed page reference remains: {row}")
    ids = [row["id"] for row in rows]
    if len(ids) != len(set(ids)):
        errors.append("Duplicate stable IDs")
    if errors:
        raise SystemExit("\n".join(errors))

    duplicate_pairs = [
        {"foreign": foreign, "german": german, "count": count}
        for (foreign, german), count in Counter((row["foreign"], row["german"]) for row in rows).items()
        if count > 1
    ]
    output = (
        "// Generated from reviewed vocabulary pages 285-318.\n"
        "window.VOCABULARIES['en-6'] = "
        + json.dumps(rows, ensure_ascii=False, indent=2)
        + ";\n"
    )
    args.output.write_text(output, encoding="utf-8")

    report = {
        "courseId": "en-6",
        "pageRange": [285, 318],
        "uniquePages": len(EXPECTED_PAGES),
        "sourcePhotos": sum(1 + len(item.get("alternatives", [])) for item in source_manifest["pages"]),
        "entryCount": len(rows),
        "pageCounts": page_counts,
        "units": dict(Counter(row["unit"] for row in rows)),
        "parts": dict(Counter(row["part"] for row in rows)),
        "removedExtractionArtifacts": removed,
        "deduplicatedRepeatedRows": deduplicated,
        "duplicatePairs": duplicate_pairs,
        "sources": [
            {
                "page": page,
                "selected": source_by_page[page]["file"],
                "alternatives": source_by_page[page].get("alternatives", []),
            }
            for page in EXPECTED_PAGES
        ],
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Built {len(rows)} entries across {len(EXPECTED_PAGES)} pages")


if __name__ == "__main__":
    main()
