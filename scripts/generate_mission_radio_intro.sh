#!/usr/bin/env bash
set -Eeuo pipefail

API_URL="${API_URL:-http://127.0.0.1:8880/v1/audio/speech}"
MODEL="${MODEL:-qwen3-tts}"
VOICE="${VOICE:-ryan}"
OUTPUT_DIR="assets/audio/ui"
TEXTS=(
  "The next password to jam the zombie radar is"
  "Attention, your next radar jamming code is"
  "Incoming tactical update: the next password is"
  "Priority dispatch: the code to jam their radar is"
  "Transmission incoming: the target password is"
  "Airborne update: your next radar bypass code is"
  "Critical frequency locked: the next password is"
  "Stand by for radar jamming coordinates: the code is"
)

INSTRUCTIONS=(
  "Speak exactly this sentence once as an excited, urgent tactical radio operator during a dangerous helicopter mission. Use clear standard British English, energetic pacing, and strong command presence. Do not add, omit, repeat, or spell any words."
  "Speak exactly this sentence once as a focused rescue pilot breaking through radio interference under pressure. Use clear standard British English, clipped tactical rhythm, rising urgency, and no added words or sounds."
  "Speak exactly this sentence once as an alert command officer warning a rescue team during an active zombie attack. Use clear standard British English, tense controlled excitement, and emphatic stress on next password and zombie radar. Add, omit, and repeat nothing."
  "Speak exactly this sentence once as a courageous airborne radio operator guiding a dangerous night mission. Use clear standard British English, fast confident delivery, restrained urgency, and exactly the supplied words only."
  "Speak exactly this sentence once as an intense mission controller whose radar-jamming window is closing. Use clear standard British English, dramatic command presence, urgent but intelligible pacing, and no extra, missing, repeated, or spelled words."
  "Speak exactly this sentence once as a tactical flight commander broadcasting over an encrypted emergency channel. Use clear standard British English, sharp authoritative cadence, high stakes intensity, and speak only the supplied words."
  "Speak exactly this sentence once as a reconnaissance officer confirming coordinates amidst heavy hostile activity. Use clear standard British English, precise military diction, rapid focused delivery, and no extraneous sounds."
  "Speak exactly this sentence once as an airborne squad leader guiding the final approach into the contaminated sector. Use clear standard British English, calm professional urgency under combat pressure, and no extra or omitted words."
)
SPEEDS=(1.04 1.08 1.02 1.10 1.06 1.07 1.05 1.09)
TMP_FILES=()

cleanup() {
  if ((${#TMP_FILES[@]})); then
    rm -f "${TMP_FILES[@]}"
  fi
}
trap cleanup EXIT

for command in curl jq ffmpeg ffprobe; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "Fehler: Benötigtes Programm '$command' wurde nicht gefunden." >&2
    exit 1
  }
done

mkdir -p "$OUTPUT_DIR"

total=${#TEXTS[@]}
for index in "${!TEXTS[@]}"; do
  variant=$((index + 1))
  output_file="$OUTPUT_DIR/mission_radio_password_intro_${variant}.mp3"
  tmp_file="${output_file}.tmp.mp3"
  TMP_FILES+=("$tmp_file")
  text="${TEXTS[$index]}"

  payload=$(jq -n \
    --arg model "$MODEL" \
    --arg input "$text" \
    --arg voice "$VOICE" \
    --arg language "english" \
    --arg instruct "${INSTRUCTIONS[$index]}" \
    --arg response_format "mp3" \
    --argjson speed "${SPEEDS[$index]}" \
    '{model: $model, input: $input, voice: $voice, language: $language, instruct: $instruct, response_format: $response_format, speed: $speed}')

  curl --silent --show-error --fail \
    -X POST "$API_URL" \
    -H 'Content-Type: application/json' \
    --data "$payload" \
    --output "$tmp_file"

  ffmpeg -y -hide_banner -loglevel error \
    -i "$tmp_file" \
    -af "highpass=f=280,lowpass=f=3600,acompressor=threshold=-20dB:ratio=3:attack=8:release=90,loudnorm=I=-16:TP=-1.5:LRA=8" \
    "$output_file"

  duration=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$output_file")
  echo "✅ Qwen-Funkdurchsage ${variant}/${total} erzeugt: $output_file (${duration}s)"
done
