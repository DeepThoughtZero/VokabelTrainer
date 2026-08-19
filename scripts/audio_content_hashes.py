#!/usr/bin/env python3
"""Gemeinsamer SHA-256-Vertrag für Audio und SPEACHES-Berichte."""

from __future__ import annotations

import hashlib
from pathlib import Path


CONTENT_HASH_SCHEMA = "sha256-v1"


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def content_hashes(audio_path: Path, foreign: str, expected_spoken: str) -> dict[str, str]:
    return {
        "audioSha256": sha256_file(audio_path),
        "foreignSha256": sha256_text(foreign),
        "expectedSpokenSha256": sha256_text(expected_spoken),
    }
