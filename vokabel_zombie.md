# Vokabel-Zombie 🧟‍♂️🏹
**Entwickler- & KI-Dokumentation**

Dieses Dokument dient künftigen KI-Agenten und Entwicklern als Einstiegs- und Referenzpunkt, um die Funktionsweise, Struktur und Entstehungsprozesse des Spiels "Vokabel-Zombie" zu verstehen.

## 🎯 Spiel-Idee
Ein Gamification-Vokabeltrainer. Der Spieler verteidigt sich als "Jäger" gegen heranrückende "Zombies". Ein Zombie nähert sich kontinuierlich von rechts nach links. Der Spieler muss Multiple-Choice-Fragen beantworten (Übersetzung von Englisch zu Deutsch oder umgekehrt).
- **Richtig beantwortet:** Ein Schuss löst sich, der Zombie wird besiegt und der Spieler erhält Punkte. Verlorene Herzen können über "Streaks" (fehlerfreie Serien) regeneriert werden.
- **Falsch beantwortet oder zu langsam:** Der Zombie erreicht den Jäger (`Kollision`), was zu einem Herzverlust führt. Die Geschwindigkeit des Spiels zieht an.

## 🏗️ Architektur
Das Spiel ist ein reines Frontend-Projekt ohne Backend.
- **`index.html`**: Beinhaltet die Struktur, das Startmenü (mit Glasmorphismus-UI) und die eigentliche Spiel-Ansicht.
- **`css/style.css`**: Styling, Animationen (inkl. dynamischer Projektil-Effekte) und Layouts (CSS Grid, Flexbox).
- **`js/app.js`**: Die Game-Engine. Arbeitet mit einem statusbasierten System (`state` Objekt) und einem Frame-basierten Game-Loop (`requestAnimationFrame`), der auf Zeit-Deltas basiert, um Framerate-Schwankungen auszugleichen.
- **`js/vocabs.js`**: Die Datenquelle. Eine Array-Struktur von Vokabel-Objekten.

## 📖 Vokabel-Daten & Extraktion
Die Vokabeln wurden ursprünglich aus Fotos eines Lehrbuchs extrahiert. 
Da die manuelle Eingabe ineffizient wäre, wurde ein **KI-Vision-Subagent** genutzt, um alle Bilder auszulesen und in ein einheitliches JSON/JS-Format zu konvertieren. 
Die Bilder der Buchseiten liegen thematisch sortiert in Ordnern (z.B. `pictures/Englisch_Klasse5/Unit3u4`). Der Subagent durchläuft diese Bilder systematisch. Für jedes Bild extrahiert er die englischen Begriffe, die deutschen Übersetzungen sowie strukturelle Meta-Informationen aus dem Kontext der Buchseite (z.B. "Unit 3", "Part A", oder die Seitenzahl, sofern sichtbar oder aus der Reihenfolge ableitbar). 
Diese Meta-Informationen sind essenziell, damit später im Spiel präzise gefiltert werden kann. Sie fließen direkt als Eigenschaften (`unit`, `part`, `page`) in das JSON-Objekt jedes Vokabel-Paares ein.

### Datenstruktur in `vocabs.js`
```javascript
const VOCABULARY = [
  { "english": "thought bubble", "german": "die Gedankenblase", "unit": "Unit 3", "part": "In our free time", "page": 248 },
  { "english": "half", "german": "halb", "unit": "Unit 3", "part": "Part A", "page": 250 }
  // ...
];
```
Diese Struktur erlaubt es der `initFilters()` Funktion in `app.js`, beim Start des Spiels automatisch dynamische Grid-Filter (Nach Unit, Nach Part, Nach Seite) im Startmenü zu generieren.

## 🎨 Asset-Generierung (Zombies & Jäger)
Sämtliche Sprites (Spielfiguren) wurden über einen Bild-Generierungs-Prompt direkt durch die KI erstellt.

### 1. Prompts
Wichtige Kriterien für das Prompting waren: 2D Game Asset, isoliert auf weißem Hintergrund, im Comic-Stil und **strenge Jugendfreigabe (kein Blut)**.
- **Beispiel Zombie-Prompt:** *"A terrifying, menacing cartoon zombie, scary and spooky but strictly NO BLOOD, glowing menacing eyes, wearing tattered dark clothes, creepy posture, walking towards the left, 2d game asset, comic book style, highly detailed, isolated on a pure white background."*
- **Beispiel Jäger-Prompt:** *"A teenage hero character with a big futuristic water gun, water tank backpack, confident pose facing right, comic book style, full body character, isolated on a pure white background, 2d game asset."*

### 2. Bildbearbeitung (Transparenz & Ausrichtung)
Generierte Bilder hatten oft einen weißen Hintergrund und blickten teils in die falsche Richtung. Dies wurde in der Kommandozeile automatisiert mit `ImageMagick` (`mogrify`) korrigiert:

