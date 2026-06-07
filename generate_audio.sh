#!/usr/bin/env bash
set -Eeuo pipefail

# Erzeugt MP3-Dateien für Shintaro Battles über die lokale TTS-API.
#
# Verwendung:
#   ./generate_audio.sh                  # Alle Audios neu generieren (Standard-Engine)
#   ./generate_audio.sh --only-missing   # Nur fehlende Audios generieren
#
# Engines:
#   ENGINE=voxtral     – Voxtral-TTS (Standard), Port 8091
#   ENGINE=chatterbox  – Chatterbox Voice Cloning, Port 4123
#   ENGINE=qwen3       – Qwen3-TTS Voice Cloning via /v1/audio/speech/upload, Port 8880
#   ENGINE=qwen3-builtin – Qwen3-TTS mit eingebauter Stimme (kein Klonen), Port 8880
#
# Konfigurierbar per Umgebungsvariablen:
#   ENGINE, VOICE, OUTPUT_DIR, API_URL, MODEL, SPEED
#   Nur für qwen3: REF_AUDIO, REF_TEXT, LANGUAGE

# ── Argumente parsen ──
ONLY_MISSING=false
PAGE_FILTER=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --only-missing)
      ONLY_MISSING=true
      shift
      ;;
    --page)
      PAGE_FILTER="$2"
      shift 2
      ;;
    --engine)
      ENGINE="$2"
      shift 2
      ;;
    --voice)
      VOICE="$2"
      shift 2
      ;;
    --help|-h)
      echo "Verwendung: $0 [--only-missing] [--page <seite>] [--engine <name>] [--voice <name>]"
      exit 0
      ;;
    *)
      echo "Unbekanntes Argument: $1"
      exit 1
      ;;
  esac
done

ENGINE="${ENGINE:-qwen3-builtin}"
OUTPUT_DIR="${OUTPUT_DIR:-assets/audio}"

if [[ "$ENGINE" == "chatterbox" ]]; then
  API_URL="${API_URL:-http://127.0.0.1:4123/v1/audio/speech}"
  MODEL="${MODEL:-tts-1}"
  VOICE="${VOICE:-Ninjago_MeisterWu03}"
  SPEED="${SPEED:-1.0}"
elif [[ "$ENGINE" == "qwen3" ]]; then
  API_URL="${API_URL:-http://127.0.0.1:8880/v1/audio/speech/upload}"
  REF_AUDIO="${REF_AUDIO:-/home/bigbrain/AiStack/qwen3-tts/voices/Ninjago_MeisterWu03.wav}"
  REF_TEXT="${REF_TEXT:-Nach Garmadons Fall war das Gleichgewicht der Elemente wiederhergestellt und Ninjago genoss viele Jahre des Friedens.}"
  LANGUAGE="${LANGUAGE:-German}"
  SPEED="${SPEED:-1.0}"
  [[ -f "$REF_AUDIO" ]] || {
    echo "Fehler: Referenz-Audio nicht gefunden: $REF_AUDIO" >&2
    exit 1
  }
elif [[ "$ENGINE" == "qwen3-builtin" ]]; then
  API_URL="${API_URL:-http://127.0.0.1:8880/v1/audio/speech}"
  MODEL="${MODEL:-qwen3-tts}"
  VOICE="${VOICE:-ryan}"
  LANGUAGE="${LANGUAGE:-english}"
  SPEED="${SPEED:-1.0}"
else
  # Default to Voxtral
  API_URL="${API_URL:-http://127.0.0.1:8091/v1/audio/speech}"
  MODEL="${MODEL:-mistralai/Voxtral-4B-TTS-2603}"
  VOICE="${VOICE:-casual_male}"
  SPEED="${SPEED:-1.0}"
fi

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Fehler: Benötigtes Programm '$1' wurde nicht gefunden." >&2
    exit 1
  }
}

require_cmd curl
require_cmd jq

mkdir -p "$OUTPUT_DIR"

# ── Synthesize-Funktionen je Engine ──

synthesize_json() {
  local text="$1"
  local outfile="$2"

  local payload
  if [[ "$ENGINE" == "qwen3-builtin" ]]; then
    payload=$(jq -n \
      --arg model "$MODEL" \
      --arg input "$text" \
      --arg voice "$VOICE" \
      --arg language "$LANGUAGE" \
      --arg response_format "mp3" \
      --argjson speed "$SPEED" \
      '{model: $model, input: $input, voice: $voice, language: $language, response_format: $response_format, speed: $speed}')
  else
    payload=$(jq -n \
      --arg model "$MODEL" \
      --arg input "$text" \
      --arg voice "$VOICE" \
      --arg response_format "mp3" \
      --argjson speed "$SPEED" \
      '{model: $model, input: $input, voice: $voice, response_format: $response_format, speed: $speed}')
  fi


  curl --silent --show-error --fail \
    -X POST "$API_URL" \
    -H 'Content-Type: application/json' \
    --data "$payload" \
    --output "$outfile"

  if [[ ! -s "$outfile" ]]; then
    echo "❌ Fehler: Ausgabe leer für $outfile" >&2
    return 1
  fi
}

