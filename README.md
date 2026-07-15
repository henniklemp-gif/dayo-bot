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
| `quote.js` | Tägliches inspirierendes Zitat (von Claude generiert, mit Redis-Historie gegen Wiederholungen), nur für die 7:30-Morgennachricht |
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

Die Mini App (`public/index.html`) wurde auf ein Karten-Grid-Redesign umgestellt (Design-Vorlage: `Redesign/` – Referenz-Prototyp + `README.md` dort, nicht Teil des Produktivcodes). Das Backend/Datenmodell ist dabei unverändert geblieben, es handelt sich ausschließlich um eine Frontend-Überarbeitung.

**Datenmodell** (`kuehlschrank.json`, verwaltet über `fridge.js`):
```js
{ name, quantity, unit, category, expiryDate, fullQuantity }
```
- `category`: `kuehlschrank` | `tiefkuehlfach` | `speisekammer` (Pflichtfeld, Default `kuehlschrank` für Altbestände)
- `expiryDate`: ISO-Datum (MHD), nullable, manuell gepflegt
- `fullQuantity`: Referenzmenge für Stepper & Slider, wird für **alle** Einheiten automatisch beim (Nach-)Hinzufügen gesetzt (bei Bestandsdaten ohne Wert wird sie beim Laden rückwirkend nachgetragen = aktuelle Menge gilt als "voll")

**Fixes dunkles Theme:** Statt der Telegram-Theme-Variablen (`--tg-theme-*`) nutzt die App jetzt ein festes warmes Dunkel-Farbschema in OKLCH (unabhängig vom Theme des Telegram-Clients).

**Übersicht (Karten-Grid statt Liste):** Artikel erscheinen als 2-spaltiges Karten-Grid statt als gruppierte Liste mit Sticky-Headern. In der Übersicht sind fest 7 Zeilen (= 14 Karten) sichtbar (`grid-auto-rows` berechnet die Zeilenhöhe aus der verfügbaren Grid-Fläche); bei mehr Artikeln wird mit gleicher Zeilenhöhe weitergescrollt. Statt der Kategorie-Sticky-Header gibt es oben Filter-Chips (Mehrfachauswahl, gleichmäßig auf die Breite verteilt, kein horizontales Scrollen mehr nötig). Jede Karte zeigt ein produktspezifisches Emoji-Icon (Namens-Keyword-Zuordnung mit Kategorie-Icon als Fallback – **Produkt-Emojis sind damit wieder da**, die frühere Entscheidung dagegen wurde mit dem Redesign revidiert), Name, Mengen-Pill (Füllstand-% bei Gewicht/Volumen, sonst Stückzahl/Einheit) und Bring!-Button (echter Toggle: erneutes Antippen setzt den lokalen Status zurück, ein "Entfernen von der Bring!-Liste" gibt es serverseitig weiterhin nicht). Das MHD wird nicht mehr als Text-Badge in der Liste angezeigt, sondern als reiner Farbpunkt oben rechts auf der Karte (rot ≤ 1 Tag, gelb 2–5 Tage, grün > 5 Tage, kein Punkt ohne MHD). Swipe-to-delete auf der Karte entfällt (Karten sind nicht mehr swipebar) – Löschen läuft ausschließlich über den 🗑️-Button im Detail-Sheet.

**Detail-Sheet (Tap auf Karte):** Kategorie ändern (Pflicht-Chips), MHD setzen (Datumsfeld + Schnellauswahl-Chips +3 Tage/+1 Woche/+2 Wochen/+1 Monat), Menge anpassen. Stepper (+/–) und Füllstand-Slider sind jetzt **immer gleichzeitig sichtbar und synchron** (kein Fallback-Modus mehr abhängig von bekannter/unbekannter Referenzmenge): bei Gewicht/Volumen-Einheiten (`g`/`kg`/`ml`/`l`) prozentual in 1%-Schritten, bei Stückzahlen und allen anderen Einheiten (Stk, Pkg, …) direkt in 0,5er-Schritten; der Stepper nutzt dieselbe Schrittweite (10 bei `g`/`ml`, 0,1 bei `kg`/`l`, sonst 0,5) und ist wie der Slider durch `fullQuantity` nach oben gedeckelt. Der Slider hat einen sichtbaren Track mit eigenem Rahmen-Akzent (abgesetzt von der Button-Akzentfarbe), da der reine `accent-color`-Ansatz den Track auf dem dunklen Hintergrund unsichtbar gemacht hatte. Artikel löschen.

**Header entfernt:** Der frühere eigene Header (✕/Avatar/„Dayo"/•••-Overflow-Menü) wurde ersatzlos gestrichen, da Telegram Mini Apps bereits eine native Close-Steuerung mitbringen. Der zuvor hinter dem •••-Menü versteckte Rückgängig-Button sitzt jetzt als eigener Icon-Button direkt in der Titelzeile, links vom Barcode-Scan-Button.

**Add-Sheet:** Einheit wird nur noch über Chips gewählt (Stk, g, kg, ml, l, Pkg) – das frühere freie Texteingabefeld für die Einheit entfällt.

**Kategorie-Zuordnung:**
- Kassenbon-Scan (95% der Fälle): Claude liefert `category` direkt in der Vision-Anfrage mit
- Manuelles Hinzufügen / Barcode-Scan: Pflicht-Auswahl im Add-Sheet, vorbelegt durch clientseitige Keyword-Heuristik `guessCategory()` in `index.html`

**Offener Punkt:** `guessCategory()` ist eine generische Zuordnung (abgeleitet aus Lebensmittel-Keywords). Kann anhand eines echten Kassenbons/typischer Produktliste weiter kalibriert werden.

### Betroffene Dateien
`public/index.html` (komplettes Redesign, siehe oben). `fridge.js`, `server.js` (PATCH `/api/fridge/:name` akzeptiert `quantity`, `category`, `expiryDate`, `fullQuantity` zusätzlich zu `delta`) und `vision.js` (Prompt) sind vom Redesign selbst nicht betroffen.

## Morgennachricht – aktueller Stand (Juli 2026)

Die automatische 7:30-Uhr-Nachricht (`scheduler.js` → `formatMorningOverview()` in `format.js`) startet mit einem inspirierenden Zitat, gefolgt von der gewohnten Tagesübersicht (Termine + Training) und endet mit dem aktuellen Bitcoin-Kurs in USD:

1. **Zitat** (`quote.js`): wird bei jedem Lauf frisch von Claude generiert (Englisch, mit Autor:in, Model `claude-opus-4-8`). Die letzten 30 verwendeten Zitate werden in Redis (`dayo:quote_history`) gemerkt und dem Modell als Ausschlussliste mitgegeben, damit die Morgennachricht nicht mehr auf dieselben Klassiker-Zitate zurückfällt. Schlägt der Call fehl, liefert die Funktion `null` zurück – die restliche Nachricht wird trotzdem verschickt.
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
