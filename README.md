# Freunde-Chat

Texte mit Freunden auf dem IPad – E2EE-Chat mit Räumen, Freunden, Sprachnachrichten und Minispielen.

## Funktionen

- **Freundschaftsanfragen über Benutzernamen** – inkl. Benachrichtigung bei Annahme/Ablehnung,
  Übersicht eingehender & gesendeter Anfragen.
- **Im Raum auf Personen klicken** – Teilnehmer im Chat-Info-Panel sind anklickbar:
  Aktions-Dialog mit „Als Freund hinzufügen“ (oder ➕ direkt in der Liste), „Privaten Chat öffnen“,
  sowie Status-Anzeige. Freundschaftsanfragen werden als Klartext über die Inbox gesendet
  und beim Empfänger sofort verarbeitet.
- **Screenshot-Schutz (FLAG_SECURE fürs Web)** – wird die App verlassen (App-Wechsel, Screen aus,
  Fenster-Blur), legt sich ein schwarzer Vollbild-Cover über den Inhalt – im App-Switcher /
  kürzlichen Apps bleibt der Bildschirm schwarz. Ein-/auschaltbar unter ⚙️.
  *Hinweis: Echtes FLAG_SECURE erfordert einen nativen Android-Wrapper (TWA);
  im Browser ist der schwarze Cover bei Sichtbarkeitsverlust das Äquivalent.*
- **Screenshot-/Aufnahme-Meldung im Chat** – erkennt App-Wechsel (kurz = Screenshot,
  lang = Bildschirmaufnahme) und sendet verschlüsselt an alle Chats/Räume:
  „📸 Noah hat einen Screenshot gemacht“ bzw. „🎥 Noah nimmt den Bildschirm auf“.
  Wird als Systemmeldung im Chat-Verlauf gespeichert, im geschlossenen Chat als
  Benachrichtigung angezeigt. Ein-/auschaltbar unter ⚙️.
- **Bessere Absender-Unterscheidung** – Nachrichten im Raum zeigen Avatar + Name + Zeit,
  Folge-Nachrichten desselben Absenders werden gruppiert; der Tippen-Hinweis zeigt
  mehrere Schreibende gleichzeitig („✍️ Noah und Anna schreiben…“).
- **Räume & DMs** – Ende-zu-Ende-verschlüsselt (AES-GCM; Räume: PBKDF2 aus Name+Passwort,
  DMs: ECDH-Schlüsselaustausch), Verlauf lokal in IndexedDB, Einladen per Link & QR.
- **Spiele** – Tic Tac Toe, Vier Gewinnt, Schere Stein Papier (1v1 gegen Freunde oder Solo vs KI)
  mit Revanche nach beidseitiger Zustimmung.
- **Admin-Panel** – signierte Ankündigungen und Sperren (ECDSA-Schlüsselpaar, siehe `ADMIN_PUB`).

Real-Time läuft über MQTT (öffentlicher Broker `broker.emqx.io`, Namespace `nexusB2`).
