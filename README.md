# Dayo

Persönlicher Telegram-Alltagsbegleiter für Henrik. Node.js/Express-Bot, deployed auf Railway.

## Module

| Datei | Zweck |
|---|---|
| `index.js` | Bot-Einstiegspunkt: Commands, Intent-Erkennung (Claude), Foto/PDF-/Sprach-Handler |
| `calendar.js` | Eigener minimaler CalDAV/ICS-Client gegen iCloud (Kalender "Henrik" & "Privat") |
| `fitness.js` | 50-Tage-Trainingsplan, Daten werden aus `fitnessplan.html` extrahiert |
| `fridge.js` | Kühlschrank-Datenmodell & -Logik (JSON-Datei `kuehlschrank.json`) |
| `vision.js` | Kassenbon-Scan (Foto/PDF) via Claude, inkl. Produkt- & Kategorie-Erkennung |
| `barcode.js` | Barcode-Lookup gegen Open Food Facts |
| `bring.js` | Bring!-Einkaufslisten-Integration |
| `voice.js` | Sprachnachrichten-Transkription (Whisper) |
| `scheduler.js` | Cron: 7:30 Uhr Tagesübersicht, montags 8 Uhr Wochenübersicht |
| `format.js` | Text-Formatierung für Bot-Nachrichten |
| `server.js` + `public/index.html` | Telegram Mini App zur Kühlschrankverwaltung |

## Setup

`.env` benötigt: `TELEGRAM_BOT_TOKEN`, `ALLOWED_USERS`, `MY_TELEGRAM_ID`, `MY_ICLOUD_EMAIL`, `MY_ICLOUD_PASSWORD`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `BRING_EMAIL`, `BRING_PASSWORD`, `WEBAPP_URL`.

```
npm install
npm start
```

## Kühlschrank Mini App – aktueller Stand (Juli 2026)

Die Mini App (`public/index.html`) zeigt den Kühlschrankinhalt gruppiert nach Lagerort und erlaubt pro Artikel eine Detail-Pflege.

**Datenmodell** (`kuehlschrank.json`, verwaltet über `fridge.js`):
```js
{ name, quantity, unit, category, expiryDate, fullQuantity }
```
- `category`: `kuehlschrank` | `tiefkuehlfach` | `speisekammer` (Pflichtfeld, Default `kuehlschrank` für Altbestände)
- `expiryDate`: ISO-Datum (MHD), nullable, manuell gepflegt
- `fullQuantity`: Referenzmenge für die %-Berechnung, nur bei Gewicht/Volumen-Einheiten (`g`/`kg`/`ml`/`l`) relevant, wird automatisch beim (Nach-)Hinzufügen gesetzt

**Ebene 1 (Liste):** nach Kategorie gruppiert mit Sticky-Headern (🧊/❄️/🥫 inkl. Artikelzahl). Zeile zeigt Name, Info-Pill (Füllstand-% bei Gewicht/Volumen, sonst Stückzahl), optionales Ablauf-Badge (rot „Abgelaufen“, orange „in X Tagen“), Bring!-Button, Swipe-to-delete. Keine Produkt-Emojis mehr (bewusst entfernt – zu ungenau, evtl. später eigene Produkt-Datenbank).

**Ebene 2 (Detail-Sheet, Tap auf Zeile):** Kategorie ändern (Pflicht-Chips), MHD setzen (Datumsfeld + Schnellauswahl-Chips +3 Tage/+1 Woche/+2 Wochen/+1 Monat), Menge anpassen – Füllstand-Slider (0–100%, farbcodiert grün→rot) bei Gewicht/Volumen-Artikeln, klassischer Stepper bei zählbaren Einheiten, Artikel löschen.

**Kategorie-Zuordnung:**
- Kassenbon-Scan (95% der Fälle): Claude liefert `category` direkt in der Vision-Anfrage mit
- Manuelles Hinzufügen / Barcode-Scan: Pflicht-Auswahl im Add-Sheet, vorbelegt durch clientseitige Keyword-Heuristik `guessCategory()` in `index.html`

**Offener Punkt:** `guessCategory()` ist eine generische Zuordnung (abgeleitet aus Lebensmittel-Keywords). Kann anhand eines echten Kassenbons/typischer Produktliste weiter kalibriert werden.

### Betroffene Dateien
`fridge.js`, `server.js` (PATCH `/api/fridge/:name` akzeptiert jetzt `quantity`, `category`, `expiryDate`, `fullQuantity` zusätzlich zu `delta`), `vision.js` (Prompt), `public/index.html`.
