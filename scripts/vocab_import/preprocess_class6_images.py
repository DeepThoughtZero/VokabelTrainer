#!/usr/bin/env python3
"""Create consistently oriented, enhanced working copies of class-6 photos."""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, default=Path(__file__).with_name("class6_pages.json"))
    parser.add_argument("--output", type=Path, default=Path("/tmp/vokabelzombie-pages"))
    parser.add_argument("--max-width", type=int, default=2600)
    args = parser.parse_args()

    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    repository = Path(__file__).resolve().parents[2]
    source_directory = repository / manifest["sourceDirectory"]
    args.output.mkdir(parents=True, exist_ok=True)

    completed = []
    for item in manifest["pages"]:
        source = source_directory / item["file"]
        if not source.is_file():
            raise FileNotFoundError(source)

        destination = args.output / f"page-{item['page']}.jpg"
        rotation = item.get("rotation", manifest.get("rotation", 0))
        command = [
            "magick",
            str(source),
            "-rotate",
            str(rotation),
            "-colorspace",
            "sRGB",
            "-contrast-stretch",
            "0.5%x0.5%",
            "-sharpen",
            "0x0.8",
            "-resize",
            f"{args.max_width}x>",
            "-quality",
            "92",
            str(destination),
        ]
        subprocess.run(command, check=True)
        completed.append({"page": item["page"], "source": item["file"], "workingCopy": str(destination)})

    (args.output / "manifest.json").write_text(
        json.dumps(completed, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Prepared {len(completed)} pages in {args.output}")


if __name__ == "__main__":
    main()
