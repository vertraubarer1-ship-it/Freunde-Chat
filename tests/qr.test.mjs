/* Tests für qr.js – inkl. echtem Decode-Roundtrip.
   jsqr ist optional (devDependency): fehlt es, werden die Decode-Tests
   übersprungen statt zu scheitern.                                        */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const QR = require('../qr.js');
const qrcodeLib = require('../vendor/qrcode.js');

let jsQR = null;
try { jsQR = require('jsqr'); } catch (e) { jsQR = null; }

/** Matrix → RGBA-Bild (weiß/schwarz), damit ein Decoder es lesen kann. */
function render(matrix, scale, margin) {
  const total = (matrix.size + margin * 2) * scale;
  const data = new Uint8ClampedArray(total * total * 4);
  for (let y = 0; y < total; y++) {
    for (let x = 0; x < total; x++) {
      const mr = Math.floor(y / scale) - margin, mc = Math.floor(x / scale) - margin;
      const dark = mr >= 0 && mc >= 0 && mr < matrix.size && mc < matrix.size && matrix.dark(mr, mc);
      const v = dark ? 0 : 255, i = (y * total + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
    }
  }
  return { data, total };
}

test('QR: Generator ist geladen und liefert Module', () => {
  assert.equal(typeof qrcodeLib, 'function', 'vendor/qrcode.js exportiert eine Funktion');
  assert.equal(QR.available(), true);
  const m = QR.matrixFor('Hallo');
  assert.ok(m.size >= 21, 'mindestens Version 1 (21 Module)');
  assert.equal(m.size % 4, 1, 'QR-Größe ist immer 4k+1');
  assert.equal(m.rows.length, m.size);
  assert.equal(m.rows[0].length, m.size);
  assert.ok(m.rows.flat().every((v) => v === 0 || v === 1));
});

test('QR: Finder-Muster sind an drei Ecken vorhanden', () => {
  const m = QR.matrixFor('https://example.org/?room=Test');
  const isFinder = (r, c) => m.dark(r, c) && m.dark(r + 6, c + 6) && !m.dark(r + 1, c + 1);
  assert.ok(isFinder(0, 0), 'oben links');
  assert.ok(isFinder(0, m.size - 7), 'oben rechts');
  assert.ok(isFinder(m.size - 7, 0), 'unten links');
});

test('QR: gleicher Text → gleiche Matrix, anderer Text → anders', () => {
  const a = QR.matrixFor('nexus'), b = QR.matrixFor('nexus'), c = QR.matrixFor('nexus2');
  assert.deepEqual(a.rows, b.rows);
  assert.notDeepEqual(a.rows, c.rows);
});

test('QR: Ruhezone vergrößert die Kantenlänge', () => {
  const m = QR.matrixFor('abc');
  assert.equal(QR.modulesWithMargin(m, 4), m.size + 8);
  assert.equal(QR.modulesWithMargin(m, 0), m.size);
});

test('QR: SVGs sind wohlgeformt und skaliert', () => {
  const svg = QR.svgFor('https://nexus.test/#r=Kaffee', { scale: 4, margin: 2 });
  assert.ok(svg.startsWith('<svg '));
  assert.ok(svg.endsWith('</svg>'));
  assert.ok(svg.includes('shape-rendering="crispEdges"'), 'scharfe Kanten');
  assert.ok(/width="(\d+)"/.test(svg));
  const m = QR.matrixFor('https://nexus.test/#r=Kaffee', { margin: 2 });
  const expect = (m.size + 4) * 4;
  assert.ok(svg.includes('width="' + expect + '"'), 'Breite = (Module + Rand) × Skalierung');
  assert.ok(svg.includes('<path d="M'), 'Module werden als Pfad gezeichnet');
  assert.equal((svg.match(/<path/g) || []).length, 1, 'ein einziger Pfad (kompakt)');
});

test('QR: Fehlerkorrektur-Stufen ergeben unterschiedliche Matrizen', () => {
  const l = QR.matrixFor('Nexus Chat Test Nachricht', { ecl: 'L' });
  const h = QR.matrixFor('Nexus Chat Test Nachricht', { ecl: 'H' });
  assert.ok(h.size >= l.size, 'höhere Korrektur braucht mehr Module');
  assert.notDeepEqual(l.rows, h.rows);
});

test('QR: lange Einladungslinks bleiben unter Version 40', () => {
  const url = 'https://vertraubarer1-ship-it.github.io/Freunde-Chat/index.html?room=' + encodeURIComponent('Gaming-Lounge') + '&p=' + 'x'.repeat(120);
  const m = QR.matrixFor(url);
  assert.ok(m.version >= 1 && m.version <= 40, 'Version im gültigen Bereich: ' + m.version);
  assert.ok(m.size <= 177, 'maximal 177 Module');
});

for (const [name, text, opts] of [
  ['einfacher Text', 'Hallo Nexus', {}],
  ['Einladungslink', 'https://vertraubarer1-ship-it.github.io/Freunde-Chat/index.html?room=Gaming-Lounge', {}],
  ['mit Passwort', 'https://example.org/Freunde-Chat/?room=Gaming-Lounge&p=geheim123', { ecl: 'M' }],
  ['Umlaute/Emoji', 'Räume: Küche & 🎮 Lounge', {}],
  ['hohe Fehlerkorrektur', 'https://example.org/nexus?room=Test&p=abcdef123456', { ecl: 'H' }],
]) {
  test('QR-Decode-Roundtrip: ' + name, { skip: jsQR ? false : 'jsqr nicht installiert' }, () => {
    const m = QR.matrixFor(text, opts);
    const { data, total } = render(m, 4, 4);
    const res = jsQR(data, total, total);
    assert.ok(res, 'QR wurde vom Decoder erkannt');
    assert.equal(res.data, text, 'Inhalt stimmt exakt');
  });
}