```bash
# Weiß in Transparent umwandeln und überflüssigen Rand wegschneiden (Fuzz-Toleranz je nach Bild 2% bis 5%)
mogrify -fuzz 5% -transparent white -trim +repage zombie.png

# Bild horizontal spiegeln (falls der Zombie fälschlicherweise nach rechts lief)
mogrify -flop zombie.png
```

## ⚙️ Wichtige Mechaniken & Fallstricke

### Kollisionserkennung
Die Kollision findet auf der horizontalen X-Achse statt. Da der Jäger bei `left: 100px` steht und eine gewisse Breite hat, wurde die Kollisionsdistanz auf `200px` gesetzt.
- **Code:** `if (state.zombiePosition <= 200) { takeDamage(); }`

### CSS "Gummiband"-Fehler (Bug-Historie)
**Problem:** Der Zombie blieb visuell in der Bildschirmmitte hängen, obwohl er logisch den Spieler erreichte.
**Ursache:** Im CSS war `right: -100px` gesetzt, während `app.js` gleichzeitig `left: ...px` animierte. Das führte dazu, dass der Container sich über den Bildschirm streckte, anstatt sich zu bewegen. Durch das Entfernen des `right` Werts wurde dies behoben.

### Schuss-Animation
Die Projektile sind reine CSS-Animationen (`.proj-laser`, `.proj-water`, etc.). 
Damit der Schuss direkt aus der Waffe kommt, startet er bei `left: 320px`. Anstatt den Schuss nach links zu verschieben, **wird per JS dynamisch seine Breite (`width`) animiert**, sodass er sich von der Mündung bis zum aktuellen Standort des Zombies (`state.zombiePosition`) streckt.

### Quota-Limits (API)
Bei der Massen-Generierung von Bildern (z.B. 10 Zombies am Stück) schlägt die Bild-API schnell in einen `429 Too Many Requests` (Quota Limit).
**Lösung für spätere Agenten:** Prompts dosiert absenden, existierende Arrays reduzieren und dem Nutzer klar kommunizieren, falls ein Limit erreicht wurde.

## 🔊 TTS (Text-to-Speech) & Audio

Die Vokabeln werden im Spiel per Sprachausgabe (TTS) vorgelesen. Dies wird durch das Shell-Skript `generate_audio.sh` gesteuert.

### 1. Engine & Stimmen
Das Skript unterstützt verschiedene lokale TTS-APIs:
- **`qwen3-builtin` (Aktueller Standard):** Läuft lokal auf Port 8880. Die aktuelle Standard-Stimme ist `ryan` (männlich, englisch). Diese Kombination hat sich als besonders robust, verständlich und gut klingend erwiesen.
- **Weitere verfügbare Qwen3-Stimmen:** `aiden`, `eric`, `dylan`, `serena`, `vivian`, etc.
- **Alternative Engines:** `voxtral` (Port 8091), `chatterbox` (Port 4123) oder Qwen3-Voice-Cloning (`qwen3`).

### 2. Prompt-Engineering gegen KI-Füllwörter
Ein typisches Problem von KI-basierten TTS-Modellen (wie Qwen3 oder Voxtral) ist das Einfügen von Konversations-Füllwörtern wie "Ähm" oder "Uhm", wenn sie nur einzelne Wörter oder kurze Fragmente ohne Satzzeichen erhalten. 
**Lösung im Skript:** Die `generate_audio.sh` bereitet den Text vor dem Senden an die API automatisch auf:
1. Der erste Buchstabe wird konsequent **großgeschrieben**.
2. An das Ende der Vokabel wird zwingend ein **Satzzeichen (Punkt `.`)** gehängt.
Dadurch wird die API gezwungen, das Wort als geschlossenen Aussagesatz zu interpretieren. Füllwörter treten somit nicht mehr auf.

### 3. Inline-Normalisierung (EBU R128)
Da unterschiedliche Vokabeln leicht variierende Lautstärken haben können, nutzt das Skript direkt nach der Erstellung jeder einzelnen Audiodatei das Tool `ffmpeg`, um einen `loudnorm`-Filter (EBU R128 Standard) anzuwenden. 
- Parameter: `loudnorm=I=-16:TP=-1.5:LRA=11`
- Das sorgt für ein komplett gleichmäßiges und verzerrungsfreies Audio-Level über das gesamte Vokabular hinweg.

### 4. Bedienung der \`generate_audio.sh\`
Das Skript ist modular und kann flexibel auf der Kommandozeile bedient werden:
- `./generate_audio.sh` -> Generiert das gesamte Vokabular neu (überschreibt bestehende Dateien).
- `./generate_audio.sh --only-missing` -> Überspringt Dateien, die bereits im Ordner `assets/audio` liegen.
- `./generate_audio.sh --page 248 --engine qwen3-builtin --voice aiden` -> Generiert gezielt nur die Audios für eine bestimmte Seite mit einer abweichenden Stimme/Engine.
