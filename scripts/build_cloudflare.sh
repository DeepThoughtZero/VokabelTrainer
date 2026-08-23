#!/usr/bin/env bash
set -Eeuo pipefail

# Erzeugt das saubere Ausgabeverzeichnis 'dist/' für das Cloudflare Pages Deployment.
# Nur die echten Webanwendungsdateien werden kopiert, keine Quellfotos, Tests oder Server-Skripte.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"

echo "==> Erstelle sauberes dist/ für Cloudflare Pages..."
rm -rf dist
mkdir -p dist

cp index.html dist/
cp -r css js assets dist/

echo "✅ Cloudflare dist/ Verzeichnis erfolgreich erzeugt."
