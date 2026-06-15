#!/bin/bash
# Skript zum Anpassen des Seitenverhältnisses und der Bildgröße von Hintergrundbildern.
# Es skaliert das Bild auf 1024x576 (16:9) und schneidet den Rest ab.
# Nutzung: ./scripts/resize_background.sh assets/mein_bild.png

if [ -z "$1" ]; then
    echo "Bitte gib ein Bild an: $0 <Pfad_zum_Bild>"
    exit 1
fi

IMAGE_PATH="$1"

if [ ! -f "$IMAGE_PATH" ]; then
    echo "Fehler: Datei $IMAGE_PATH nicht gefunden."
    exit 1
fi

echo "Verarbeite Bild: $IMAGE_PATH..."

# Bild skalieren auf 1024x576, zentriert, überschüssige Ränder abschneiden
convert "$IMAGE_PATH" -resize 1024x576^ -gravity center -extent 1024x576 "$IMAGE_PATH"

echo "Fertig. Das Bild wurde auf 1024x576 skaliert."
ls -lh "$IMAGE_PATH"
