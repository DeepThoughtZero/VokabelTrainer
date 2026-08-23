#!/usr/bin/env bash
set -Eeuo pipefail

# Erzeugt MP3-Dateien für Spiel-Soundscapes & Rettungsmissionen über audiogen-api (Port 8011)
# Verwendet facebook/audiogen-medium für Text-to-Sound Generierung

AUDIOGEN_URL="${AUDIOGEN_URL:-http://127.0.0.1:8011/generate}"
OUTPUT_DIR="${OUTPUT_DIR:-assets/audio/ui}"
FORCE="${FORCE:-false}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force)
      FORCE="true"
      shift
      ;;
    --url)
      AUDIOGEN_URL="$2"
      shift 2
      ;;
    *)
      echo "Unbekanntes Argument: $1" >&2
      exit 1
      ;;
  esac
done

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Fehler: Benötigtes Programm '$1' wurde nicht gefunden." >&2
    exit 1
  }
}

require_cmd curl
require_cmd jq
require_cmd ffmpeg
require_cmd ffprobe

mkdir -p "$OUTPUT_DIR"

generate_sound() {
  local prompt="$1"
  local duration="$2"
  local outfile="$3"
  local audio_filter="${4:-loudnorm=I=-20:TP=-2:LRA=7}"
  local tmp_wav="${outfile}.tmp.wav"
  local tmp_mp3="${outfile}.tmp.mp3"

  if [[ -s "$outfile" && "$FORCE" != "true" ]]; then
    local dur
    dur=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$outfile" 2>/dev/null || echo "ok")
    echo "⏩ Überspringe existierende Datei: $outfile (${dur}s)"
    return 0
  fi

  echo "Generiere One-Shot: '$prompt' (${duration}s) -> $outfile"

  local payload
  payload=$(jq -n \
    --arg prompt "$prompt" \
    --argjson duration "$duration" \
    '{prompt: $prompt, duration: $duration}')

  curl --silent --show-error --fail \
    -X POST "$AUDIOGEN_URL" \
    -H 'Content-Type: application/json' \
    --data "$payload" \
    --output "$tmp_wav"

  if [[ ! -s "$tmp_wav" ]]; then
    echo "❌ Fehler: Ausgabe leer für $outfile" >&2
    rm -f "$tmp_wav"
    return 1
  fi

  ffmpeg -y -hide_banner -loglevel error \
    -i "$tmp_wav" \
    -af "$audio_filter" \
    "$tmp_mp3"

  mv "$tmp_mp3" "$outfile"
  rm -f "$tmp_wav"

  local dur
  dur=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$outfile")
  echo "✅ Erfolgreich erzeugt: $outfile (${dur}s)"
}

generate_ambient_loop() {
  local prompt1="$1"
  local prompt2="$2"
  local prompt3="$3"
  local outfile="$4"
  local post_filter="${5:-highpass=f=75,lowpass=f=6500,loudnorm=I=-21:TP=-2:LRA=6}"

  if [[ -s "$outfile" && "$FORCE" != "true" ]]; then
    local dur
    dur=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$outfile" 2>/dev/null || echo "ok")
    echo "⏩ Überspringe existierenden Loop: $outfile (${dur}s)"
    return 0
  fi

  echo "Generiere 3-Take Ambient Loop -> $outfile"
  local tmp_part1="${outfile}.p1.tmp.wav"
  local tmp_part2="${outfile}.p2.tmp.wav"
  local tmp_part3="${outfile}.p3.tmp.wav"
  local tmp_mp3="${outfile}.tmp.mp3"

  local payload1 payload2 payload3
  payload1=$(jq -n --arg prompt "$prompt1" --argjson duration 10.0 '{prompt: $prompt, duration: $duration}')
  payload2=$(jq -n --arg prompt "$prompt2" --argjson duration 10.0 '{prompt: $prompt, duration: $duration}')
  payload3=$(jq -n --arg prompt "$prompt3" --argjson duration 10.0 '{prompt: $prompt, duration: $duration}')

  curl --silent --show-error --fail -X POST "$AUDIOGEN_URL" -H 'Content-Type: application/json' --data "$payload1" --output "$tmp_part1"
  curl --silent --show-error --fail -X POST "$AUDIOGEN_URL" -H 'Content-Type: application/json' --data "$payload2" --output "$tmp_part2"
  curl --silent --show-error --fail -X POST "$AUDIOGEN_URL" -H 'Content-Type: application/json' --data "$payload3" --output "$tmp_part3"

  ffmpeg -y -hide_banner -loglevel error \
    -i "$tmp_part1" -i "$tmp_part2" -i "$tmp_part3" \
    -filter_complex "[0:a][1:a]acrossfade=d=2:c1=tri:c2=tri[a01];[a01][2:a]acrossfade=d=2:c1=tri:c2=tri[afull];[afull]${post_filter}[out]" \
    -map "[out]" \
    "$tmp_mp3"

  mv "$tmp_mp3" "$outfile"
  rm -f "$tmp_part1" "$tmp_part2" "$tmp_part3"

  local dur
  dur=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$outfile")
  echo "✅ Erfolgreich erzeugt: $outfile (${dur}s)"
}

