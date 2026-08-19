#!/usr/bin/env python3
"""Regenerate stubborn short TTS clips in an unambiguous sentence context.

The context is transcribed with SPEACHES word timestamps. Only the verified
target span is cropped into the game's MP3, and the evidence is written to the
audio verification overrides file.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from verify_audio_speaches import (  # noqa: E402
    DEFAULT_MODEL,
    compare_text,
    get_api_key,
    load_vocabulary,
    normalize_words,
    prepare_spoken_text,
    transcribe,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--report",
        default="scripts/vocab_import/class6_audio_stt_report.json",
        help="Regenerate entries currently marked fail or review in this report",
    )
    parser.add_argument("--id", action="append", dest="ids")
    parser.add_argument("--voice", default="ryan")
    parser.add_argument("--tts-url", default="http://127.0.0.1:8880")
    parser.add_argument("--speaches-url", default="http://127.0.0.1:8000")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--attempts", type=int, default=5)
    return parser.parse_args()


def synthesize_context(args: argparse.Namespace, text: str, output: Path) -> None:
    payload = json.dumps(
        {
            "model": "qwen3-tts",
            "input": text,
            "voice": args.voice,
            "language": "english",
            "instruct": (
                "Speak this sentence clearly in standard British English. "
                "Articulate the quoted vocabulary expression especially carefully."
            ),
            "response_format": "mp3",
            "speed": 0.9,
        }
    ).encode()
    request = urllib.request.Request(
        f"{args.tts_url.rstrip('/')}/v1/audio/speech",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        output.write_bytes(response.read())


def target_span(response: dict, expected: str) -> tuple[float, float, str, float] | None:
    words = response.get("words") or []
    canonical = [normalize_words(str(item.get("word", ""))) for item in words]
    flattened = [tokens[0] if tokens else "" for tokens in canonical]
    prefix = ["the", "vocabulary", "expression", "is"]
    prefix_end = None
    for index in range(len(flattened) - len(prefix) + 1):
        if flattened[index : index + len(prefix)] == prefix:
            prefix_end = index + len(prefix)
            break
    if prefix_end is None or prefix_end >= len(words):
        return None

    target_words = words[prefix_end:]
    transcript = " ".join(str(item.get("word", "")).strip() for item in target_words).strip()
    status, _, _ = compare_text(expected, transcript)
    probabilities = [float(item.get("probability", 0)) for item in target_words]
    confidence = sum(probabilities) / len(probabilities) if probabilities else 0.0
    if status != "pass":
        return None
    start = max(0.0, float(target_words[0]["start"]) - 0.04)
    end = float(target_words[-1]["end"]) + 0.1
    return start, end, transcript, confidence


def crop_audio(source: Path, destination: Path, start: float, end: float) -> None:
    duration = max(0.2, end - start)
    fade_out_start = max(0.0, duration - 0.05)
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-ss",
            f"{start:.3f}",
            "-to",
            f"{end:.3f}",
            "-i",
            str(source),
            "-af",
            f"afade=t=in:st=0:d=0.015,afade=t=out:st={fade_out_start:.3f}:d=0.05,loudnorm=I=-16:TP=-1.5:LRA=11",
            str(destination),
        ],
        check=True,
    )


def main() -> int:
    args = parse_args()
    report_path = ROOT / args.report
    report = json.loads(report_path.read_text(encoding="utf-8"))
    selected = set(args.ids or [])
    if not selected:
        selected = {
            item["id"]
            for item in report.get("results", [])
            if item.get("status") in {"fail", "review"}
        }
    vocabulary = {item["id"]: item for item in load_vocabulary()}
    overrides_path = ROOT / "scripts/vocab_import/audio_verification_overrides.json"
    overrides = json.loads(overrides_path.read_text(encoding="utf-8")) if overrides_path.exists() else {}
    api_key = get_api_key()
    failures: list[str] = []

    with tempfile.TemporaryDirectory(prefix="vokabelzombie-context-") as temporary:
        temp_dir = Path(temporary)
        for current, entry_id in enumerate(sorted(selected), 1):
            entry = vocabulary[entry_id]
            expected = prepare_spoken_text(entry["foreign"])
            context_text = f"The vocabulary expression is: {expected}."
            success = False
            for attempt in range(1, args.attempts + 1):
                context_audio = temp_dir / f"{entry_id}-context.mp3"
                synthesize_context(args, context_text, context_audio)
                response = transcribe(args.speaches_url, args.model, api_key, context_audio)
                span = target_span(response, expected)
                if not span:
                    print(f"[{current:02d}/{len(selected):02d}] {entry_id}: Versuch {attempt} nicht eindeutig")
                    continue
                start, end, target_transcript, confidence = span
                destination = ROOT / entry["audio"]
                crop_audio(context_audio, destination, start, end)
                overrides[entry_id] = {
                    "method": "context_word_timestamp_crop",
                    "sourceText": context_text,
                    "sourceTranscript": str(response.get("text", "")).strip(),
                    "targetTranscript": target_transcript,
                    "sourceWordProbability": round(confidence, 6),
                    "cropSeconds": [round(start, 3), round(end, 3)],
                    "reason": (
                        "The isolated expression was persistently ambiguous or unstable. "
                        "It was verified in explicit context before cropping."
                    ),
                }
                overrides_path.write_text(
                    json.dumps(overrides, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8",
                )
                print(
                    f"[{current:02d}/{len(selected):02d}] {entry_id}: OK — {target_transcript} "
                    f"({confidence:.1%})"
                )
                success = True
                break
            if not success:
                failures.append(entry_id)

    if failures:
        print("Nicht kontextverifiziert: " + ", ".join(failures), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
