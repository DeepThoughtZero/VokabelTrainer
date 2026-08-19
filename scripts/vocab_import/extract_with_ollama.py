#!/usr/bin/env python3
"""Extract vocabulary table rows from prepared page images with Ollama vision."""

from __future__ import annotations

import argparse
import base64
import json
import re
import urllib.request
from pathlib import Path


PROMPT = """You transcribe one photographed vocabulary-book page into structured data.

The page number is {page}. Read the vocabulary table only:
- The left column contains the English headword or phrase, often followed by pronunciation in square brackets.
- The middle column contains its German translation.
- The right column contains examples, notes, etymology or illustrations and must NOT be copied into the translation.
- Blue Unit and Part headings determine unit and part for following rows. Rows before the first Unit heading continue the previous section; use the supplied context.
- Include irregular-verb and word-family table rows when they contain an English form and German meaning.
- Remove pronunciation/IPA in square brackets and printed p.-references from the English value.
- Preserve British spelling, punctuation, parentheses, slash alternatives, "sb.", "sth.", plural notes and infinitive marker "(to)" exactly.
- Do not invent, translate, correct or summarize anything.
- Join a wrapped table cell into one string.
- Every visible vocabulary row must appear exactly once.

Previous-page context: unit={previous_unit!r}, part={previous_part!r}.

Return only a JSON object with this exact shape:
{{"page": {page}, "endingUnit": "...", "endingPart": "...", "entries": [{{"foreign": "...", "german": "...", "unit": "...", "part": "..."}}]}}
Use an empty string for a missing part. Do not wrap the JSON in Markdown."""


def parse_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end < start:
        raise ValueError("Model response contains no JSON object")
    return json.loads(text[start : end + 1])


def request_page(endpoint: str, model: str, image_path: Path, page: int, previous_unit: str, previous_part: str) -> dict:
    payload = {
        "model": model,
        "stream": False,
        "think": False,
        "options": {"temperature": 0, "num_ctx": 32768},
        "messages": [
            {
                "role": "user",
                "content": PROMPT.format(
                    page=page,
                    previous_unit=previous_unit,
                    previous_part=previous_part,
                ),
                "images": [base64.b64encode(image_path.read_bytes()).decode("ascii")],
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
    content = body.get("message", {}).get("content", "")
    result = parse_json(content)
    result["_model"] = model
    result["_source"] = image_path.name
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--images", type=Path, default=Path("/tmp/vokabelzombie-pages"))
    parser.add_argument("--output", type=Path, default=Path("/tmp/vokabelzombie-ollama"))
    parser.add_argument("--endpoint", default="http://127.0.0.1:11434")
    parser.add_argument("--model", default="qwen3.8:27b")
    parser.add_argument("--from-page", type=int, default=285)
    parser.add_argument("--to-page", type=int, default=318)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    previous_unit = "Welcome back to Brighton"
    previous_part = ""
    for page in range(285, args.from_page):
        prior = args.output / f"page-{page}.json"
        if prior.is_file():
            data = json.loads(prior.read_text(encoding="utf-8"))
            previous_unit = data.get("endingUnit", previous_unit)
            previous_part = data.get("endingPart", previous_part)

    for page in range(args.from_page, args.to_page + 1):
        image_path = args.images / f"page-{page}.jpg"
        destination = args.output / f"page-{page}.json"
        if not image_path.is_file():
            raise FileNotFoundError(image_path)
        print(f"Extracting page {page} ...", flush=True)
        data = request_page(args.endpoint, args.model, image_path, page, previous_unit, previous_part)
        if data.get("page") != page or not isinstance(data.get("entries"), list):
            raise ValueError(f"Unexpected response structure for page {page}")
        for entry in data["entries"]:
            entry["page"] = page
        destination.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        previous_unit = data.get("endingUnit", previous_unit)
        previous_part = data.get("endingPart", previous_part)
        print(f"Page {page}: {len(data['entries'])} entries", flush=True)


if __name__ == "__main__":
    main()
