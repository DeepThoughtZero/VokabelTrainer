# AGENTS.md

## Zweck und Produktüberblick

Vokabel Zombie ist ein statisches Browser-Lernspiel für Vokabeltraining unter Zeitdruck. Richtige Übersetzungen bekämpfen Zombies; Lernstand, Streaks, Bestleistungen und Erfolge werden lokal gespeichert. Ergebnisse können freiwillig über eine Google-Sheets-Bestenliste veröffentlicht werden.

Der reguläre Ablauf ist:

1. Passwort
2. AGB und Datenschutz
3. Klasse und Fach
4. Spielfigur und Stadt
5. Lernpfad und Abfragemodus
6. Spiel, Auswertung und optionale Bestenliste

Spielbereit sind Englisch 5 und Englisch 6. Französisch 6 und Latein 6 sind im Kursmodell bereits vorgesehen, bleiben aber deaktiviert, bis geprüfte Vokabeldaten vorliegen.

## Technische Grundlage

- Reines HTML, CSS und JavaScript ohne Bundler oder Frontend-Framework
- Einstiegspunkt: `index.html`
- Hauptlogik: `js/app.js`
- Hosting: GitHub Pages; alle Pfade müssen relativ und statisch auslieferbar bleiben
- Persistenz: `localStorage`, getrennt nach Kurs für SRS und persönliche Bestwerte
- Bestenliste: Google Apps Script und Google Sheet über `js/leaderboard.js`
- Automatisierte Tests: Node-eigener Test Runner, keine npm-Installation erforderlich
- Qualitätsprüfung: ausschließlich lokal über `test.sh`/`scripts/verify.sh`; keine GitHub Actions
- Hilfsskripte: Bash und Python 3; `jq`, `curl`, `ffmpeg` und `ffprobe` werden für Audio benötigt

## Wichtige Ordner und Dateien

- `index.html`: alle Screens und Dialoge sowie Script-Ladereihenfolge
- `css/style.css`: vollständiges UI-Styling
- `js/app.js`: Navigation, Kursaktivierung, Filter, Spiel, SRS, Bestwerte und Audio-Wiedergabe
- `js/courses.js`: Kurskatalog und Verfügbarkeitsmatrix
- `js/vocab_utils.js`: gemeinsame Filter- und Schreibmodus-Helfer
- `js/vocabs.js`: historische Englisch-5-Daten; registriert sich als Kurs `en-5`
- `js/vocabs_en_6.js`: generierte Englisch-6-Daten mit stabilen IDs und Audiopfaden
- `js/leaderboard.js`: Laden, Speichern, Normalisieren und Filtern der Bestenliste
- `scripts/apps-script.js`: serverseitiger Google-Sheets-Endpunkt
- `pictures/Englisch_Klasse5` und `pictures/Englisch_Klasse6`: Quellfotos; durch `.gitignore` ausgeschlossen
- `scripts/vocab_import`: reproduzierbare OCR-, Korrektur-, Build- und Audit-Daten für Englisch 6
- `assets/audio`: bestehende Englisch-5-Audios
- `assets/audio/vocab/en-6`: Englisch-6-Audios, Dateiname gleich stabiler Vokabel-ID
- `tests/course-expansion.test.js`: Kurs-, Migrations- und Filtertests
- `tests/static-contracts.test.js`: statische Pfade, DOM, Ladefolge, Persistenz- und Apps-Script-Verträge
- `tests/vocabulary-integrity.test.js`: Importbericht, Datenvertrag und vollständige Audiozuordnung
- `scripts/check_audio_integrity.py`: lokaler ffprobe- und SPEACHES-Berichts-Gatekeeper
- `scripts/browser_smoke_test.mjs`: echter Headless-Chrome-Smoke-Test ohne npm-Abhängigkeiten
- `scripts/check_tested_snapshot.sh`: stellt sicher, dass Hooks exakt den Commit-/HEAD-Snapshot testen
- `scripts/audio_content_hashes.py`: gemeinsamer SHA-256-Vertrag für MP3, Vokabel- und Sprechtext
- `.githooks`: optionale lokale, snapshot-sichere Pre-Commit- und Pre-Push-Hooks