synthesize_clone() {
  local text="$1"
  local outfile="$2"


  curl --silent --show-error --fail \
    -X POST "$API_URL" \
    -F "input=$text" \
    -F "voice_file=@$REF_AUDIO" \
    -F "ref_text=$REF_TEXT" \
    -F "language=$LANGUAGE" \
    -F "response_format=mp3" \
    -F "speed=$SPEED" \
    --output "$outfile"

  if [[ ! -s "$outfile" ]]; then
    echo "❌ Fehler: Ausgabe leer für $outfile" >&2
    return 1
  fi
}

synthesize_file() {
  if [[ "$ENGINE" == "qwen3" ]]; then
    synthesize_clone "$1" "$2"
  else
    synthesize_json "$1" "$2"
  fi
}

# ── Zähler ──
count_generated=0
count_skipped=0
count_failed=0
count_total=0

echo "Engine: $ENGINE | Ziel: $OUTPUT_DIR"
echo "Stimme: $VOICE"
echo "---"

# Lese alle Vokabeln aus js/vocabs.js
jq_input=$(sed -e 's/^const VOCABULARY = //' -e 's/;$//' -e 's/\/\/.*//' js/vocabs.js)

if [[ -n "$PAGE_FILTER" ]]; then
  jq_items=$(echo "$jq_input" | jq -c "map(select(.page == $PAGE_FILTER))")
else
  jq_items="$jq_input"
fi
total_items=$(echo "$jq_items" | jq '. | length')
count_current=0

while IFS= read -r item; do
  count_current=$((count_current + 1))
  english=$(jq -r '.english' <<<"$item")
  
  # Dateiname anpassen (Schrägstriche ersetzen, um Pfadprobleme zu vermeiden)
  filename=$(echo "$english" | sed 's/\//_/g')
  filepath="$OUTPUT_DIR/${filename}.mp3"
  count_total=$((count_total + 1))

  # Text für TTS vorbereiten
  text="$english"
  # Whitelist: Klammern entfernen und Text behalten / direkt ausschreiben
  text=$(echo "$text" \
    | sed 's/(to)/to/g' \
    | sed 's/(a club)/a club/g' \
    | sed 's/(sb\.)/somebody/g' \
    | sed 's/(on sth\.)/on something/g' \
    | sed 's/(to sb\.)/to somebody/g' \
    | sed 's/(sth\. to sth\.)/something to something/g' \
    | sed 's/(to sth\.\/sb\.)/to something or somebody/g' \
    | sed 's/(for)/for/g' \
    | sed 's/(in)/in/g' \
    | sed 's/(of)/of/g' \
    | sed 's/(gram)/gram/g' \
    | sed 's/(pl teeth)/plural teeth/g')

  # Blacklist: Alle übrigen Klammerausdrücke komplett entfernen
  text=$(echo "$text" | sed -E 's/\([^)]*\)//g')

  # Abkürzungen außerhalb von Klammern ausschreiben
  text=$(echo "$text" | sed 's/\bsth\./something/g' | sed 's/\bsb\./somebody/g')

  # pl als eigenständiges Wort zu plural machen
  text=$(echo "$text" | sed -E 's/\bpl\b/plural/g')

  # Schrägstriche durch 'or' ersetzen
  text=$(echo "$text" | sed 's/\// or /g')

  # Überschüssige Leerzeichen trimmen
  text=$(echo "$text" | sed -E 's/ +/ /g' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')

  # Ersten Buchstaben groß schreiben und Punkt ans Ende setzen, 
  # um "ahm" und andere Füllwörter bei der KI zu vermeiden (klare Aussagesätze)
  text="$(tr '[:lower:]' '[:upper:]' <<< ${text:0:1})${text:1}"
  if [[ ! "$text" =~ [.\!\?]$ ]]; then
    text="${text}."
  fi

  if $ONLY_MISSING && [[ -f "$filepath" ]]; then
    echo "⏭️  Überspringe $filename (existiert bereits)"
    count_skipped=$((count_skipped + 1))
    continue
  fi

  max_retries=10
  attempt=1
  success=false

  while [[ $attempt -le $max_retries ]]; do
    printf "(%03d/%03d) 🎙️  Erzeuge %-25s (Versuch %2d/%d)... " "$count_current" "$total_items" "$filename" "$attempt" "$max_retries"

    if synthesize_file "$text" "$filepath.tmp.mp3" >/dev/null; then
      ffmpeg -y -hide_banner -loglevel error -i "$filepath.tmp.mp3" -af "loudnorm=I=-16:TP=-1.5:LRA=11" "$filepath"
      rm -f "$filepath.tmp.mp3"
      
      filesize=$(stat -c%s "$filepath" 2>/dev/null || echo 0)
      if [[ $filesize -lt 30720 ]]; then
        echo "✅ OK ($((filesize/1024)) KB)"
        success=true
        count_generated=$((count_generated + 1))
        break
      else
        echo "⚠️ Zu groß ($((filesize/1024)) KB) -> Wiederholung"
        rm -f "$filepath"
      fi
    else
      echo "❌ API-Fehler"
    fi
    attempt=$((attempt + 1))
  done

  if [[ "$success" == false ]]; then
    echo "❌ Aufgegeben bei $filename"
    count_failed=$((count_failed + 1))
  fi
done < <(echo "$jq_items" | jq -c '.[]')

echo
echo "═══════════════════════════════════"
echo "Fertig. Dateien liegen in: $OUTPUT_DIR"
echo "  Generiert: $count_generated"
echo "  Übersprungen: $count_skipped"
echo "  Fehler: $count_failed"
echo "═══════════════════════════════════"

