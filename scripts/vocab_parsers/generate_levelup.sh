#!/usr/bin/env bash
set -Eeuo pipefail

API_URL="http://127.0.0.1:8880/v1/audio/speech"
MODEL="qwen3-tts"
VOICE="ryan"
LANGUAGE="german"
SPEED="1.0"
OUTPUT_DIR="assets/audio/ui"

mkdir -p "$OUTPUT_DIR"

generate() {
  local filename="$1"
  local text="$2"
  local filepath="$OUTPUT_DIR/${filename}.mp3"
  local tmpfile="${filepath}.tmp.mp3"

  echo "Generiere $filename: $text"

  local payload
  payload=$(jq -n \
    --arg model "$MODEL" \
    --arg input "$text" \
    --arg voice "$VOICE" \
    --arg language "$LANGUAGE" \
    --arg response_format "mp3" \
    --argjson speed "$SPEED" \
    '{model: $model, input: $input, voice: $voice, language: $language, response_format: $response_format, speed: $speed}')

  curl --silent --show-error --fail \
    -X POST "$API_URL" \
    -H 'Content-Type: application/json' \
    --data "$payload" \
    --output "$tmpfile"

  ffmpeg -y -hide_banner -loglevel error -i "$tmpfile" -af "loudnorm=I=-16:TP=-1.5:LRA=11" "$filepath"
  rm -f "$tmpfile"
  echo "✅ Gespeichert: $filepath"
}

generate "levelup_kadett" "Glückwunsch! Du bist nun ein Kadett."
generate "levelup_jaeger" "Wahnsinn! Du bist jetzt ein Jäger."
generate "levelup_veteran" "Respekt! Du hast den Rang Veteran erreicht."
generate "levelup_elitejaeger" "Unglaublich! Du bist nun ein Elitejäger."
generate "levelup_zombiebezwinger" "Unfassbar! Man nennt dich jetzt Zombiebezwinger."
generate "levelup_legende" "Du bist eine wahre Legende! Niemand kann dir das Wasser reichen."
