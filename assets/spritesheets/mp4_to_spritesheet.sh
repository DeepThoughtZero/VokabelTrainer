#!/usr/bin/env bash
set -euo pipefail

# Erzwingt Punkt als Dezimaltrennzeichen
export LC_ALL=C
export LANG=C

# ===================================
# Betriebsmodus
# ===================================
BATCH_MODE=0                      # 1 = Alle MP4s im Ordner verarbeiten, 0 = Nur Einzeldatei
INPUT_FILE="horse_dancing3.mp4" # Wird nur genutzt, wenn BATCH_MODE=0

# ===================================
# Zeitbereich
# ===================================
AUTO_DURATION=1   # 1 = komplette MP4 ab START verwenden
START="0"         # Sekunden
DURATION="2.0"    # nur aktiv, wenn AUTO_DURATION=0

# ===================================
# Sprite-Einstellungen
# ===================================
FPS=8
SPRITE_W=-1       # -1 = Breite wird automatisch passend zur Höhe berechnet
SPRITE_H=160      # Feste Höhe (für bessere Qualität hier den Wert erhöhen!)
COLS=6

# lanczos = besser für Video / AI-Material
# neighbor = härterer Pixel-Look
SCALE_FLAGS="lanczos"

# ===================================
# Crop-Schalter
# ===================================
ENABLE_CROP=0     # 1 = crop an, 0 = crop aus

CROP_W=420
CROP_H=420
CROP_X="(iw-${CROP_W})/2"
CROP_Y="(ih-${CROP_H})/2"

# ===================================
# Greenscreen-Keying
# ===================================
KEY_COLOR="0x00FF00"
KEY_SIMILARITY="0.25"
KEY_BLEND="0.08"

# ===================================
# Hilfsfunktion: Komma -> Punkt
# ===================================
normalize_num() {
  printf '%s' "$1" | tr ',' '.'
}

START="$(normalize_num "$START")"
DURATION="$(normalize_num "$DURATION")"
KEY_SIMILARITY="$(normalize_num "$KEY_SIMILARITY")"
KEY_BLEND="$(normalize_num "$KEY_BLEND")"

# ===================================
# Kernfunktion für die Verarbeitung
# ===================================
process_video() {
  local current_input="$1"
  local basename="${current_input%.*}"
  local output_png="${basename}_sheet.png"

  echo "-------------------------------------------------"
  echo "Verarbeite: $current_input"

  if [[ ! -f "$current_input" ]]; then
    echo "Überspringe: Datei nicht gefunden ($current_input)"
    return
  fi

  local current_duration="$DURATION"

  # Dauer automatisch aus MP4 lesen
  if [[ "$AUTO_DURATION" -eq 1 ]]; then
    local raw_duration
    raw_duration=$(ffprobe -v error \
      -show_entries format=duration \
      -of default=noprint_wrappers=1:nokey=1 \
      "$current_input")

    raw_duration="$(normalize_num "$raw_duration")"

    current_duration=$(awk -v total="$raw_duration" -v start="$START" '
      BEGIN {
        d = total - start
        if (d < 0.001) d = 0.001
        printf "%.3f", d
      }')
  fi

  # Anzahl Frames / Zeilen berechnen
  local frames
  frames=$(awk -v fps="$FPS" -v dur="$current_duration" '
    BEGIN {
      f = int((fps * dur) + 0.999999)
      if (f < 1) f = 1
      print f
    }')

  local rows=$(( (frames + COLS - 1) / COLS ))

  # Filterkette bauen
  local vf="fps=${FPS}"

  if [[ "$ENABLE_CROP" -eq 1 ]]; then
    vf="${vf},crop=${CROP_W}:${CROP_H}:${CROP_X}:${CROP_Y}"
  fi

  vf="${vf},chromakey=${KEY_COLOR}:${KEY_SIMILARITY}:${KEY_BLEND},despill=green"
  vf="${vf},format=rgba"
  vf="${vf},scale=${SPRITE_W}:${SPRITE_H}:flags=${SCALE_FLAGS}"
  vf="${vf},tile=${COLS}x${rows}:padding=0:margin=0:color=0x00000000"

  # Sprite Sheet erzeugen
  ffmpeg -v error -y \
    -ss "$START" \
    -t "$current_duration" \
    -i "$current_input" \
    -map 0:v:0 -an \
    -vf "$vf" \
    -frames:v 1 \
    -update 1 \
    "$output_png" \
    -compression_level 9 

  echo "Fertig:     $output_png"
  echo "Raster:     ${COLS}x${rows} (Frames: $frames)"
}

# ===================================
# Programmstart & Schleifenlogik
# ===================================
if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
  echo "Fehler: ffmpeg oder ffprobe ist nicht installiert." >&2
  exit 1
fi

if [[ "$BATCH_MODE" -eq 1 ]]; then
  echo "Starte Batch-Modus für alle MP4-Dateien..."
  # Fängt ab, falls keine MP4-Dateien im Ordner existieren
  shopt -s nullglob
  mp4_files=(*.mp4)
  
  if [ ${#mp4_files[@]} -eq 0 ]; then
    echo "Keine MP4-Dateien im aktuellen Ordner gefunden."
    exit 0
  fi

  for file in "${mp4_files[@]}"; do
    process_video "$file"
  done
  echo "-------------------------------------------------"
  echo "Alle Dateien erfolgreich verarbeitet!"
else
  process_video "$INPUT_FILE"
fi