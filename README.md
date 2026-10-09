# Freunde-Chat

Texte mit Freunden auf dem IPad

## Funktionen (V13)

- **Freundschaftsanfragen über Benutzernamen** – funktionieren nur gegen online Benutzer,
  inklusive Duplikat-Schutz, Übersicht offener Anfragen und Benachrichtigung bei Annahme/Ablehnung
  (beide Seiten sind danach synchron befreundet).
- **15 Sekunden Zeitlimit pro Zug – für alle Spiele** (Tic Tac Toe & 4-Gewinnt, lokal und online).
  Wird die Zeit überschritten, wird automatisch ein Zug ausgeführt. Online synchronisiert über Zeitstempel.
- **4-Gewinnt Royale mit 2–4 Spielern** – lokal als Hot-Seat oder online als offene Session
  (weitere Spieler können beitreten, Spiel startet automatisch, sobald alle Plätze belegt sind).
- **Online-Spieler direkt herausfordern** – Freunde und beliebige fremde Spieler in der Lobby
  lassen sich per Herausforderungs-Dialog (Spielauswahl inkl. Spieleranzahl) direkt anfordern,
  mit Annahme/Ablehnung auf beiden Seiten.
- **Keine automatischen Anfragen nach Spielende** – nach einem Spiel erscheint nur der Endscreen
  mit Ergebnis; eine erneute Partie wird nie automatisch angefragt.
- **Admin-Troll-Menü (nur Admins)** – Namen von Spielern ändern, Sounds bei allen auslösen,
  Spielfeld drehen. Admins werden in `ADMIN_USERS` in der `index.html` eingetragen
  (Default: `admin`, `vertraubarer1`). Aktionen anderer Benutzer werden ignoriert.

Real-Time läuft über MQTT (öffentlicher Broker `broker.emqx.io`, Topics `nexus_v12/...`).