## Kurs- und Vokabelvertrag

Kurs-IDs folgen dem Muster `<fach>-<klasse>`, derzeit `en-5`, `en-6`, `fr-6` und `la-6`.

Neue Vokabeldaten verwenden diese Felder:

```text
foreign, german, unit, part, page, id, audio
```

Englisch 5 besitzt aus historischen Gründen das Feld `english`; `js/app.js` normalisiert beide Formen intern auf `foreign`. IDs und Audiopfade von Englisch 6 sind dauerhaft. Einträge dürfen nicht umnummeriert werden, nur weil sich die Reihenfolge ändert, da SRS-Daten und Audios daran hängen.

`js/vocabs_en_6.js` umfasst 869 geprüfte Einträge von Seite 285 bis 318. Änderungen sollen über `scripts/vocab_import/class6_corrections.json` und anschließend über `scripts/vocab_import/build_class6_vocabulary.py` reproduzierbar erfolgen. Extraktionsartefakte und echte Buchwiederholungen sind im Importbericht dokumentiert.

Unit-Namen können Doppelpunkte enthalten. Filtersegmente deshalb immer über `VocabUtils.encodeFilterSegment` und `decodeFilterSegment` verarbeiten; niemals wieder mit einem ungeschützten `split(':')` auf Unit-Namen arbeiten.

## Bestenliste und Google Sheet

Neue Kategorien heißen beispielsweise `Englisch 5: Unit 1` und `Englisch 6: Unit 1`. Das Apps Script speichert `kategorie` als freien Text, daher ist für neue Klassen keine Scriptänderung nötig. `js/leaderboard.js` behandelt alte Werte wie `Englisch: Unit 1` automatisch als Englisch 5.

Eine einmalige Ersetzung im Sheet ist nur Datenpflege, keine technische Voraussetzung. Das Sheet- oder Apps-Script-Schema nur ändern, wenn tatsächlich neue Spalten oder Serverfilter benötigt werden. Keine API-URLs oder Zugangsdaten in neue Dateien kopieren.

## OCR- und Datenworkflow für Englisch 6

1. Seitenzuordnung in `scripts/vocab_import/class6_pages.json` prüfen. `PXL_20260817_124608540.jpg` ist Seite 285; die führende 5 ist im Foto abgeschnitten.
2. Fotos mit `preprocess_class6_images.py` vorbereiten.
3. Bei Bedarf lokal mit Ollama/Qwen (`qwen3.8:27b`) extrahieren oder auditieren.
4. Menschlich bestätigte Änderungen ausschließlich in `class6_corrections.json` festhalten.
5. `build_class6_vocabulary.py` ausführen und `class6_import_report.json` kontrollieren.
6. Tests ausführen und Seitenzahl, IDs, Dubletten sowie leere Felder prüfen.

OCR-Vorschläge sind nie automatisch Wahrheit. Seitenbild, Kontext und Drucklayout gehen vor Modellvorschlägen.

## Audioerzeugung und Qualitätskontrolle

Der lokale Qwen3-TTS-Endpunkt läuft üblicherweise auf `http://127.0.0.1:8880` und nutzt die lokale Grafikkarte. Fehlende oder gezielt ausgewählte Audios werden so erzeugt:

```bash
./generate_audio.sh --course en-6 --only-missing --engine qwen3-builtin
./generate_audio.sh --course en-6 --id en6-p289-041 --engine qwen3-builtin
```

Der Generator:

- spricht Englisch mit einer klaren Einmal-Ausgabe-Anweisung,
- normalisiert Lautheit mit `ffmpeg`,
- prüft Dateigröße und echte Dauer relativ zur Wortzahl,
- verwirft leere, beschädigte oder unplausibel lange Clips,
- versucht fehlerhafte Ausgaben bis zu fünfmal,
- beendet den Prozess bei verbleibenden Fehlern mit Exitcode 1.

