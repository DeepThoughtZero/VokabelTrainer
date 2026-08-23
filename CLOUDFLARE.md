# Cloudflare Pages Deployment & Konfiguration

Diese Dokumentation beschreibt die Bereitstellung von **Vokabel Zombie** über Cloudflare Pages mit vorgeschaltetem Authentifizierungsschutz.

## 🌐 Live-Adresse

- **Produktions-URL:** [https://vokabeltrainer-36s.pages.dev/](https://vokabeltrainer-36s.pages.dev/)

---

## ⚙️ Cloudflare Pages Build-Einstellungen

In der Cloudflare Pages Dashboard-Konfiguration des Projekts sind folgende Einstellungen hinterlegt:

| Einstellung | Wert |
| :--- | :--- |
| **Framework preset** | `None` |
| **Build command** | `./scripts/build_cloudflare.sh` *(oder `rm -rf dist && mkdir dist && cp index.html dist/ && cp -r css js assets dist/`)* |
| **Build output directory** | `dist` |
| **Root directory** | `/` |

### Warum ein isoliertes `dist/`-Verzeichnis?
- Nur die tatsächlich für die Auslieferung im Browser benötigten Dateien (`index.html`, `css/`, `js/`, `assets/`) werden nach `dist/` kopiert.
- Quellfotos, lokale Entwicklungsskripte, Python-Dateien, OCR-Dateien und automatisierte Tests werden nicht unnötig in das CDN hochgeladen.
- `dist/` ist in `.gitignore` eingetragen und wird nicht ins Git-Repository committet.

---

## 🔒 Zugangsschutz (Fail-Closed Auth-Middleware)

Der serverseitige Zugriffsschutz wird über Cloudflare Pages Functions gesteuert:

- **Datei:** [`functions/_middleware.js`](functions/_middleware.js)

### Funktionsweise:
1. **Vorlauf vor statischen Assets:** Die Middleware läuft auf Edge-Servern vor allen statischen Dateien (HTML, CSS, JS, Bilder, Videos und MP3-Audios).
2. **HTTP Basic Auth:** Nicht authentifizierte Anfragen erhalten HTTP 401 mit dem `WWW-Authenticate: Basic`-Header. Der Benutzername kann beliebig gewählt werden.
3. **Fail-Closed:** Ist das Secret `AUTH_PASS` in den Umgebungsvariablen nicht gesetzt, antwortet die Middleware mit HTTP 503 (Dienst nicht verfügbar), anstatt die Inhalte ungeschützt freizugeben.
4. **Keine Secrets im Repository:** Das Passwort existiert ausschließlich verschlüsselt als Environment Secret im Cloudflare Dashboard unter der Variablen `AUTH_PASS`.

---

## 🔄 Deployment-Ablauf

```text
git push origin main
       ↓
Cloudflare Pages Build Trigger
       ↓
./scripts/build_cloudflare.sh (erstellt sauberes dist/)
       ↓
Cloudflare Pages Functions (_middleware.js Auth-Gate)
       ↓
Veröffentlichung auf https://vokabeltrainer-36s.pages.dev/
```
