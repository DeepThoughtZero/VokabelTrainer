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
    get_api_key,
    load_vocabulary,
    normalize_words,
    prepare_spoken_text,
    transcribe,
)


CONTEXT_PREFIXES = {
    "en6-p290-016": (
        "One man is called a gentleman. Two men are called gentlemen. "
    ),
    "en6-p295-004": (
        "One woman from the Stone Age is a cavewoman. Several are cavewomen. "
    ),
    "en6-p308-020": (
        "The verb has the forms beat, beat, beaten. "
    ),
}

SEGMENT_PLANS = {
    "en6-p290-016": [
        ("gentleman", "A polite man is a gentleman. The target word is gentleman."),
        ("plural", "The grammar label is plural. The target word is plural."),
        ("gentlemen", "The polite men are gentlemen. The target word is gentlemen."),
    ],
    "en6-p295-004": [
        ("cavewoman", "One Stone Age woman is a cavewoman. The target word is cavewoman."),
        ("plural", "The grammar label is plural. The target word is plural."),
        ("cavewomen", "Several Stone Age women are cavewomen. The target word is cavewomen."),
    ],
    "en6-p308-020": [
        ("to beat", "I want to beat the drum. The target expression is to beat."),
        ("beat", "Yesterday we beat the other team. The target word is beat."),
        ("beaten", "The record was beaten. The target word is beaten."),
    ],
}


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


def synthesize_context(
    args: argparse.Namespace,
    text: str,
    output: Path,
    instruction: str = "",
) -> None:
    payload = json.dumps(
        {
            "model": "qwen3-tts",
            "input": text,
            "voice": args.voice,
            "language": "english",
            "instruct": (
                "Speak this sentence clearly in standard British English. "
                "Articulate the target vocabulary expression especially carefully. "
                + instruction
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
    expected_words = normalize_words(expected)
    actual_words = normalize_words(transcript)
    variants = [expected_words]
    if expected_words and expected_words[0] == "two" and len(expected_words) > 1:
        variants.append(expected_words[1:])
    exact = any(
        variant == actual_words or "".join(variant) == "".join(actual_words)
        for variant in variants
    )
    probabilities = [float(item.get("probability", 0)) for item in target_words]
    confidence = sum(probabilities) / len(probabilities) if probabilities else 0.0
    if not exact:
        return None
    start = max(0.0, float(target_words[0]["start"]) - 0.04)
    end = float(target_words[-1]["end"]) + 0.1
    return start, end, transcript, confidence


def find_exact_span(response: dict, expected: str) -> tuple[float, float, str, float] | None:
    words = response.get("words") or []
    expected_words = normalize_words(expected)
    flattened: list[str] = []
    source_indices: list[int] = []
    for index, word in enumerate(words):
        for token in normalize_words(str(word.get("word", ""))):
            flattened.append(token)
            source_indices.append(index)
    matches: list[tuple[int, int]] = []
    expected_compact = "".join(expected_words)
    for start in range(len(flattened)):
        maximum_end = min(len(flattened), start + len(expected_words) + 2)
        for end in range(start + 1, maximum_end + 1):
            candidate = flattened[start:end]
            if candidate == expected_words or "".join(candidate) == expected_compact:
                matches.append((source_indices[start], source_indices[end - 1]))
    if not matches:
        return None
    first, last = matches[-1]
    selected = words[first : last + 1]
    transcript = " ".join(str(item.get("word", "")).strip() for item in selected).strip()
    probabilities = [float(item.get("probability", 0)) for item in selected]
    confidence = sum(probabilities) / len(probabilities) if probabilities else 0.0
    start_seconds = max(0.0, float(selected[0]["start"]) - 0.04)
    end_seconds = float(selected[-1]["end"]) + 0.12
    return start_seconds, end_seconds, transcript, confidence


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


def concatenate_audio(sources: list[Path], destination: Path) -> None:
    command = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error"]
    for source in sources:
        command.extend(["-i", str(source)])
    inputs = "".join(f"[{index}:a]" for index in range(len(sources)))
    command.extend(
        [
            "-filter_complex",
            f"{inputs}concat=n={len(sources)}:v=0:a=1,loudnorm=I=-16:TP=-1.5:LRA=11[out]",
            "-map",
            "[out]",
            str(destination),
        ]
    )
    subprocess.run(command, check=True)


def regenerate_from_segments(
    args: argparse.Namespace,
    entry_id: str,
    entry: dict,
    api_key: str,
    temp_dir: Path,
) -> dict | None:
    evidence: list[dict] = []
    cropped: list[Path] = []
    for segment_index, (target, context_text) in enumerate(SEGMENT_PLANS[entry_id], 1):
        verified = False
        for attempt in range(1, args.attempts + 1):
            context_audio = temp_dir / f"{entry_id}-segment-{segment_index}-context.mp3"
            segment_audio = temp_dir / f"{entry_id}-segment-{segment_index}.mp3"
            synthesize_context(
                args,
                context_text,
                context_audio,
                f"The final target is exactly: {target}.",
            )
            response = transcribe(args.speaches_url, args.model, api_key, context_audio)
            span = find_exact_span(response, target)
            if not span:
                print(f"    {entry_id}/{target}: Versuch {attempt} nicht eindeutig")
                continue
            start, end, transcript, confidence = span
            crop_audio(context_audio, segment_audio, start, end)
            cropped.append(segment_audio)
            evidence.append(
                {
                    "target": target,
                    "sourceText": context_text,
                    "sourceTranscript": str(response.get("text", "")).strip(),
                    "targetTranscript": transcript,
                    "sourceWordProbability": round(confidence, 6),
                    "cropSeconds": [round(start, 3), round(end, 3)],
                }
            )
            verified = True
            break
        if not verified:
            return None
    concatenate_audio(cropped, ROOT / entry["audio"])
    return {
        "method": "context_verified_segment_concat",
        "segments": evidence,
        "reason": (
            "Singular/plural or verb forms remained ambiguous as one TTS phrase. "
            "Every segment was generated and word-exactly verified in semantic context before concatenation."
        ),
    }


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
            if entry_id in SEGMENT_PLANS:
                override = regenerate_from_segments(args, entry_id, entry, api_key, temp_dir)
                if override:
                    overrides[entry_id] = override
                    overrides_path.write_text(
                        json.dumps(overrides, ensure_ascii=False, indent=2) + "\n",
                        encoding="utf-8",
                    )
                    print(f"[{current:02d}/{len(selected):02d}] {entry_id}: OK — segmentweise verifiziert")
                else:
                    failures.append(entry_id)
                continue
            context_text = (
                CONTEXT_PREFIXES.get(entry_id, "")
                + f"The vocabulary expression is: {expected}."
            )
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