Größe und Dauer allein entdecken kein kurzes Lachen oder erfundene Wörter. Deshalb anschließend immer den lokalen SPEACHES-Whisper-Rücktest ausführen:

```bash
python3 scripts/verify_audio_speaches.py --course en-6 --workers 2
```

SPEACHES läuft üblicherweise auf Port 8000. Der API-Schlüssel kommt aus `SPEACHES_API_KEY`/`API_KEY` oder wird lokal aus dem Container `speaches` gelesen; nie ausgeben oder einchecken. Der Bericht liegt in `scripts/vocab_import/class6_audio_stt_report.json` und unterscheidet `pass`, `review`, `fail` und transparente Kontext-Sonderprüfungen.

Jeder Berichtseintrag ist über SHA-256 an die exakten MP3-Bytes, den originalen Vokabeltext und den normalisierten erwarteten Sprechtext gebunden. Die Vollprüfung vergleicht Inhalte und keine Dateizeitstempel; dadurch bleibt der Nachweis auch nach einem frischen Clone zuverlässig. Hashabweichungen nie durch manuelles Umschreiben des Berichts „bestätigen“, sondern nach Audio- oder Textänderungen `./test.sh --with-stt` ausführen.

Markierte Clips lassen sich gesammelt neu erzeugen:

```bash
./generate_audio.sh --course en-6 \
  --ids-from-report scripts/vocab_import/class6_audio_stt_report.json \
  --engine qwen3-builtin
```

Whisper ist bei isolierten, sehr kurzen Wörtern und Homophonen keine perfekte Ausspracheinstanz. Solche Fälle kontextgestützt prüfen und jede Ausnahme in `audio_verification_overrides.json` mit Methode, Transkript und Wahrscheinlichkeit begründen. Keine pauschalen Ausnahmen hinzufügen.

Für im Bericht verbleibende `fail`-/`review`-Kurzclips steht dafür der reproduzierbare Kontext-Crop-Lauf bereit:

```bash
python3 scripts/regenerate_audio_in_context.py
```

### Soundeffekt-Generierung mit AudioGen API

Für Soundeffekte (Hubschrauber-Ambient, Ausweich-Windböen, Notfall-Alarm) steht der lokale Container `audiogen-api` (`facebook/audiogen-medium`) auf `http://127.0.0.1:8011` bereit.

Soundeffekte werden mit folgendem Skript reproduzierbar generiert und normalisiert:

```bash
./scripts/generate_command_ambient_audio.sh
```

Erzeugte MP3-Dateien liegen in `assets/audio/ui/`:
- `helicopter_cabin_ambient.mp3`: Kontinuierliches Cockpit- und Wind-Ambient für die Mobile Kommandozentrale
- `helicopter_evasion_wind.mp3`: Turbulente Windböe und Triebwerksbeschleunigung bei Ausweichmanövern
- `mission_fail_retreat.mp3`: Notfall-Alarmsirene bei gescheiterten Rettungsmissionen
- `halo_cargo_plane_ambient.mp3`: Druckkabine & Triebwerksdröhnen des Transportflugzeugs bei der HALO-Einsatzplanung
- `halo_freefall_wind.mp3`: Sturzflug- und Freifall-Windstoß beim HALO-Absprung ins Zielgebiet
- `apocalypse_street_ambient.mp3`: Postapokalyptisches Stadt-Ambient mit heulendem Wind und fernen Sirenen für die Zombie-Straßenschlacht
- `tactical_war_room_ambient.mp3`: Taktisches Lagezentrum, Serverbrummen und Radarabtastung bei Stadt- und Einsatzwahl
- `safezone_victory_ambient.mp3`: Ruhiges Evakuierungs- und Stützpunkt-Ambient nach erfolgreicher Rettungsmission
- `critical_health_heartbeat.mp3`: Dramatischer, schneller Herzschlag und angestrengte Atmung bei kritischer Gesundheit (1 Herz)



