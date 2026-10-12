# Freunde-Chat (Nexus)

Texte mit Freunden – E2EE-Chat mit Räumen, Freunden, Sprachnachrichten und **acht Minispielen**.
Läuft als **PWA** (installierbar, offline-fähig, mit System-Benachrichtigungen) komplett im Browser.

## Sofort ausprobieren

```bash
node tools/serve.mjs          # → http://localhost:8123
npm test                      # 104 Tests (Spiellogik, QR, End-to-End)
npm run icons                 # App-Icons neu erzeugen (ImageMagick)
```

---

## Was neu ist

### 🎮 Spiele-Queue und drei neue Spiele (+ zwei Denkspiele)
Alle acht Spiele laufen über eine gemeinsame Engine (`games.js`) – reine, testbare
Funktionen ohne DOM. Weil Zustände **deterministisch aus einem Seed** entstehen,
werden nur Züge übertragen: kein Zustandsabgleich, keine Desynchronisation.

| Spiel | Besonderheit |
|---|---|
| ⭕ **Tic Tac Toe** | klassisch, mit KI |
| 🔴 **Vier Gewinnt** | Fallphysik, Siegreihen werden markiert |
| ✌️ **Schere Stein Papier** | verdeckte Wahl, Punktestand |
| 🃏 **Memory** | 16 Karten, gemischtes Feld aus dem Seed, Paar-Logik |
| 🚢 **Schiffe versenken** | 8×8, eigene Flotte setzen (drehen, zufällig, leeren), Treffer ⇒ nochmal, Schiffsversenkung |
| 💥 **Tank Wars** | Winkel + Power, Wind, zerstörbare Landschaft, Panzer fällt in Krater – Physik in **Ganzzahl-Arithmetik**, damit beide Geräte exakt dieselbe Flugbahn sehen |
| ❓ **20 Fragen** | Ja/Nein-Fragen, Fragenbudget, falscher Tipp kostet eine Frage, an einem Gerät oder online |
| 💸 **Geld ausgeben** | 100 € Budget, Artikel mit Preis/Wert, Restgeld zählt zur Hälfte gegen dich |

**Warteschlange im Raum:** Im Chat auf 🎮 → Spiel wählen → „Einsteigen“. Sobald ein
zweiter Spieler dasselbe Spiel wählt, startet die Partie automatisch (Host ist der
alphabetisch erste Name). Kein Hin- und Her mit Anfragen, kein Warten auf Antwort.

### 🔔 PWA-Benachrichtigungen (`sw.js` + Icons + Manifest)
- **Service Worker** (`sw.js`): App-Hülle offline, echte System-Benachrichtigungen,
  Klick öffnet direkt den richtigen Raum, Zahl am App-Icon (Badge), Sync für die
  Warteschlange der ausstehenden Nachrichten.
- **Icons** in `icons/` – 192/512 px, maskierbar, Apple-Touch-Icon, Badge, SVG-Favicon;
  jederzeit reproduzierbar über `tools/make-icons.sh`.
- **Manifest** mit `display_override`, Kurzbefehlen („Spiele“, „Beitreten“), Kategorien,
  Theme-Farben.
- In den Einstellungen: „Push erlauben“ und „Test-Benachrichtigung senden“, plus Hinweis,
  wie die App installiert wird (im Browser: „Zum Home-Bildschirm“).

### 🛡️ Screenshot-Schutz – gehärtet
- Schwarzer Vollbild-Cover bei App-Wechsel / Bildschirm aus (FLAG_SECURE fürs Web).
- **Wasserzeichen** über dem Verlauf: halbtransparent `Name · Datum/Uhrzeit` – schreckt
  Screenshots ab und ordnet einen Abzug einem Konto zu.
- **Meldungen ohne Spam:** mindestens 6 s Abstand zwischen Meldungen, dieselbe Art nicht
  doppelt innerhalb 30 s, kurze App-Wechsel unter 1 s werden ignoriert.
- Ein-/ausschaltbar unter ⚙️.

### 📷 QR-Fix (Einladungen funktionieren offline)
Der QR-Code wird **lokal** erzeugt (mitgelieferter Generator in `vendor/qrcode.js` über
`qr.js`) statt von einem CDN geladen. Wichtig: Die Bibliothek kodiert standardmäßig in
**SJIS** – `qr.js` schaltet auf UTF-8 um, sonst wären Umlaute und Emoji im QR-Code
Kauderwelsch. Getestet wird das mit einem echten Decoder (`jsQR`) in `tests/qr.test.mjs`.
Ohne Canvas greift eine SVG-Ausgabe, plus „Als Bild speichern“ und „Teilen“.

### 🔐 Admin-Schlüssel fest im Code
`ADMIN_PUB` ist fest hinterlegt, damit signierte Ankündigungen, Sperren und das
Troll-Menü prüfbar sind. Den **privaten** Schlüssel findest du im Arbeitsordner in
`admin-key.local.txt` (nicht im Repo, siehe `.gitignore`):

