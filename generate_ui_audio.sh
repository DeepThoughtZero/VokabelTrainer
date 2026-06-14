#!/usr/bin/env bash
set -Eeuo pipefail

# Erzeugt MP3-Dateien für UI Texte (Fragezeichen-Dialog, Charakterwahl, Ortswahl)
#
# Engines:
#   ENGINE=qwen3-builtin – Qwen3-TTS mit eingebauter Stimme (kein Klonen), Port 8880

ENGINE="${ENGINE:-qwen3-builtin}"
OUTPUT_DIR="${OUTPUT_DIR:-assets/audio/ui}"
API_URL="${API_URL:-http://127.0.0.1:8880/v1/audio/speech}"
MODEL="${MODEL:-qwen3-tts}"
DEFAULT_VOICE="${VOICE:-ryan}"
FEMALE_VOICE="vivian"
LANGUAGE="${LANGUAGE:-german}"
SPEED="${SPEED:-1.0}"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Fehler: Benötigtes Programm '$1' wurde nicht gefunden." >&2
    exit 1
  }
}

require_cmd curl
require_cmd jq

mkdir -p "$OUTPUT_DIR"

synthesize_json() {
  local text="$1"
  local outfile="$2"
  local voice="$3"

  local payload
  payload=$(jq -n \
    --arg model "$MODEL" \
    --arg input "$text" \
    --arg voice "$voice" \
    --arg language "$LANGUAGE" \
    --arg response_format "mp3" \
    --argjson speed "$SPEED" \
    '{model: $model, input: $input, voice: $voice, language: $language, response_format: $response_format, speed: $speed}')

  curl --silent --show-error --fail \
    -X POST "$API_URL" \
    -H 'Content-Type: application/json' \
    --data "$payload" \
    --output "$outfile.tmp.mp3"

  if [[ ! -s "$outfile.tmp.mp3" ]]; then
    echo "❌ Fehler: Ausgabe leer für $outfile" >&2
    return 1
  fi
  
  ffmpeg -y -hide_banner -loglevel error -i "$outfile.tmp.mp3" -af "loudnorm=I=-16:TP=-1.5:LRA=11" "$outfile"
  rm -f "$outfile.tmp.mp3"
}

echo "Lese ui_texts.json..."

# Story Intro (Default Stimme)
story_intro=$(jq -r '.story_intro' js/ui_texts.json)
echo "Generiere Story Intro..."
synthesize_json "$story_intro" "$OUTPUT_DIR/story_intro.mp3" "$DEFAULT_VOICE"

# Hunter Male (Default Stimme)
echo "Generiere Hunter Male Phrasen..."
count=0
jq -r '.hunter_male[]' js/ui_texts.json | while read -r phrase; do
  synthesize_json "$phrase" "$OUTPUT_DIR/hunter_male_${count}.mp3" "$DEFAULT_VOICE"
  count=$((count + 1))
done

# Hunter Female (Weibliche Stimme)
echo "Generiere Hunter Female Phrasen..."
count=0
jq -r '.hunter_female[]' js/ui_texts.json | while read -r phrase; do
  synthesize_json "$phrase" "$OUTPUT_DIR/hunter_female_${count}.mp3" "$FEMALE_VOICE"
  count=$((count + 1))
done

# City Select (Default Stimme)
echo "Generiere City Select Phrasen..."
count=0
jq -r '.city_select[]' js/ui_texts.json | while read -r phrase; do
  synthesize_json "$phrase" "$OUTPUT_DIR/city_select_${count}.mp3" "$DEFAULT_VOICE"
  count=$((count + 1))
done

echo "Fertig! Dateien liegen in $OUTPUT_DIR"
