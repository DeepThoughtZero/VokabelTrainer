#!/bin/bash
# Skript zum Normalisieren aller MP3-Dateien auf eine einheitliche Lautstärke

AUDIO_DIR="assets/audio"
TEMP_DIR="$AUDIO_DIR/normalized"

if [ ! -d "$AUDIO_DIR" ]; then
  echo "Fehler: Ordner $AUDIO_DIR nicht gefunden!"
  exit 1
fi

mkdir -p "$TEMP_DIR"

echo "Starte Normalisierung (EBU R128) für alle MP3-Dateien in $AUDIO_DIR..."
count=0

# Alle MP3s durchgehen
for f in "$AUDIO_DIR"/*.mp3; do
  if [ -f "$f" ]; then
    filename=$(basename "$f")
    # ffmpeg loudnorm filter (I=-16 für angenehme Sprach-Lautstärke)
    ffmpeg -y -hide_banner -loglevel error -i "$f" -af "loudnorm=I=-16:TP=-1.5:LRA=11" "$TEMP_DIR/$filename"
    
    if [ $? -eq 0 ]; then
      # Erfolgreich: Original überschreiben
      mv "$TEMP_DIR/$filename" "$f"
      count=$((count + 1))
      echo -ne "\rFortschritt: $count Dateien normalisiert..."
    else
      echo -e "\nFehler bei: $filename"
    fi
  fi
done

rm -rf "$TEMP_DIR"

echo -e "\nFertig! $count Dateien wurden auf eine einheitliche Lautstärke normalisiert."