1. Datei öffnen, Zeile mit `"d":…` kopieren
2. In der App: ⚙️ → „🛡 Admin-Schlüssel laden“ → einfügen
3. Danach in die eigenen Notizen kopieren und die Datei löschen

> ⚠️ Wer den privaten Schlüssel hat, ist Admin. Er darf niemals in ein Repository
> oder in einen Chat. Neuen Schlüssel erzeugen: ⚙️ → „Admin-Schlüsselpaar erzeugen“
> und den öffentlichen Teil in `index.html` bei `ADMIN_PUB` ersetzen.

### ⌨️ Tippen-Anzeige-Bugfix
„X schreibt…“ blieb stehen, wenn keine weitere Nachricht eintraf. Jetzt:
- Drosselung (höchstens alle 1,6 s gesendet, vorher bei jedem Tastendruck),
- Ablauf-Prüfung alle 1,5 s, danach fällt die Kopfzeile zuverlässig auf „online / offline“ zurück.

---

## Funktionen (Überblick)

- **Freundschaftsanfragen** über Benutzername, Benachrichtigung bei Annahme/Ablehnung,
  Übersicht eingehender und gesendeter Anfragen.
- **Im Raum auf Personen klicken** → „Als Freund hinzufügen“, „Privaten Chat öffnen“,
  Status; ➕ direkt in der Teilnehmerliste.
- **Räume & DMs** – AES-GCM (Räume: PBKDF2 aus Name+Passwort, DMs: ECDH-Schlüsselaustausch),
  Verlauf lokal in IndexedDB, Einladen per Link und QR.
- **Sprachnachrichten, Bilder, Videos** mit Wellenform, Geschwindigkeit (1× / 1,5× / 2×)
  und Sprungstellen.
- **Senden ohne Netz**: Nachrichten landen in einer Warteschlange und gehen beim
  Verbinden raus.
- **Admin-Panel** (nur mit gültiger Signatur): Ankündigungen, Sperren, Log.
- **Sicherheitseinstellungen** unter ⚙️: Sounds, Screenshot-Schutz + Wasserzeichen,
  Screenshot-Meldungen, Push.

---

## Aufbau des Projekts

```
index.html      App (UI + Verdrahtung) – wird ausgeliefert, sonst nichts
games.js        Spiele-Engine: 8 Spiele, rein & deterministisch, ohne DOM
qr.js           QR-Rendering (Canvas/SVG) über vendor/qrcode.js
sw.js           Service Worker: Offline, Benachrichtigungen, Badge, Sync
manifest.json   PWA-Manifest
icons/          App-Icons (aus tools/make-icons.sh)
vendor/         mitgelieferte Bibliotheken (MQTT, QR) – MIT, siehe vendor/README.md
tools/          serve.mjs (lokaler Server), make-icons.sh, test.sh
tests/          games.test.mjs, qr.test.mjs, e2e.test.mjs (jsdom)
```

## Tests

```bash
npm test          # oder: bash tools/test.sh
```

**104 Tests, alle grün.** Sie prüfen unter anderem:

- **Spiellogik (`tests/games.test.mjs`)**: Regeln, Siegbedingungen, KI, Warteschlangen-Paarung,
  Determinismus („gleicher Seed ⇒ gleiche Partie“), Immutabilität der Zustände,
  JSON-Tauglichkeit, Fehlerfälle (falscher Spieler, belegte Felder, Budget …).
- **QR (`tests/qr.test.mjs`)**: Modulgrößen, Finder-Muster, Ruhezone, SVG-Ausgabe und ein
  **echter Decoder-Roundtrip** – inklusive Umlauten und Emoji.
- **End-to-End (`tests/e2e.test.mjs`)** in jsdom mit einem kleinen Testserver: Konto anlegen,
  Profil, Lobby, **alle acht Spiele** durchspielen, Einladung mit QR, eingehende Nachricht,
  Tippen-Anzeige, Screenshot-Schutz, Warteschlange im Raum, Admin-Signaturprüfung
  (gültig **und** gefälscht) sowie „keine unbehandelten Fehler“.

Die e2e-Tests haben dabei echte Fehler gefunden und behoben: eine stillstehende
20-Fragen-Partie nach einem falschen Tipp, das Datenformat der Warteschlange, den
QR-Aufruf mit der alten CDN-API, fehlende Absicherung bei fehlendem `games.js` und
die Tippen-Anzeige.

## Real-Time & Datenschutz

Der Echtzeit-Austausch läuft über MQTT (öffentlicher Broker `broker.emqx.io`,
Namespace `nexusB2`). Nachrichteninhalte sind Ende-zu-Ende verschlüsselt; der Broker
sieht nur Themen und Chiffrate. Verlauf, Profil und Einstellungen bleiben lokal im
Browser.

## Lizenz

Eigener Code: MIT. Mitgelieferte Bibliotheken: siehe `vendor/README.md`
(MQTT.js – MIT, qrcode-generator – MIT von Kazuhiko Arase).
