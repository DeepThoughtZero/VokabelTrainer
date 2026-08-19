#!/usr/bin/env python3
"""Round-trip vocabulary audio through the local SPEACHES Whisper API.

This is a content smoke test, not a phonetics exam: it reliably catches gross
TTS hallucinations, missing words and long off-topic speech. Very short words
and homophones can still require human review.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import datetime as dt
import difflib
import json
import os
import re
import subprocess
import sys
import time
import unicodedata
import urllib.request
import uuid
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MODEL = "deepdml/faster-whisper-large-v3-turbo-ct2"
HOMOPHONES = {
    "to": "two",
    "too": "two",
    "for": "four",
    "won": "one",
    "write": "right",
    "sea": "see",
    "whether": "weather",
    "queue": "cue",
    "q": "cue",
    "shoo": "shoe",
    "buy": "bye",
    "by": "bye",
    "scene": "seen",
    "hooray": "hurray",
    "where": "wear",
    "pee": "pea",
    "p": "pea",
    "lamm": "lamb",
    "shown": "shone",
    "few": "phew",
    "mary": "merry",
}
SPELLING_EQUIVALENTS = {
    "colour": "color",
    "colourful": "colorful",
    "favourite": "favorite",
    "neighbour": "neighbor",
    "centre": "center",
    "theatre": "theater",
    "travelling": "traveling",
    "grey": "gray",
}
NOISE_WORDS = {"ugh", "uh", "um", "hmm", "mm", "mmm", "ahem", "heh", "haha"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--course", default="en-6", choices=["en-6"])
    parser.add_argument("--id", action="append", dest="ids", help="Only verify this audio id (repeatable)")
    parser.add_argument("--limit", type=int, default=0, help="Only verify the first N selected entries")
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument(
        "--report",
        default="scripts/vocab_import/class6_audio_stt_report.json",
    )
    parser.add_argument("--url", default=os.environ.get("SPEACHES_URL", "http://127.0.0.1:8000"))
    parser.add_argument("--model", default=os.environ.get("SPEACHES_MODEL", DEFAULT_MODEL))
    return parser.parse_args()


def load_vocabulary() -> list[dict]:
    source = (ROOT / "js/vocabs_en_6.js").read_text(encoding="utf-8")
    assignment = re.search(r"=\s*(\[.*\])\s*;\s*$", source, flags=re.DOTALL)
    if not assignment:
        raise RuntimeError("Die Englisch-6-Vokabeldatei konnte nicht gelesen werden.")
    return json.loads(assignment.group(1))


def get_api_key() -> str:
    key = os.environ.get("SPEACHES_API_KEY") or os.environ.get("API_KEY")
    if key:
        return key
    try:
        return subprocess.check_output(
            ["docker", "exec", "speaches", "printenv", "API_KEY"],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except (OSError, subprocess.CalledProcessError) as error:
        raise RuntimeError(
            "Kein SPEACHES_API_KEY/API_KEY gesetzt und API_KEY konnte nicht aus dem Container gelesen werden."
        ) from error


def prepare_spoken_text(foreign: str) -> str:
    text = foreign
    replacements = {
        "(to)": "to",
        "(a club)": "a club",
        "(sb.)": "somebody",
        "(on sth.)": "on something",
        "(to sb.)": "to somebody",
        "(sth. to sth.)": "something to something",
        "(to sth./sb.)": "to something or somebody",
        "(for)": "for",
        "(in)": "in",
        "(of)": "of",
        "(gram)": "gram",
        "(pl teeth)": "plural teeth",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    text = re.sub(r"\([^)]*\)", "", text)
    text = re.sub(r"\bsth\.", "something", text)
    text = re.sub(r"\bsb\.", "somebody", text)
    text = re.sub(r"\bpl\b", "plural", text)
    text = text.replace("/", " or ")
    return re.sub(r"\s+", " ", text).strip()


def normalize_words(text: str) -> list[str]:
    value = unicodedata.normalize("NFKC", text).lower().replace("’", "'")
    value = re.sub(r"\bfor\s+ever\b", "forever", value)
    value = re.sub(r"\ball\s+together\b", "altogether", value)
    words = re.findall(r"[a-z]+(?:'[a-z]+)?", value)
    return [HOMOPHONES.get(SPELLING_EQUIVALENTS.get(word, word), SPELLING_EQUIVALENTS.get(word, word)) for word in words]


def compare_text(expected: str, transcript: str) -> tuple[str, float, float]:
    expected_words = normalize_words(expected)
    actual_words = normalize_words(transcript)
    if not expected_words or not actual_words:
        return "fail", 0.0, 0.0

    variants = [expected_words]
    if expected_words[0] == "two" and len(expected_words) > 1:
        variants.append(expected_words[1:])

    best_ratio = 0.0
    best_coverage = 0.0
    exact = False
    for variant in variants:
        exact = exact or variant == actual_words or "".join(variant) == "".join(actual_words)
        ratio = difflib.SequenceMatcher(None, " ".join(variant), " ".join(actual_words)).ratio()
        matched = sum(1 for word in variant if word in actual_words)
        coverage = matched / max(len(variant), len(actual_words))
        best_ratio = max(best_ratio, ratio)
        best_coverage = max(best_coverage, coverage)

    has_noise = any(word in NOISE_WORDS or word == "ha" for word in actual_words)
    repeated_noise = any(actual_words.count(word) >= 4 for word in set(actual_words))
    if exact:
        return ("review" if has_noise else "pass"), best_ratio, best_coverage
    if len(expected_words) <= 2:
        status = "review" if best_ratio >= 0.58 and best_coverage >= 0.5 else "fail"
    elif best_ratio >= 0.78 and best_coverage >= 0.7:
        status = "pass"
    elif best_ratio >= 0.55 and best_coverage >= 0.45:
        status = "review"
    else:
        status = "fail"
    if repeated_noise:
        status = "fail"
    elif has_noise and status == "pass":
        status = "review"
    return status, best_ratio, best_coverage


def multipart_body(fields: dict[str, str], file_path: Path) -> tuple[bytes, str]:
    boundary = f"----vokabelzombie-{uuid.uuid4().hex}"
    chunks: list[bytes] = []
    for name, value in fields.items():
        chunks.append(f"--{boundary}\r\n".encode())
        chunks.append(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
        chunks.append(value.encode("utf-8"))
        chunks.append(b"\r\n")
    chunks.append(f"--{boundary}\r\n".encode())
    chunks.append(
        f'Content-Disposition: form-data; name="file"; filename="{file_path.name}"\r\n'.encode()
    )
    chunks.append(b"Content-Type: audio/mpeg\r\n\r\n")
    chunks.append(file_path.read_bytes())
    chunks.append(b"\r\n")
    chunks.append(f"--{boundary}--\r\n".encode())
    return b"".join(chunks), boundary


def transcribe(url: str, model: str, api_key: str, file_path: Path) -> dict:
    body, boundary = multipart_body(
        {
            "model": model,
            "language": "en",
            "response_format": "verbose_json",
            "timestamp_granularities[]": "word",
        },
        file_path,
    )
    request = urllib.request.Request(
        f"{url.rstrip('/')}/v1/audio/transcriptions",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.load(response)


def verify_entry(entry: dict, args: argparse.Namespace, api_key: str, overrides: dict) -> dict:
    audio_path = ROOT / entry["audio"]
    result = {
        "id": entry["id"],
        "foreign": entry["foreign"],
        "audio": entry["audio"],
    }
    if not audio_path.is_file():
        return {**result, "status": "fail", "error": "audio_missing"}
    try:
        response = transcribe(args.url, args.model, api_key, audio_path)
        transcript = str(response.get("text", "")).strip()
        expected = prepare_spoken_text(entry["foreign"])
        status, similarity, coverage = compare_text(expected, transcript)
        probabilities = [float(word.get("probability", 0)) for word in response.get("words", [])]
        confidence = sum(probabilities) / len(probabilities) if probabilities else None
        result.update(
            {
                "status": status,
                "expectedSpoken": expected,
                "transcript": transcript,
                "similarity": round(similarity, 3),
                "wordCoverage": round(coverage, 3),
                "meanWordProbability": round(confidence, 3) if confidence is not None else None,
            }
        )
        if entry["id"] in overrides:
            result["automaticStatus"] = result["status"]
            result["status"] = "context_verified"
            result["verificationOverride"] = overrides[entry["id"]]
        return result
    except Exception as error:  # Keep the full batch useful when one request fails.
        return {**result, "status": "error", "error": str(error)}


def main() -> int:
    args = parse_args()
    vocabulary = load_vocabulary()
    selected_ids = set(args.ids or [])
    entries = [entry for entry in vocabulary if not selected_ids or entry["id"] in selected_ids]
    if args.limit:
        entries = entries[: args.limit]
    if not entries:
        raise SystemExit("Keine passenden Vokabeln gefunden.")

    overrides_path = ROOT / "scripts/vocab_import/audio_verification_overrides.json"
    overrides = json.loads(overrides_path.read_text(encoding="utf-8")) if overrides_path.exists() else {}
    api_key = get_api_key()
    started = time.time()
    results: list[dict] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
        futures = {
            executor.submit(verify_entry, entry, args, api_key, overrides): entry for entry in entries
        }
        for index, future in enumerate(concurrent.futures.as_completed(futures), 1):
            result = future.result()
            results.append(result)
            print(
                f"[{index:03d}/{len(entries):03d}] {result['id']}: {result['status']}"
                f" — {result.get('transcript', result.get('error', ''))}",
                file=sys.stderr,
                flush=True,
            )

    order = {entry["id"]: index for index, entry in enumerate(entries)}
    results.sort(key=lambda item: order[item["id"]])
    counts: dict[str, int] = {}
    for result in results:
        counts[result["status"]] = counts.get(result["status"], 0) + 1
    report = {
        "courseId": args.course,
        "model": args.model,
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
        "checked": len(results),
        "counts": counts,
        "durationSeconds": round(time.time() - started, 2),
        "limitations": "Whisper round-trip is a heuristic; short words and homophones may require review.",
        "results": results,
    }
    report_path = ROOT / args.report
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"report": str(report_path.relative_to(ROOT)), **report["counts"]}, ensure_ascii=False))
    return 1 if counts.get("error") or counts.get("fail") else 0


if __name__ == "__main__":
    raise SystemExit(main())
