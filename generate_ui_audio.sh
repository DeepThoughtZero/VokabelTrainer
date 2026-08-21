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

# Hunter Intros (Charakter-spezifische Stimmen)
echo "Generiere Charakter-Intros..."
for hunter_id in $(jq -r '.hunter_intros | keys[]' js/ui_texts.json); do
  voice=$(jq -r --arg h "$hunter_id" '.hunter_voices[$h]' js/ui_texts.json)
  intro_text=$(jq -r --arg h "$hunter_id" '.hunter_intros[$h]' js/ui_texts.json)
  echo "  -> Held '$hunter_id' (Stimme: $voice)..."
  synthesize_json "$intro_text" "$OUTPUT_DIR/hunter_${hunter_id}_intro.mp3" "$voice"
done

# Hunter Cities (Orts- und heldenspezifische Sprüche mit gleicher Heldenstimme)
echo "Generiere Helden-Orts-Kombinationen..."
for hunter_id in $(jq -r '.hunter_cities | keys[]' js/ui_texts.json); do
  voice=$(jq -r --arg h "$hunter_id" '.hunter_voices[$h]' js/ui_texts.json)
  for city_id in $(jq -r --arg h "$hunter_id" '.hunter_cities[$h] | keys[]' js/ui_texts.json); do
    city_text=$(jq -r --arg h "$hunter_id" --arg c "$city_id" '.hunter_cities[$h][$c]' js/ui_texts.json)
    echo "  -> Held '$hunter_id' in Stadt '$city_id' (Stimme: $voice)..."
    synthesize_json "$city_text" "$OUTPUT_DIR/hunter_${hunter_id}_city_${city_id}.mp3" "$voice"
  done
done

echo "Fertig! Alle Charakter- und Ortsaudiodateien liegen in $OUTPUT_DIR"
