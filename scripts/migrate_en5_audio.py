#!/usr/bin/env python3
"""
Migrations- und Verifikationsskript für die Audio- und ID-Struktur von Englisch 5.

Verwendung:
  python3 scripts/migrate_en5_audio.py --check   # Prüft alle Vorbedingungen und erzeugt scratch/en5_audio_migration_plan.json
  python3 scripts/migrate_en5_audio.py --apply   # Führt die atomare Migration (git mv, Kopien, js/vocabs.js) durch
  python3 scripts/migrate_en5_audio.py --verify  # Verifiziert die Vollständigkeit und Audio-Integrität (ffprobe)
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VOCABS_FILE = ROOT / "js/vocabs.js"
AUDIO_ROOT = ROOT / "assets/audio"
AUDIO_EN5_DIR = ROOT / "assets/audio/vocab/en-5"
SCRATCH_DIR = ROOT / "scratch"
PLAN_MANIFEST = SCRATCH_DIR / "en5_audio_migration_plan.json"


def load_raw_vocabs() -> list[dict]:
    content = VOCABS_FILE.read_text(encoding="utf-8")
    match = re.search(r"const\s+VOCABULARY\s*=\s*(\[.*?\]);", content, re.DOTALL)
    if not match:
        raise RuntimeError(f"Konnte VOCABULARY Array nicht in {VOCABS_FILE} finden.")
    clean_json = re.sub(r"//.*", "", match.group(1))
    return json.loads(clean_json)


def compute_runtime_ids(vocabs: list[dict], course_id: str = "en-5") -> list[str]:
    """
    Exakte Nachbildung der JavaScript-Funktion normalizeVocabulary aus js/app.js:
      const pageCounters = new Map();
      ...
      const page = source.page ?? 'x';
      const count = (pageCounters.get(page) || 0) + 1;
      pageCounters.set(page, count);
      id: source.id || `${courseId}-p${page}-${String(count).padStart(3, '0')}`
    """
    page_counters: dict[int | str, int] = defaultdict(int)
    runtime_ids: list[str] = []
    for source in vocabs:
        if source.get("id"):
            runtime_ids.append(source["id"])
            continue
        page = source.get("page", "x")
        page_counters[page] += 1
        count = page_counters[page]
        runtime_ids.append(f"{course_id}-p{page}-{count:03d}")
    return runtime_ids


def get_foreign(entry: dict) -> str:
    return str(entry.get("foreign") or entry.get("english") or "")


def get_legacy_filename(entry: dict) -> str:
    """Exakte historische JavaScript-Auflösung: getForeign(vocab).replace(/\\//g, '_') + '.mp3'"""
    foreign = get_foreign(entry)
    return foreign.replace("/", "_") + ".mp3"


def compute_sha256(path: Path) -> str:
    hasher = hashlib.sha256()
    hasher.update(path.read_bytes())
    return hasher.hexdigest()


def build_migration_plan():
    vocabs = load_raw_vocabs()
    runtime_ids = compute_runtime_ids(vocabs, "en-5")

    # Vorhandene Root-Audiodateien
    root_mp3s = {
        f.name: f for f in AUDIO_ROOT.iterdir()
        if f.is_file() and f.suffix == ".mp3"
    }

    # Vorhandene Target-Dateien in en-5 (falls teilweise schon vorhanden)
    target_mp3s = {}
    if AUDIO_EN5_DIR.is_dir():
        target_mp3s = {
            f.name: f for f in AUDIO_EN5_DIR.iterdir()
            if f.is_file() and f.suffix == ".mp3"
        }

    seen_ids = set()
    seen_legacy_sources: dict[str, Path] = {}
    plan_entries: list[dict] = []
    missing_source_mp3s = []
    runtime_mismatches = []
    target_collisions = []

    page_counters: dict[int | str, int] = defaultdict(int)

    for index, entry in enumerate(vocabs):
        page = entry.get("page", "x")
        page_counters[page] += 1
        count = page_counters[page]
        planned_id = f"en-5-p{page}-{count:03d}"
        runtime_id = runtime_ids[index]

        if planned_id != runtime_id:
            runtime_mismatches.append((index, runtime_id, planned_id))

        if planned_id in seen_ids:
            target_collisions.append(planned_id)
        seen_ids.add(planned_id)

        legacy_filename = get_legacy_filename(entry)
        old_audio_rel = f"assets/audio/{legacy_filename}"
        new_audio_rel = f"assets/audio/vocab/en-5/{planned_id}.mp3"
        new_audio_path = AUDIO_EN5_DIR / f"{planned_id}.mp3"

        source_file_in_root = root_mp3s.get(legacy_filename)

        if legacy_filename not in seen_legacy_sources:
            operation = "move"
            seen_legacy_sources[legacy_filename] = new_audio_path
            if not source_file_in_root and not new_audio_path.is_file():
                missing_source_mp3s.append(legacy_filename)
        else:
            operation = "copy"
            # Kopie von der Zieldatei des ersten Vorkommens
            if not source_file_in_root and not new_audio_path.is_file() and not seen_legacy_sources[legacy_filename].is_file():
                missing_source_mp3s.append(legacy_filename)

        plan_entries.append({
            "index": index,
            "id": planned_id,
            "english": get_foreign(entry),
            "german": entry.get("german", ""),
            "page": page,
            "oldAudio": old_audio_rel,
            "newAudio": new_audio_rel,
            "operation": operation,
            "legacyFilename": legacy_filename,
        })

    unreferenced_root_mp3s = set(root_mp3s.keys()) - set(seen_legacy_sources.keys())

    return {
        "vocabs": vocabs,
        "runtime_ids": runtime_ids,
        "plan_entries": plan_entries,
        "vocab_count": len(vocabs),
        "unique_target_ids": len(seen_ids),
        "unique_source_mp3s": len(seen_legacy_sources),
        "root_mp3s_count": len(root_mp3s),
        "direct_moves_count": sum(1 for e in plan_entries if e["operation"] == "move"),
        "required_copies_count": sum(1 for e in plan_entries if e["operation"] == "copy"),
        "missing_source_mp3s": missing_source_mp3s,
        "unreferenced_root_mp3s": unreferenced_root_mp3s,
        "runtime_mismatches": runtime_mismatches,
        "target_collisions": target_collisions,
        "existing_target_mp3s_count": len(target_mp3s),
    }


def cmd_check() -> bool:
    print("=" * 60)
    print("MIGRATION PLAN & PRECONDITION CHECK (ENGLISCH 5)")
    print("=" * 60)

    plan = build_migration_plan()

    # Schreibe Manifest
    SCRATCH_DIR.mkdir(parents=True, exist_ok=True)
    manifest_data = {
        "courseId": "en-5",
        "vocabularyCount": plan["vocab_count"],
        "uniqueSourceMp3s": plan["unique_source_mp3s"],
        "directMoves": plan["direct_moves_count"],
        "requiredCopies": plan["required_copies_count"],
        "entries": plan["plan_entries"],
    }
    PLAN_MANIFEST.write_text(json.dumps(manifest_data, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Manifest geschrieben: {PLAN_MANIFEST.relative_to(ROOT)}")
    print("-" * 60)

    is_safe = (
        len(plan["runtime_mismatches"]) == 0
        and len(plan["missing_source_mp3s"]) == 0
        and len(plan["target_collisions"]) == 0
        and len(plan["unreferenced_root_mp3s"]) == 0
        and plan["vocab_count"] == plan["unique_target_ids"]
        and plan["direct_moves_count"] == plan["unique_source_mp3s"]
        and plan["direct_moves_count"] + plan["required_copies_count"] == plan["vocab_count"]
    )

    print(f"Vocabulary entries:          {plan['vocab_count']}")
    print(f"Unique IDs:                  {plan['unique_target_ids']}")
    print(f"Runtime ID mismatches:       {len(plan['runtime_mismatches'])}")
    print()
    print(f"Expected legacy audio refs:  {plan['vocab_count']}")
    print(f"Unique source MP3s:          {plan['unique_source_mp3s']}")
    print(f"Root MP3s currently found:   {plan['root_mp3s_count']}")
    print(f"Missing source MP3s:         {len(plan['missing_source_mp3s'])}")
    print(f"Unreferenced root MP3s:      {len(plan['unreferenced_root_mp3s'])}")
    print()
    print(f"Target MP3s planned:         {plan['vocab_count']} ({plan['direct_moves_count']} moves + {plan['required_copies_count']} copies)")
    print(f"Target collisions:           {len(plan['target_collisions'])}")
    print(f"Existing target MP3s:        {plan['existing_target_mp3s_count']}")
    print("-" * 60)

    if plan["runtime_mismatches"]:
        print("❌ FEHLER: Runtime-ID-Abweichungen gefunden:")
        for idx, r_id, p_id in plan["runtime_mismatches"][:10]:
            print(f"   Index {idx}: Runtime '{r_id}' != Planned '{p_id}'")

    if plan["missing_source_mp3s"]:
        print("❌ FEHLER: Fehlende Quell-Audiodateien:")
        for m in plan["missing_source_mp3s"][:10]:
            print(f"   {m}")

    if plan["unreferenced_root_mp3s"]:
        print("❌ FEHLER: Unreferenzierte MP3s im Stammverzeichnis:")
        for u in sorted(plan["unreferenced_root_mp3s"])[:10]:
            print(f"   {u}")

    if is_safe:
        print("RESULT: SAFE TO MIGRATE (100% Preconditions erfüllt)")
    else:
        print("RESULT: NOT SAFE (Abbruch der Migration)")
    print("=" * 60)
    return is_safe


def cmd_apply() -> None:
    if not cmd_check():
        print("Abbruch: Preconditions nicht erfüllt.", file=sys.stderr)
        sys.exit(1)

    plan = build_migration_plan()
    AUDIO_EN5_DIR.mkdir(parents=True, exist_ok=True)

    print("\n1. Führe Dateioperationen (Move & Copy) vorsichtig und idempotent aus...")
    first_target_paths: dict[str, Path] = {}

    for item in plan["plan_entries"]:
        legacy_name = item["legacyFilename"]
        target_path = AUDIO_EN5_DIR / f"{item['id']}.mp3"
        source_in_root = AUDIO_ROOT / legacy_name

        if item["operation"] == "move":
            first_target_paths[legacy_name] = target_path
            if target_path.is_file():
                # Prüfe ob bereits existiert und identisch
                if source_in_root.is_file():
                    src_hash = compute_sha256(source_in_root)
                    dst_hash = compute_sha256(target_path)
                    if src_hash != dst_hash:
                        raise RuntimeError(f"Zieldatei {target_path} existiert bereits, unterscheidet sich aber von Quelle!")
                    source_in_root.unlink()
            else:
                if not source_in_root.is_file():
                    raise RuntimeError(f"Quelldatei fehlt für Verschiebung: {source_in_root}")
                rel_source = source_in_root.relative_to(ROOT)
                rel_target = target_path.relative_to(ROOT)
                res = subprocess.run(
                    ["git", "mv", str(rel_source), str(rel_target)],
                    cwd=ROOT, capture_output=True, text=True
                )
                if res.returncode != 0:
                    raise RuntimeError(f"git mv fehlgeschlagen ({rel_source} -> {rel_target}): {res.stderr}")

        elif item["operation"] == "copy":
            actual_source = first_target_paths.get(legacy_name)
            if not actual_source or not actual_source.is_file():
                if source_in_root.is_file():
                    actual_source = source_in_root
                else:
                    raise RuntimeError(f"Keine Quelle für Duplikatkopie von {legacy_name} gefunden.")

            if target_path.is_file():
                src_hash = compute_sha256(actual_source)
                dst_hash = compute_sha256(target_path)
                if src_hash != dst_hash:
                    raise RuntimeError(f"Zieldatei {target_path} existiert bereits, unterscheidet sich aber von Quelle!")
            else:
                shutil.copy2(actual_source, target_path)
                rel_target = target_path.relative_to(ROOT)
                subprocess.run(["git", "add", str(rel_target)], cwd=ROOT, check=True)

    print(f"   Alle {plan['vocab_count']} Audio-Dateien erfolgreich in {AUDIO_EN5_DIR.relative_to(ROOT)} platziert.")

    print("\n2. Aktualisiere js/vocabs.js mit stabilen IDs (ohne redundantes audio-Feld)...")
    updated_vocabs: list[dict] = []
    for item in plan["plan_entries"]:
        entry_dict = {
            "foreign": item["english"],
            "english": item["english"], # Beibehalten zur Sicherheit für bestehenden Code
            "german": item["german"],
            "unit": plan["vocabs"][item["index"]].get("unit", ""),
            "part": plan["vocabs"][item["index"]].get("part", ""),
            "page": item["page"],
            "id": item["id"],
        }
        # Nur wenn expliziter Audio-Override vorhanden wäre, übernehmen
        if "audio" in plan["vocabs"][item["index"]]:
            entry_dict["audio"] = plan["vocabs"][item["index"]]["audio"]
        updated_vocabs.append(entry_dict)

    js_content = "// Generated from reviewed vocabulary pages 225-261 with stable IDs.\n"
    js_content += "const VOCABULARY = " + json.dumps(updated_vocabs, indent=2, ensure_ascii=False) + ";\n\n"
    js_content += "// Keep the historical constant for backwards compatibility while registering\n"
    js_content += "// the data as the explicit class-5 English course.\n"
    js_content += "window.VOCABULARIES['en-5'] = VOCABULARY;\n"

    VOCABS_FILE.write_text(js_content, encoding="utf-8")
    print(f"   {VOCABS_FILE.relative_to(ROOT)} erfolgreich geschrieben.")


def check_audio_with_ffprobe(file_path: Path) -> tuple[bool, str]:
    if not file_path.is_file():
        return False, "Datei existiert nicht"
    size = file_path.stat().st_size
    if size < 1000:
        return False, f"Dateigröße zu klein ({size} Bytes)"

    try:
        res = subprocess.run(
            [
                "ffprobe",
                "-v", "error",
                "-select_streams", "a:0",
                "-show_entries", "stream=codec_name:format=duration",
                "-of", "json",
                str(file_path),
            ],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if res.returncode != 0:
            return False, f"ffprobe Exit-Code {res.returncode}: {res.stderr.strip()}"
        data = json.loads(res.stdout)
        streams = data.get("streams", [])
        if not streams:
            return False, "Kein Audio-Stream gefunden"
        duration = float(data.get("format", {}).get("duration", 0))
        if duration <= 0.05:
            return False, f"Plausibilitätsfehler Dauer ({duration}s)"
        codec = streams[0].get("codec_name", "unknown")
        return True, f"OK ({duration:.2f}s, {codec})"
    except Exception as e:
        return False, f"Ausnahmefehler bei ffprobe: {e}"


def cmd_verify() -> bool:
    print("=" * 60)
    print("VERIFIKATION (ENGLISCH 5)")
    print("=" * 60)

    vocabs = load_raw_vocabs()
    print(f"Geladene Vokabeln aus js/vocabs.js: {len(vocabs)}")

    # 1. ID Invarianten
    ids = [v.get("id") for v in vocabs]
    if any(not i for i in ids):
        print("❌ FEHLER: Mindestens eine Vokabel hat keine ID!")
        return False
    if len(set(ids)) != len(vocabs):
        print(f"❌ FEHLER: IDs sind nicht eindeutig ({len(set(ids))} != {len(vocabs)})!")
        return False

    id_pattern = re.compile(r"^en-5-p\d{3}-\d{3}$")
    for v in vocabs:
        entry_id = v["id"]
        if not id_pattern.match(entry_id):
            print(f"❌ FEHLER: ID '{entry_id}' entspricht nicht dem Schema 'en-5-p<Seite>-<Nummer>'!")
            return False
        expected_page_str = f"p{v['page']}"
        if expected_page_str not in entry_id:
            print(f"❌ FEHLER: ID '{entry_id}' stimmt nicht mit Seite {v['page']} überein!")
            return False

    print("✔ Alle Vokabel-IDs sind vollständig, eindeutig und schema-konform.")

    # 2. Dateien in assets/audio/vocab/en-5
    if not AUDIO_EN5_DIR.is_dir():
        print(f"❌ FEHLER: Verzeichnis {AUDIO_EN5_DIR.relative_to(ROOT)} existiert nicht!")
        return False

    actual_files = {f.name for f in AUDIO_EN5_DIR.iterdir() if f.is_file() and f.suffix == ".mp3"}
    expected_files = {f"{v['id']}.mp3" for v in vocabs}

    missing_files = expected_files - actual_files
    unreferenced_files = actual_files - expected_files

    if missing_files:
        print(f"❌ FEHLER: {len(missing_files)} erwartete MP3-Dateien fehlen:")
        for m in sorted(missing_files)[:10]:
            print(f"   {m}")
        return False

    if unreferenced_files:
        print(f"❌ FEHLER: {len(unreferenced_files)} unreferenzierte MP3-Dateien in en-5:")
        for u in sorted(unreferenced_files)[:10]:
            print(f"   {u}")
        return False

    print(f"✔ Exakt {len(actual_files)} MP3-Dateien in 1:1-Bijektion zu allen Vokabel-IDs vorhanden.")

    # 3. Keine losen MP3-Dateien in assets/audio
    loose_mp3s = [f.name for f in AUDIO_ROOT.iterdir() if f.is_file() and f.suffix == ".mp3"]
    if loose_mp3s:
        print(f"❌ FEHLER: {len(loose_mp3s)} lose MP3-Dateien verbleiben in assets/audio/:")
        for l in loose_mp3s[:10]:
            print(f"   {l}")
        return False

    print("✔ Keine verwaisten oder losen MP3-Dateien im Stammverzeichnis assets/audio/.")

    # 4. ffprobe Prüfung auf allen en-5 MP3s
    print(f"✔ Prüfe alle {len(actual_files)} MP3s mit ffprobe...")
    ffprobe_errors = []
    for filename in sorted(actual_files):
        fpath = AUDIO_EN5_DIR / filename
        ok, msg = check_audio_with_ffprobe(fpath)
        if not ok:
            ffprobe_errors.append((filename, msg))

    if ffprobe_errors:
        print(f"❌ FEHLER: {len(ffprobe_errors)} MP3-Dateien haben ffprobe-Integritätsfehler:")
        for fname, err in ffprobe_errors[:10]:
            print(f"   {fname}: {err}")
        return False

    print(f"✔ Alle {len(actual_files)} MP3-Dateien besitzen gültige Audio-Streams mit positiver Dauer.")
    print("=" * 60)
    print("VERIFIKATION ERFOLGREICH ABGESCHLOSSEN!")
    print("=" * 60)
    return True


def main():
    parser = argparse.ArgumentParser(description="Migration & Verifikation der Klasse-5-Audios")
    parser.add_argument("--check", action="store_true", help="Vorbedingungen prüfen und Plan ausgeben")
    parser.add_argument("--apply", action="store_true", help="Migration anwenden")
    parser.add_argument("--verify", action="store_true", help="Bestehenden Stand verifizieren")

    args = parser.parse_args()

    if args.apply:
        cmd_apply()
    elif args.verify:
        if not cmd_verify():
            sys.exit(1)
    else:
        if not cmd_check():
            sys.exit(1)


if __name__ == "__main__":
    main()