## Arbeitsweise für Änderungen

- Bestehende Nutzeränderungen und nicht zugehörige Dateien nicht überschreiben.
- Generierte Daten nur zusammen mit ihren Quellen, Korrekturen und Berichten ändern.
- Kursabhängige Zustände stets über `state.courseId` trennen.
- Englisch-5-`localStorage`-Migrationen erhalten; bestehende Lernstände dürfen nicht verloren gehen.
- UI-Texte für Fach und Klasse aus dem aktiven Kurs ableiten, nicht hart auf Englisch verdrahten.
- Französisch benötigt Unicode-fähige Buchstabenbehandlung; der Schreibmodus verwendet deshalb Unicode-Letter-Tokenisierung.
- Bei neuen Units mit Satzzeichen Filterkodierung und Bestenlisten-Kategorien testen.
- Secrets, `.env`, Quellfotos und temporäre OCR-/Audioartefakte nicht committen.
- Keine erzeugten `__pycache__`, `*.tmp.mp3` oder Server-Logs im Repository lassen.

## Verifikation vor Commit und Push

Die einheitliche lokale Prüfkette lautet:

```bash
./test.sh --quick     # vor einem Commit
./test.sh --full      # vor einem Push
./test.sh --with-stt  # nach Audioänderungen; erneuert den SPEACHES-Vollbericht
```

`--quick` prüft Diff-Hygiene, Konfliktmarker, unerlaubte Cache-/Temporärdateien, JavaScript-/Bash-/Python-Syntax, Hook-Snapshot-Verhalten, SHA-256-Inhaltsverträge und alle Node-Tests. `--full` startet zusätzlich den echten Browser-Smoke-Test in Desktop- und Mobilgröße, validiert exakt 869 MP3s mit `ffprobe` und verlangt einen vollständigen, inhaltlich per SHA-256 gebundenen SPEACHES-Bericht. `--with-stt` führt den lokalen Whisper-Rücktest zuvor neu aus. Es gibt bewusst keine GitHub-Action.

Verbindliche lokale Alltagsregeln:

- Nur nach Audioänderungen vor dem Commit beziehungsweise Push einmal `./test.sh --with-stt` ausführen.
- Bei einem neuen Clone oder auf einem anderen Rechner die Hooks einmalig mit `./scripts/install_git_hooks.sh` aktivieren.

Lokale Hooks werden nicht ungefragt aktiviert. Nach ihrer Aktivierung startet Pre-Commit `--quick` und Pre-Push `--full`. Pre-Commit akzeptiert nur einen Arbeitsbaum ohne nicht vorgemerkte oder nicht versionierte Dateien, damit der getestete Stand exakt dem Git-Index entspricht. Pre-Push verlangt einen vollständig sauberen Arbeitsbaum, damit exakt `HEAD` getestet wird.

`--full` sucht `google-chrome-stable`, `google-chrome`, `chromium` oder `chromium-browser`. Auf abweichenden Installationen den vollständigen Browserpfad über `BROWSER_BIN` setzen. Der automatische Smoke-Test prüft Passwort → AGB/Datenschutz → Englisch 6 → Spielfigur → Stadt → Lernpfad → Spiel sowie Klassenfilter und Überlauf der Bestenliste bei 1280×720 und 390×844.

Für größere UI-Änderungen zusätzlich visuell lokal ausliefern und den echten Browserablauf prüfen:

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Zusätzlich zum automatischen Smoke-Test insbesondere Animationen, Audio-Wiedergabe, Rücknavigation und schwer per Geometrie erkennbare visuelle Fehler kontrollieren.

Bei Audio- oder Datenänderungen zusätzlich sicherstellen:

- exakt 869 Englisch-6-Datensätze und 869 erwartete MP3-Pfade,
- keine fehlenden oder zusätzlichen Audio-IDs,
- keine temporären MP3-Dateien,
- abschließender SPEACHES-Bericht ohne ungeklärte grobe Halluzinationen.
