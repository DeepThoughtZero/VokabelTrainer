#!/usr/bin/env python3
"""Second-pass visual audit of extracted vocabulary rows."""

from __future__ import annotations

import argparse
import base64
import json
import re
import time
import urllib.request
from pathlib import Path


PROMPT = """Audit the extracted vocabulary rows against the photographed book page.

Page: {page}

Rules:
- Compare every row in the left English column with its German cell in the middle column.
- Ignore pronunciation in square brackets, p.-references, the right-hand examples/notes and illustrations.
- Irregular simple-past forms printed below a headword are not separate rows.
- Report missing rows, extra rows, spelling/punctuation differences, wrong German pairings, and wrong Unit/Part assignments.
- Preserve the book's exact British spelling, parentheses, slash variants, sb., sth. and plural notes.
- Do not suggest stylistic improvements or new translations.

Current extraction:
{entries}

Return only JSON with this exact shape:
{{"page": {page}, "status": "ok" or "corrections", "missing": [{{"foreign":"...","german":"...","unit":"...","part":"..."}}], "remove": ["exact current foreign value"], "replace": [{{"matchForeign":"exact current foreign value","values":{{"foreign":"...","german":"...","unit":"...","part":"..."}}}}], "notes": ["..."]}}
Use empty arrays when nothing needs changing. No Markdown."""


def parse_json(text: str) -> dict:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return json.loads(text[text.find("{") : text.rfind("}") + 1])


def audit_page(endpoint: str, model: str, image: Path, extraction: dict) -> dict:
    page = extraction["page"]
    prompt = PROMPT.format(
        page=page,
        entries=json.dumps(extraction["entries"], ensure_ascii=False),
    )
    payload = {
        "model": model,
        "stream": False,
        "think": False,
        "options": {"temperature": 0, "num_ctx": 32768},
        "messages": [
            {
                "role": "user",
                "content": prompt,
                "images": [base64.b64encode(image.read_bytes()).decode("ascii")],
            }
        ],
    }
    request = urllib.request.Request(
        endpoint.rstrip("/") + "/api/chat",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=600) as response:
        body = json.load(response)
    return parse_json(body.get("message", {}).get("content", ""))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--images", type=Path, default=Path("/tmp/vokabelzombie-pages"))
    parser.add_argument("--extractions", type=Path, default=Path("/tmp/vokabelzombie-ollama"))
    parser.add_argument("--output", type=Path, default=Path("/tmp/vokabelzombie-audit"))
    parser.add_argument("--endpoint", default="http://127.0.0.1:11434")
    parser.add_argument("--model", default="qwen3.8:27b")
    parser.add_argument("--from-page", type=int, default=285)
    parser.add_argument("--to-page", type=int, default=318)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    for page in range(args.from_page, args.to_page + 1):
        extraction_path = args.extractions / f"page-{page}.json"
        image_path = args.images / f"page-{page}.jpg"
        destination = args.output / f"page-{page}.json"
        extraction = json.loads(extraction_path.read_text(encoding="utf-8"))
        print(f"Auditing page {page} ...", flush=True)
        error = None
        for attempt in range(1, 4):
            try:
                result = audit_page(args.endpoint, args.model, image_path, extraction)
                destination.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                change_count = sum(len(result.get(key, [])) for key in ("missing", "remove", "replace"))
                print(f"Page {page}: {result.get('status')} ({change_count} proposed changes)", flush=True)
                break
            except Exception as exc:
                error = exc
                print(f"Page {page}: attempt {attempt} failed: {exc}", flush=True)
                time.sleep(attempt * 2)
        else:
            raise SystemExit(f"Audit failed for page {page}: {error}")


if __name__ == "__main__":
    main()
