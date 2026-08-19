# Vokabel Zombie 🧟‍♂️📚

Willkommen bei **Vokabel Zombie** – dem interaktiven Web-Spiel, das Vokabeltraining mit spannender Zombie-Action kombiniert! 

Schärfe dein Wissen, triff die richtigen Entscheidungen und überlebe die anrückende Zombie-Horde durch dein Vokabelwissen.

## 🎮 Spielen

Du kannst das Spiel direkt und bequem in deinem Browser spielen via GitHub Pages:

👉 **[Hier klicken, um Vokabel Zombie zu spielen](https://deepthoughtzero.github.io/VokabelTrainer/)**

## ✨ Features

- **Spannendes Gameplay:** Lerne Vokabeln unter Zeitdruck, während Zombies auf dich zukommen.
- **Dynamische Schwierigkeit:** Falsche Antworten machen die Zombies schneller!
- **Detaillierte Auswertung:** Sieh dir am Ende an, wie gut du abgeschnitten hast.
- **Kursauswahl:** Englisch für Klasse 5 und 6 mit getrennten Lernständen, Bestleistungen und Bestenlisten-Kategorien.

## 🏆 Bestenlisten-Kategorien

Neue Ergebnisse verwenden Kategorien wie `Englisch 5: Unit 1` und `Englisch 6: Unit 1`. Das Google Apps Script muss dafür nicht angepasst werden, da es die Kategorie als freien Text speichert. Die Anzeige behandelt alte Einträge mit `Englisch: …` automatisch als `Englisch 5: …`. Für einheitliche Rohdaten kann die Kategorie-Spalte im Google Sheet trotzdem einmalig entsprechend ersetzt werden.

## 🔊 Vokabel-Audio erzeugen

Klasse 6 verwendet stabile Audio-IDs im Ordner `assets/audio/vocab/en-6`. Fehlende Dateien lassen sich über die lokale Qwen3-TTS-API erzeugen:

```bash
./generate_audio.sh --course en-6 --only-missing --engine qwen3-builtin
```

Der Generator prüft die tatsächliche Audiodauer passend zur Wortzahl und wiederholt verdächtig lange Ausgaben automatisch.

## 🦊 Entwickler

Entwickelt mit ❤️ von **Magic Fox Studios**.

## ⚖️ Lizenz

Alle Rechte vorbehalten. Dieses Projekt ist privates Eigentum von Magic Fox Studios. 
Das Spielen des Spiels über den offiziellen GitHub Pages Link ist ausdrücklich erlaubt und erwünscht. Jede andere Form der Nutzung, Vervielfältigung, Verbreitung oder Modifikation des Codes und der Assets ist ohne vorherige Erlaubnis untersagt. Weitere Details findest du in der [LICENSE](LICENSE) Datei.
