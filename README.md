# Dayo

Persönlicher Telegram-Alltagsbegleiter für Henrik. Node.js/Express-Bot, deployed auf Railway.

## Module

| Datei | Zweck |
|---|---|
| `index.js` | Bot-Einstiegspunkt: Commands, Intent-Erkennung (Claude), Foto/PDF-/Sprach-Handler |
| `calendar.js` | Eigener minimaler CalDAV/ICS-Client gegen iCloud (Kalender "Henrik" & "Privat") |
| `fitness.js` | 50-Tage-Trainingsplan, Daten werden aus `fitnessplan.html` extrahiert |
| `fitnessplan.html` | Trainings-/Ernährungsplan als Telegram Mini App (mobil optimiert, ausgeliefert über `server.js`) |
| `fridge.js` | Kühlschrank-Datenmodell & -Logik (JSON-Datei `kuehlschrank.json`) |
| `vision.js` | Kassenbon-Scan (Foto/PDF) via Claude, inkl. Produkt- & Kategorie-Erkennung |
| `barcode.js` | Barcode-Lookup gegen Open Food Facts |
| `bring.js` | Bring!-Einkaufslisten-Integration |
| `voice.js` | Sprachnachrichten-Transkription (Whisper) |
| `scheduler.js` | Cron: 7:30 Uhr Morgennachricht (Zitat + Termine + Training + BTC-Kurs), montags 8 Uhr Wochenübersicht |
| `quote.js` | Tägliches inspirierendes Zitat (von Claude generiert), nur für die 7:30-Morgennachricht |
| `bitcoin.js` | Aktueller BTC-Kurs in USD (CoinGecko), nur für die 7:30-Morgennachricht |
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

## Morgennachricht – aktueller Stand (Juli 2026)

Die automatische 7:30-Uhr-Nachricht (`scheduler.js` → `formatMorningOverview()` in `format.js`) startet mit einem inspirierenden Zitat, gefolgt von der gewohnten Tagesübersicht (Termine + Training) und endet mit dem aktuellen Bitcoin-Kurs in USD:

1. **Zitat** (`quote.js`): wird bei jedem Lauf frisch von Claude generiert (Englisch, mit Autor:in). Schlägt der Call fehl, liefert die Funktion `null` zurück – die restliche Nachricht wird trotzdem verschickt.
2. **Termine + Training**: unverändert wie bisher (`formatDailyOverview()`).
3. **Bitcoin-Kurs** (`bitcoin.js`): Live-Preis von CoinGecko, ebenfalls fehlertolerant (`null` bei API-Fehler → Abschnitt entfällt einfach).

`/heute` und der „Heute"-Button bleiben bewusst unverändert (kein Zitat/BTC-Kurs) – die Ergänzung betrifft nur die automatische Morgennachricht.

**Bekannte lokale Eigenart:** Unter Node.js 24 kann der Anthropic-SDK-Call in `quote.js` an einem `node-fetch`/gzip-Kompatibilitätsbug scheitern (`ERR_STREAM_PREMATURE_CLOSE`). Umgangen über `defaultHeaders: { 'accept-encoding': 'identity' }` im Anthropic-Client. Betrifft vermutlich nur neuere lokale Node-Versionen, nicht zwingend die Railway-Produktivumgebung.

## Kühlschrank-Button – aktueller Stand (Juli 2026)

Der „🧊 Kühlschrank"-Button in der Bot-Tastatur (`index.js`, `KEYBOARD`) öffnet die Mini App jetzt direkt per `web_app`-Feld, sobald `WEBAPP_URL` gesetzt ist – kein Umweg mehr über eine Zwischennachricht mit Inline-Button. Ist `WEBAPP_URL` nicht gesetzt, bleibt der Button wie bisher ein reiner Textbutton mit Text-Listen-Fallback.

`WEBAPP_URL` muss die öffentliche HTTPS-Root-URL des Railway-Deployments sein (z.B. `https://dein-projekt.up.railway.app`), da `server.js` `public/index.html` unter `/` ausliefert. Railway-seitig muss dafür unter Settings → Networking eine Public Domain generiert sein.

## Fitnessplan Mini App / Trainings-Button – aktueller Stand (Juli 2026)

Der „🏋️ Training"-Button (Bot-Tastatur, `/training`-Befehl, Text-Shortcut) öffnet nicht mehr nur eine Textnachricht mit dem heutigen Workout, sondern den kompletten `fitnessplan.html`-Plan als Mini App – analog zum „🧊 Kühlschrank"-Button, per `web_app`-Feld, sobald `WEBAPP_URL` gesetzt ist. Ist `WEBAPP_URL` nicht gesetzt, bleiben Button/Befehl/Shortcut beim bisherigen Text-Fallback (heutiges Workout als Nachricht).

**Ausgeliefert über `server.js`:**
- `GET /fitnessplan.html` – liefert die Datei unverändert aus dem Projekt-Root aus (kein Auth-Schutz, wie auch `public/index.html`)
- `GET /api/fitness/status` (mit `authMiddleware`) – liefert `getPlanStatus()` aus `fitness.js` (`{ active, planDay, totalDays, phase }`) als JSON

**Mobile-Optimierung von `fitnessplan.html`** (Muster aus `public/index.html` übernommen): Telegram-WebApp-SDK eingebunden (`tg.ready()`/`tg.expand()`), Viewport mit `user-scalable=no`, `env(safe-area-inset-*)`-Padding für Header/unteren Rand, `overscroll-behavior: none`, System-Font statt Google-Fonts-Import (vermeidet externen Request im Telegram-In-App-Browser). Das bestehende dunkle Eigen-Branding der Seite bleibt unverändert.

**Auto-Scroll zum aktuellen Tag:** Beim Öffnen ruft die Seite `/api/fitness/status` ab und klappt – falls ein Startdatum per `setStartDate()` gesetzt ist – automatisch die Woche mit dem heutigen Trainingstag auf, hebt die Zeile visuell hervor (`.today-row`) und scrollt dorthin. Ohne gesetztes Startdatum bzw. bei fehlgeschlagenem Request bleibt Woche 1 offen (bisheriges Verhalten).

**Wichtig für zukünftige Änderungen:** `fitness.js` extrahiert `PHASES`/`WEEK_SCHED` weiterhin per Regex/`vm` aus dem `<script>`-Block von `fitnessplan.html` (siehe `loadFitnessData()`). Diese beiden `const`-Deklarationen müssen unverändert im selben Script-Block stehen bleiben, sonst bricht das serverseitige Parsen (`getTodayWorkout`, `/heute`, Morgennachricht).

### Betroffene Dateien
`index.js` (`KEYBOARD`, `/training`-Handler, `KEYBOARD_SHORTCUTS['Training']`), `server.js` (neue Routen), `fitnessplan.html`.

## Ideen / Backlog

Brainstorm zu möglichen nächsten Features (MHD-Warnungen proaktiv, Trainings-Log mit Streak, Abend-Digest, Ausgaben-Tracking aus Kassenbons, u.a.) steht in [`IDEAS.md`](IDEAS.md) – nichts davon ist umgesetzt.
