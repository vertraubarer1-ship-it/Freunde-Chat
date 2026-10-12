# Mitgelieferte Bibliotheken

Beide Dateien liegen bewusst **lokal** im Projekt statt an einem CDN: die App
funktioniert dadurch offline, lädt schneller und hängt nicht von Dritten ab
(gerade bei Einladungs-QR-Codes und der Chat-Verbindung ist das wichtig).

| Datei | Paket | Version | Lizenz | Zweck |
|---|---|---|---|---|
| `mqtt.min.js` | [mqtt](https://www.npmjs.com/package/mqtt) | 5.16.0 | MIT | Echtzeit-Transport (WSS zum Broker) |
| `qrcode.js` | [qrcode-generator](https://www.npmjs.com/package/qrcode-generator) | 2.0.4 | MIT (© Kazuhiko Arase) | QR-Code-Module für Einladungen |

## Aktualisieren

```bash
npm pack mqtt@5                 # → mqtt-5.x.y.tgz
tar xzf mqtt-*.tgz
cp package/dist/mqtt.min.js vendor/mqtt.min.js

npm pack qrcode-generator       # → qrcode-generator-x.y.z.tgz
tar xzf qrcode-generator-*.tgz
cp package/dist/qrcode.js vendor/qrcode.js
```

Nach dem Tausch: `npm test` laufen lassen – `tests/qr.test.mjs` dekodiert einen
erzeugten QR-Code wirklich und merkt sofort, wenn die Ausgabe kaputt ist.

## Wichtig zur QR-Bibliothek

`qrcode-generator` kodiert standardmäßig in **SJIS**. Dadurch wären Umlaute
(`ä`, `ö`, `ü`, `ß`) und Emoji im QR-Code unlesbar. `qr.js` schaltet deshalb
automatisch auf die mitgelieferte UTF-8-Variante um:

```js
qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
```

Beim Aktualisieren der Bibliothek darauf achten, dass `stringToBytesFuncs['UTF-8']`
weiterhin existiert (der Test deckt es ab).

## Lizenzen

- **mqtt** – MIT, © Nacho Martin & Mitwirkende. Volltext: <https://github.com/mqttjs/MQTT.js/blob/master/LICENSE.md>
- **qrcode-generator** – MIT, © 2009 Kazuhiko Arase. Hinweis im Dateikopf:
  *„QR Code“ ist eine eingetragene Marke von DENSO WAVE INCORPORATED.*

Beide Lizenzen erlauben die Weitergabe mit Quellenangabe; die Copyright-Vermerke
stehen in den jeweiligen Dateiköpfen und dürfen nicht entfernt werden.