echo "Prüfe audiogen-api Verfügbarkeit..."
if ! curl --silent --fail http://127.0.0.1:8011/health >/dev/null; then
  echo "❌ Fehler: audiogen-api unter http://127.0.0.1:8011/health nicht erreichbar." >&2
  exit 1
fi

# 1. Hubschrauber-Ambient für Mobile Kommandozentrale
generate_ambient_loop \
  "steady heavy military helicopter cockpit interior low dual rotor blades spinning sound" \
  "continuous helicopter cabin flight humming with high altitude wind rushing past fuselage" \
  "inside helicopter cabin cockpit ambient continuous low engine drone and rotor turbulence" \
  "$OUTPUT_DIR/helicopter_cabin_ambient.mp3" \
  "highpass=f=75,lowpass=f=6500,loudnorm=I=-21:TP=-2:LRA=6"

# 2. Ausweichmanöver / Helikopter-Windstoß
generate_sound \
  "heavy turbulent wind gust rushing by with intense helicopter banking engine sound effect" \
  3.5 \
  "$OUTPUT_DIR/helicopter_evasion_wind.mp3" \
  "highpass=f=120,loudnorm=I=-18:TP=-1.5:LRA=8"

# 3. Notfall-Alarm / Missionsabbruch
generate_sound \
  "emergency warning alarm buzzer siren pulsating with radio static" \
  3.5 \
  "$OUTPUT_DIR/mission_fail_retreat.mp3" \
  "highpass=f=250,lowpass=f=4500,loudnorm=I=-16:TP=-1.5:LRA=8"

# 4. HALO-Einsatz: Schweres Transportflugzeug (C-130) Druckkabine & Höhenwind
generate_ambient_loop \
  "heavy military cargo transport airplane cabin interior low humming engine drone high altitude flight" \
  "inside military transport aircraft cargo bay flight humming with high altitude wind rushing past hull" \
  "cargo airplane interior steady pressurized cabin engine rumble and low turbulent wind airflow" \
  "$OUTPUT_DIR/halo_cargo_plane_ambient.mp3" \
  "highpass=f=80,lowpass=f=6000,loudnorm=I=-21:TP=-2:LRA=6"

# 5. HALO-Einsatz: Absprung-Windstoß / Sturzflug in das Zielgebiet
generate_sound \
  "intense high altitude skydive freefall wind rushing fast past helmet parachute jump sound effect" \
  3.5 \
  "$OUTPUT_DIR/halo_freefall_wind.mp3" \
  "highpass=f=150,loudnorm=I=-18:TP=-1.5:LRA=8"

# 6. Zombie-Straßenschlacht: Postapokalyptische Stadtruinen mit Wind & fernen Sirenen
generate_ambient_loop \
  "eerie post-apocalyptic abandoned city street ambient distant cold wind blowing between ruined buildings" \
  "creepy deserted apocalypse urban street atmosphere distant decaying wind and subtle ominous echoes" \
  "apocalyptic city ruins background soundscape dark atmospheric howling wind and faint distant siren" \
  "$OUTPUT_DIR/apocalypse_street_ambient.mp3" \
  "highpass=f=60,lowpass=f=7000,loudnorm=I=-22:TP=-2:LRA=6"

# 7. Taktisches Lagezentrum & Einsatzwahl (Operationszentrale / War Room)
generate_ambient_loop \
  "military tactical operations center command room interior low server hum quiet radio frequencies" \
  "emergency headquarters situation room ambient electronic telemetry radar sweep subtle room tone" \
  "tactical command room low frequency electronic equipment hum and faint background communications static" \
  "$OUTPUT_DIR/tactical_war_room_ambient.mp3" \
  "highpass=f=100,lowpass=f=5500,loudnorm=I=-24:TP=-2:LRA=5"

# 8. Missionsabschluss & Auswertung: Sicherer Evakuierungs-Außenposten / Safe Zone
generate_ambient_loop \
  "military rescue base safe zone interior relief ambient calm generator hum and quiet communications" \
  "evacuation safe outpost shelter ambient gentle machinery humming and peaceful safe zone atmosphere" \
  "secure emergency rescue camp interior quiet equipment low drone and faint radio chatter of victory" \
  "$OUTPUT_DIR/safezone_victory_ambient.mp3" \
  "highpass=f=90,lowpass=f=6000,loudnorm=I=-22:TP=-2:LRA=6"

# 9. Kritische Gesundheit (1 Herz): Schneller Herzschlag und angestrengte Atmung
generate_ambient_loop \
  "fast heavy heartbeat thumping rhythm with intense strained heavy breathing and gasping for air" \
  "dramatic fast heart pulse sound with deep exhausted heavy breathing panting atmosphere" \
  "tense rapid heartbeat pounding soundscape with breathless heavy breathing and gasping" \
  "$OUTPUT_DIR/critical_health_heartbeat.mp3" \
  "highpass=f=40,lowpass=f=6500,loudnorm=I=-19:TP=-2:LRA=6"

echo "Fertig! Alle Spiel-Soundscapes & Effekte erzeugt in $OUTPUT_DIR"
