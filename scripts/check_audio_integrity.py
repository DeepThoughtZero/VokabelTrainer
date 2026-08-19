#!/usr/bin/env python3
"""Prüft die Englisch-6-Audios ohne Netzwerkzugriff oder TTS-Neuerzeugung."""

from __future__ import annotations

import argparse
import concurrent.futures
import datetime as dt
import json
import re
import subprocess
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
VOCAB_FILE = ROOT / "js/vocabs_en_6.js"
AUDIO_DIR = ROOT / "assets/audio/vocab/en-6"
REPORT_FILE = ROOT / "scripts/vocab_import/class6_audio_stt_report.json"
EXPECTED_COUNT = 869


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--require-stt-clean",
        action="store_true",
        help="Verlange einen aktuellen Vollbericht nur mit pass/context_verified.",
    )
    parser.add_argument("--workers", type=int, default=8)
    return parser.parse_args()


def load_vocabulary() -> list[dict]:
    source = VOCAB_FILE.read_text(encoding="utf-8")
    match = re.search(r"=\s*(\[.*\])\s*;\s*$", source, flags=re.DOTALL)
    if not match:
        raise RuntimeError(f"Vokabeldaten sind nicht lesbar: {VOCAB_FILE.relative_to(ROOT)}")
    return json.loads(match.group(1))


def expected_max_duration(entry: dict) -> float:
    word_count = max(1, len(str(entry["foreign"]).split()))
    generation_limit = max(4.0, word_count * 0.75 + 2.5)
    # Der Integritätscheck ist absichtlich toleranter als die Neuerzeugung:
    # bestehende, inhaltlich per STT bestätigte Clips dürfen Sprechpausen haben,
    # grobe Endlosschleifen bleiben durch Faktor und 10-Sekunden-Hardlimit blockiert.
    return min(10.0, max(5.0, generation_limit * 1.5))


def probe(entry: dict) -> str | None:
    relative = Path(entry["audio"])
    path = ROOT / relative
    if not path.is_file():
        return f"fehlt: {relative}"
    size = path.stat().st_size
    if size < 1000:
        return f"zu klein ({size} Bytes): {relative}"
    try:
        output = subprocess.check_output(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(path),
            ],
            text=True,
            stderr=subprocess.STDOUT,
            timeout=20,
        )
        duration = float(output.strip())
    except (OSError, ValueError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
        return f"nicht lesbar ({error}): {relative}"
    maximum = expected_max_duration(entry)
    if not 0.2 <= duration <= maximum:
        return f"unplausible Dauer {duration:.3f}s (erlaubt 0.2–{maximum:.1f}s): {relative}"
    return None


def parse_timestamp(value: str) -> dt.datetime:
    return dt.datetime.fromisoformat(value.replace("Z", "+00:00"))


def validate_report(entries: list[dict]) -> list[str]:
    errors: list[str] = []
    if not REPORT_FILE.is_file():
        return [f"STT-Bericht fehlt: {REPORT_FILE.relative_to(ROOT)}"]
    report = json.loads(REPORT_FILE.read_text(encoding="utf-8"))
    results = report.get("results", [])
    expected_ids = [entry["id"] for entry in entries]
    result_ids = [item.get("id") for item in results]
    if report.get("courseId") != "en-6":
        errors.append("STT-Bericht gehört nicht zum Kurs en-6.")
    if report.get("checked") != EXPECTED_COUNT or len(results) != EXPECTED_COUNT:
        errors.append(
            f"STT-Bericht ist unvollständig: checked={report.get('checked')}, Ergebnisse={len(results)}."
        )
    if set(result_ids) != set(expected_ids):
        missing = sorted(set(expected_ids) - set(result_ids))
        extra = sorted(set(result_ids) - set(expected_ids))
        errors.append(f"STT-IDs weichen ab; fehlend={missing[:8]}, zusätzlich={extra[:8]}.")
    unresolved = [
        f"{item.get('id')}={item.get('status')}"
        for item in results
        if item.get("status") not in {"pass", "context_verified"}
    ]
    if unresolved:
        errors.append(
            f"STT-Bericht enthält {len(unresolved)} ungeklärte Ergebnisse: "
            + ", ".join(unresolved[:20])
        )
    generated_at = report.get("generatedAt")
    if not generated_at:
        errors.append("STT-Bericht hat keinen generatedAt-Zeitstempel; bitte --with-stt ausführen.")
    else:
        try:
            report_time = parse_timestamp(str(generated_at)).timestamp()
            newer = [
                entry["id"]
                for entry in entries
                if (ROOT / entry["audio"]).is_file()
                and (ROOT / entry["audio"]).stat().st_mtime > report_time + 1
            ]
            if newer:
                errors.append(
                    f"{len(newer)} Audios sind neuer als der STT-Bericht: " + ", ".join(newer[:20])
                )
        except ValueError:
            errors.append(f"Ungültiger generatedAt-Zeitstempel: {generated_at!r}.")
    return errors


def main() -> int:
    args = parse_args()
    entries = load_vocabulary()
    errors: list[str] = []

    if len(entries) != EXPECTED_COUNT:
        errors.append(f"Erwartet {EXPECTED_COUNT} Vokabeln, gefunden {len(entries)}.")
    ids = [entry.get("id") for entry in entries]
    audios = [entry.get("audio") for entry in entries]
    duplicate_ids = [key for key, count in Counter(ids).items() if count > 1]
    duplicate_audios = [key for key, count in Counter(audios).items() if count > 1]
    if duplicate_ids:
        errors.append(f"Doppelte IDs: {duplicate_ids[:20]}")
    if duplicate_audios:
        errors.append(f"Doppelte Audiopfade: {duplicate_audios[:20]}")

    expected_paths = {str((ROOT / audio).resolve()) for audio in audios if isinstance(audio, str)}
    actual_paths = {str(path.resolve()) for path in AUDIO_DIR.glob("*.mp3")}
    missing = sorted(expected_paths - actual_paths)
    extra = sorted(actual_paths - expected_paths)
    if missing:
        errors.append(f"Fehlende MP3s: {[str(Path(path).relative_to(ROOT)) for path in missing[:20]]}")
    if extra:
        errors.append(f"Zusätzliche MP3s: {[str(Path(path).relative_to(ROOT)) for path in extra[:20]]}")

    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
        for problem in executor.map(probe, entries):
            if problem:
                errors.append(problem)

    if args.require_stt_clean:
        errors.extend(validate_report(entries))

    if errors:
        print("Audio-Integritätsprüfung fehlgeschlagen:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        f"Audio-Integrität OK: {len(entries)} eindeutige Vokabeln, "
        f"{len(actual_paths)} lesbare MP3s"
        + (", vollständiger STT-Nachweis" if args.require_stt_clean else "")
        + "."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
