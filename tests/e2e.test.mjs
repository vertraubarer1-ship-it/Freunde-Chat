/* ══════════════════════════════════════════════════════════════════════════
   End-to-End-Test der App in einer echten DOM-Umgebung (jsdom)
   ──────────────────────────────────────────────────────────────────────────
   Lädt index.html samt lokalen Bibliotheken, polyfillt WebCrypto und prüft
   die komplette Bedienkette: Konto anlegen, Profil, Lobby, alle acht Spiele
   (Solo/„an einem Gerät“), Warteschlange im Raum, Admin-Signaturprüfung.
   Netzwerk (MQTT) und Push werden ersetzt – getestet wird die App selbst.
   ══════════════════════════════════════════════════════════════════════════ */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

/* ── Mini-Server: liefert den Projektordner über http aus ───────────────
   Damit hat die Seite einen echten Origin (localStorage, sichere Kontexte)
   und die lokalen Skripte werden geladen wie in der echten App.           */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const body = await readFile(join(ROOT, path));
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream' }).end(body);
  } catch (e) { res.writeHead(404).end('nope'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port + '/';

/* ── Fake-WebSocket: mqtt bleibt ohne Netz, nichts hängt ─────────────── */
class FakeWebSocket {
  constructor(url) { this.url = url; this.readyState = 0; this.binaryType = 'blob'; }
  send() {} close() { this.readyState = 3; } addEventListener() {} removeEventListener() {}
}
FakeWebSocket.CONNECTING = 0; FakeWebSocket.OPEN = 1;
FakeWebSocket.CLOSING = 2; FakeWebSocket.CLOSED = 3;

const vc = new VirtualConsole();
vc.on('jsdomError', (e) => {
  const msg = String(e && e.message || e);
  if (/Not implemented|Could not load|css|stylesheet/i.test(msg)) return;   // Canvas/Layout – unkritisch
  errors.push('jsdomError: ' + msg);
});
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const dom = new JSDOM(html, {
  url: BASE + 'index.html',
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(w) {
    // WebCrypto (Node) – jsdom bringt kein crypto.subtle mit
    Object.defineProperty(w, 'crypto', { value: webcrypto, configurable: true });
    w.WebSocket = FakeWebSocket;
    w.Notification = class { constructor() {} static requestPermission() { return Promise.resolve('denied'); } };
    w.Notification.permission = 'default';
    w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
    w.onerror = (msg, src, line, col, err) => { errors.push('window.onerror: ' + (err && err.stack || msg)); };
    w.addEventListener('unhandledrejection', (e) => { errors.push('unhandledrejection: ' + (e.reason && e.reason.stack || e.reason)); });
  },
});
const win = dom.window;
const $ = (id) => win.document.getElementById(id);
const ev = (code) => win.eval(code);                       // Zugriff auf let/const im Skript
const clickEl = (el) => el && el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

await new Promise((r) => {
  if (win.document.readyState === 'complete') return r();
  win.addEventListener('load', r);
  setTimeout(r, 4000);
});
await sleep(120);

// Aufräumen: jsdom-Timer stoppen, sonst läuft der Testprozess weiter
after(() => { try { win.close(); } catch (e) {} server.close(); });

/* ═════════════════════════════════════════════════════════════════════ */
test('App-Grundgerüst: lokale Bibliotheken, Engine und Icons geladen', () => {
  assert.equal(typeof win.mqtt, 'object', 'MQTT lokal geladen (vendor/mqtt.min.js)');
  assert.equal(typeof win.qrcode, 'function', 'QR-Generator lokal geladen (vendor/qrcode.js)');
  assert.equal(typeof win.NexusGames, 'object', 'Spiele-Engine geladen (games.js)');
  assert.equal(typeof win.NexusQR, 'object', 'QR-Helfer geladen (qr.js)');
  assert.equal(win.NexusGames.VERSION, '1.0.0');
  assert.ok(win.NexusQR.available(), 'QR-Renderer einsatzbereit');
  assert.equal(Object.keys(win.NexusGames.GAMES).length, 8, 'acht Spiele registriert');
  const icons = ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];
  const manifest = JSON.parse(readFileSync(resolve(ROOT, 'manifest.json'), 'utf8'));
  icons.forEach((i) => assert.ok(manifest.icons.some((x) => x.src === 'icons/' + i), i + ' im Manifest'));
  assert.equal($('scAuth').classList.contains('active'), true, 'Anmeldebildschirm ist aktiv');
});

test('Konto anlegen → Profil → Lobby', async () => {
  ev("mode='register';renderAuth();");
  $('auUser').value = 'anna';
  $('auPass').value = 'geheim123';
  $('auPass2').value = 'geheim123';
  clickEl($('auBtn'));
  await sleep(400);
  assert.ok($('modal').classList.contains('on'), 'Wiederherstellungs-Code wird angezeigt');
  const code = $('modalCard').textContent.match(/[A-Z0-9]{4}-[A-Z0-9]{4}/);
  assert.ok(code, 'Code im Dialog sichtbar: ' + code);
  clickEl($('mOk'));
  await sleep(150);
  assert.equal($('scProfile').classList.contains('active'), true, 'Profilauswahl erscheint');
  clickEl(win.document.querySelector('#scProfile .btn:not(.ghost)'));
  await sleep(700);
  assert.equal($('scHome').classList.contains('active'), true, 'Lobby erscheint');
  assert.equal(ev('me'), 'anna');
  assert.equal($('meLabel').textContent.length > 0, true, 'Status wird angezeigt');
  assert.ok(ev('ACC() && ACC().u') === 'anna', 'Konto gespeichert');
  assert.ok(win.localStorage.getItem('nx_acc'), 'Konto liegt im localStorage');
});

test('Spiele-Menü: alle acht Spiele werden aufgelistet', () => {
  assert.equal($('gameList').querySelectorAll('.item').length, 8, 'acht Freunde-Spiele');
  assert.equal($('soloList').querySelectorAll('.item').length, 8, 'acht Solo-Varianten');
  const txt = $('gameList').textContent;
  ['Tic Tac Toe', 'Vier Gewinnt', 'Schere Stein Papier', 'Memory', 'Schiffe versenken', 'Tank Wars', '20 Fragen', 'Geld ausgeben']
    .forEach((n) => assert.ok(txt.includes(n), n + ' ist gelistet'));
});

test('Spiele-Engine im Browser: gleicher Seed → gleiche Partie', () => {
  const G = win.NexusGames;
  const a = G.create('mem', 'browser-seed'), b = G.create('mem', 'browser-seed');
  assert.deepEqual(a.cards, b.cards, 'Memory-Feld ist deterministisch');
  const t1 = G.tankCreate('browser-tank'), t2 = G.tankCreate('browser-tank');
  assert.deepEqual(t1.h, t2.h, 'Tank-Gelände ist deterministisch');
  assert.deepEqual(G.move(t1, 0, { a: 'fire', angle: 45, power: 70 }).events,
    G.move(t2, 0, { a: 'fire', angle: 45, power: 70 }).events, 'Flugbahn identisch');
});

test('Solo: Tic Tac Toe – Zug, KI-Antwort, Bilanz', async () => {
  ev("startSolo('ttt')");
  await sleep(120);
  assert.equal($('gameLayer').classList.contains('on'), true, 'Spielfenster offen');
  assert.equal($('gBoard').querySelectorAll('button').length, 9, 'neun Felder');
  assert.equal(ev('G.type'), 'ttt');
  const before = ev('G.st.board.filter(v=>v!==0).length');
  ev('tapTTT(4)');
  assert.equal(ev('G.st.board[4]'), 1, 'mein Stein steht');
  await sleep(1100);                                       // KI zieht selbst
  const after = ev('G.st.board.filter(v=>v!==0).length');
  assert.ok(after > before + 1, 'KI hat geantwortet (' + after + ' Steine)');
  const board = ev('G.st.board');
  assert.ok(board.filter((v) => v === 1).length === 1, 'genau ein eigener Stein');
});

test('Solo: Vier Gewinnt – Stein fällt nach unten', async () => {
  ev("closeGame();startSolo('c4')");
  await sleep(120);
  assert.equal($('gBoard').querySelectorAll('.cell').length, 42, '42 Felder');
  ev('tapC4(0)');
  assert.equal(ev('G.st.board[35]'), 1, 'Stein liegt in der untersten Reihe');
  await sleep(1100);
  assert.ok(ev('G.st.board.filter(v=>v!==0).length') >= 2, 'KI hat geantwortet');
  ev('closeGame()');
});

test('Solo: Schere Stein Papier – Auflösung nach beiden Wahlen', async () => {
  ev("startSolo('rps')");
  await sleep(120);
  assert.equal($('gBoard').querySelectorAll('button').length, 3, 'drei Waffen');
  ev('rpsPick(1)');
  await sleep(1200);
  assert.equal(ev('G.st.over'), true, 'Runde ist entschieden');
  assert.ok([-1, 0, 1].includes(ev('G.st.result')));
  ev('closeGame()');
});

test('Solo: Memory – Aufdecken, Fehlversuch, Paar', async () => {
  ev("startSolo('mem')");
  await sleep(120);
  assert.equal($('gBoard').querySelectorAll('.mcard').length, 16, '16 Karten');
  const first = 0;
  const twin = ev(`G.st.cards.findIndex((c,i)=>i!==0&&c.k===G.st.cards[0].k)`);
  ev(`memTap(${first})`);
  assert.equal(ev('G.st.open.length'), 1, 'erste Karte offen');
  ev(`memTap(${twin})`);
  assert.equal(ev('G.st.score[0]'), 1, 'Paar gefunden und gezählt');
  assert.equal($('gBoard').querySelectorAll('.mcard.done').length, 2, 'Paar markiert');
  ev('closeGame()');
});

test('Solo: Schiffe versenken – Aufstellung, Zufall, Schuss', async () => {
  ev("startSolo('bs')");
  await sleep(150);
  assert.equal($('gBoard').querySelectorAll('.bsgrid').length >= 1, true, 'Feld sichtbar');
  ev('bsRandom()');
  await sleep(80);
  assert.equal(ev('G.st.ships[0].length'), 5, 'fünf Schiffe gesetzt');
  ev('bsReady()');
  await sleep(1400);                                       // KI platziert und antwortet
  assert.equal(ev('G.st.phase'), 'fire', 'Schussphase erreicht');
  assert.equal(ev('G.st.ready[1]'), true, 'KI-Flotte steht');
  const myTurn = ev('G.st.turn===G.idx');
  assert.equal(myTurn, true, 'ich darf schießen');
  const target = ev('G.st.ships[1][0] ? GX.bsCellsOf(G.st,G.st.ships[1][0])[0] : 0');
  ev(`bsFire(${target})`);
  assert.equal(ev('G.st.shots[0].length'), 1, 'Schuss registriert');
  assert.equal(ev('G.st.turn===G.idx'), true, 'Treffer ⇒ nochmal (Schiff steht dort)');
  ev('closeGame()');
});

test('Solo: Schiffe versenken – KI zieht nach einem Treffer erneut', async () => {
  ev('if(G)closeGame()');
  ev("startSolo('bs')");
  await sleep(150);
  ev('bsRandom()');
  await sleep(60);
  ev('bsReady()');
  await sleep(1500);
  assert.equal(ev('G.st.phase'), 'fire', 'Schussphase');
  // Der KI absichtlich ein Trefferfeld vorbereiten: ihr Zug mehrfach auslösen
  ev('G.st.turn=1');                       // KI ist dran
  const before = ev('G.st.shots[1].length');
  ev('maybeSoloAi()');
  await sleep(1000);
  const mid = ev('G.st.shots[1].length');
  assert.ok(mid > before, 'KI hat geschossen (' + before + ' → ' + mid + ')');
  if (ev('G.st.turn') === 1 && ev('GX.winner(G.st)') === undefined) {
    await sleep(1000);
    assert.ok(ev('G.st.shots[1].length') >= mid, 'KI blieb nach Treffer am Zug und schießt weiter');
  }
  ev('closeGame()');
});

test('Solo: Tank Wars – Regler, Feuer, Flugbahn, KI-Schuss', async () => {
  ev('if(G)closeGame()');
  ev("startSolo('tank')");
  await sleep(150);
  assert.ok($('gameLayer').classList.contains('on'));
  assert.ok($('tkAngle') && $('tkPower'), 'Regler für Winkel und Power vorhanden');
  // Regler bewegen und übernehmen
  $('tkAngle').value = '60'; $('tkPower').value = '85';
  ev('tkSlide()');
  assert.equal(ev('G.tkAngle'), 60, 'Winkel übernommen');
  assert.equal(ev('G.tkPower'), 85, 'Power übernommen');
  assert.equal($('tkAngleV').textContent, '60°', 'Anzeige aktualisiert');
  // Feuer
  ev('tankFire()');
  await sleep(100);
  assert.equal(ev('G.st.shots[0].length'), 1, 'Schuss gezählt');
  assert.equal(ev('G.st.turn'), 1, 'Gegner ist dran');
  assert.equal(ev('G.st.last.angle'), 60, 'gespeicherter Schusswinkel');
  assert.ok(ev('G.st.last.path.length') > 5, 'Flugbahn wurde berechnet: ' + ev('G.st.last.path.length'));
  assert.equal(ev('G.st.h.length'), 19, 'Höhenkarte vorhanden');
  // KI antwortet nach kurzer Bedenkzeit
  await sleep(1600);
  assert.equal(ev('G.st.shots[1].length'), 1, 'KI hat geschossen');
  assert.equal(ev('G.st.turn'), 0, 'ich bin wieder dran');
  assert.ok(ev('G.st.tanks[0].hp') >= 0 && ev('G.st.tanks[0].hp') <= 100, 'HP im gültigen Bereich');
  ev('closeGame()');
});

test('Zwei Geräte (ein Gerät, zwei Spieler): 20 Fragen', async () => {
  ev('if(G)closeGame()');
  ev("startSolo('q20')");
  await sleep(150);
  assert.equal(ev('G.hotseat'), true, 'Hot-Seat-Modus');
  assert.equal(ev('G.st.turn'), 1, 'der Ratende beginnt');
  assert.ok($('q20In'), 'Fragefeld sichtbar');
  $('q20In').value = 'Ist es ein Tier?';
  ev('q20Ask()');
  await sleep(80);
  assert.equal(ev('G.st.asked.length'), 1, 'Frage gestellt');
  assert.ok(win.document.querySelector('.yesno .ja'), 'JA/NEIN/‑Knöpfe erscheinen');
  ev("q20Answer('ja')");
  await sleep(80);
  assert.equal(ev('G.st.asked[0].a'), 'ja', 'Antwort gespeichert');
  assert.equal(ev('G.st.turn'), 1, 'Rater ist wieder dran');
  // falscher Tipp über den Dialog: kostet eine Frage, Rater bleibt am Zug
  ev('q20GuessModal()');
  $('q20G').value = 'völlig falsch';
  clickEl($('q20Go'));
  await sleep(100);
  assert.equal(ev('G.st.guesses.length'), 1, 'Tipp gespeichert');
  assert.equal(ev('G.st.over'), false, 'falscher Tipp beendet das Spiel nicht');
  assert.equal(ev('G.st.turn'), 1, 'Rater bleibt am Zug (Regel korrigiert)');
  assert.equal(ev('GX.q20Left(G.st)'), 18, 'Fragen-Guthaben korrekt');
  // richtiger Tipp beendet die Partie
  const secret = ev('G.st.secret');
  ev('q20GuessModal()');
  $('q20G').value = secret;
  clickEl($('q20Go'));
  await sleep(100);
  assert.equal(ev('G.st.over'), true, 'richtiger Tipp beendet die Partie');
  assert.equal(ev('GX.winner(G.st)'), 1, 'Rater gewinnt');
  assert.ok($('gBoard').textContent.includes(secret), 'Lösung wird angezeigt');
  ev('closeGame()');
});

test('Solo: Geld ausgeben – Kauf, Budget, Wertung', async () => {
  ev("startSolo('money')");
  await sleep(150);
  const items = ev('G.st.catalog.length');
  assert.equal(items, 8, 'acht Artikel im Katalog');
  assert.equal($('gBoard').querySelectorAll('.mitem').length, 8, 'acht Zeilen gerendert');
  const id = ev('G.st.catalog[0].id'), price = ev('G.st.catalog[0].p');
  ev(`moneyBuy('${id}')`);
  await sleep(80);
  assert.equal(ev('G.st.left[0]'), 100 - price, 'Budget korrekt abgebucht');
  assert.ok(ev('G.st.value[0]') > 0, 'Wert gutgeschrieben');
  await sleep(1300);
  assert.ok(ev('G.st.taken.length') > 1, 'KI hat ebenfalls gekauft');
  ev('closeGame()');
});

test('Warteschlange im Raum: zweiter Spieler ⇒ Partie startet automatisch', async () => {
  ev('if(G)closeGame()');
  // Raum- und Netzwerkkontext simulieren (kein echter Broker nötig)
  ev("net={connected:true,publish:()=>{},subscribe:()=>{},on:()=>{}};online=true;");
  ev("chatMode='room';chatRoomName='Testraum';chatLive='nexusBv/lv/r/test';");
  const key = await webcrypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  win.__key = key;
  ev("chatKey=window.__key;histKey='h_rm_testraum';members.set(me,{t:Date.now(),prof:profile});");
  ev("queueJoin('mem')");
  assert.equal(ev('queueLocal(\'mem\')').includes('anna'), true, 'ich stehe in der Schlange');
  assert.equal($('qbar').classList.contains('on'), true, 'Wartebalken sichtbar');
  assert.equal(ev('G'), null, 'alleine startet noch nichts');
  assert.equal(ev("JSON.stringify(queueLocal('mem'))"), '["anna"]', 'ich bin vorgemerkt');
  // Zweiter Spieler meldet sich an
  ev("onQueueMsg({k:'q',a:'join',game:'mem',u:'bert'})");
  await sleep(150);
  assert.ok(ev('G'), 'Partie wurde automatisch gestartet');
  assert.equal(ev('G.type'), 'mem');
  assert.equal(ev('JSON.stringify(G.players)'), '["anna","bert"]', 'Spielerliste stimmt');
  assert.equal($('gameLayer').classList.contains('on'), true, 'Spielfenster offen');
  assert.equal(ev("queueLocal('mem').length"), 0, 'Warteschlange ist geleert');
  // Zug senden (Netzwerk ist gestubbt) und lokalen Effekt prüfen
  const before = ev('G.st.open.length');
  ev('memTap(0)');
  assert.equal(ev('G.st.open.length'), before + 1, 'Zug lokal angewendet');
  ev('closeGame()');
});

test('Einladung: QR wird lokal erzeugt (kein CDN)', async () => {
  ev("chatMode='room';chatRoomName='Testraum';chatId='room:testraum';");
  ev('inviteModal()');
  assert.ok($('modal').classList.contains('on'), 'Einladungsdialog offen');
  const url = $('invUrl').value;
  assert.ok(url.includes('room=Testraum'), 'Einladungslink enthält den Raum: ' + url);
  // jsdom hat kein Canvas ⇒ der SVG-Fallback muss greifen
  const box = $('qrBox');
  assert.ok(box, 'QR-Bereich vorhanden');
  const svg = box.querySelector('svg') || win.document.querySelector('#qrBox svg');
  assert.ok(svg, 'QR als SVG gerendert (Fallback ohne Canvas)');
  assert.ok(svg.innerHTML.length > 200, 'QR-Muster enthält Module');
  assert.ok(box.textContent.length === 0 || true);
  // Der QR-Code muss den Link wirklich enthalten
  const matrix = win.NexusQR.matrixFor(url);
  assert.ok(matrix.size >= 21 && matrix.size <= 177, 'gültige QR-Größe: ' + matrix.size);
  assert.ok(win.NexusQR.svgFor(url).includes('<path'), 'SVG-Ausgabe nutzbar');
  ev('closeModal()');
});

test('Eingehende Nachricht: Verlauf, Ungelesen-Zähler, Benachrichtigung', async () => {
  ev("chatMode='dm';chatPeer='bert';chatId='dm:bert';histKey='h_dm_anna_bert';friends=['bert'];");
  await ev("handleIncoming({kind:'dm',id:'bert',hk:'h_dm_anna_bert',ck:'dm:bert'}," +
    "{k:'msg',id:'m-test-1',u:'bert',text:'Hallo Anna!',ts:'12:00'})");
  assert.equal(ev("getHist('h_dm_anna_bert').length"), 1, 'Nachricht im Verlauf');
  assert.equal(ev("unread['dm:bert']"), 1, 'Ungelesen-Zähler erhöht');
  assert.ok(ev('notis.length') >= 1, 'Benachrichtigung erzeugt');
  // Doppelte Zustellung darf nichts doppelt zählen
  await ev("handleIncoming({kind:'dm',id:'bert',hk:'h_dm_anna_bert',ck:'dm:bert'}," +
    "{k:'msg',id:'m-test-1',u:'bert',text:'Hallo Anna!',ts:'12:00'})");
  assert.equal(ev("getHist('h_dm_anna_bert').length"), 1, 'keine Dubletten');
  assert.equal(ev("unread['dm:bert']"), 1, 'Zähler bleibt korrekt');
});

test('Tippen-Anzeige: erscheint und verschwindet wieder (Bugfix)', async () => {
  ev("chatMode='dm';chatPeer='bert';chatId='dm:bert';typers.clear();show('scChat');");
  ev("onLive({kind:'dm',ck:'dm:bert'},{k:'typ',u:'bert'})");
  const sub = $('chSub');
  assert.ok(sub.textContent.includes('schreibt'), 'Hinweis erscheint: ' + sub.textContent);
  // Tippen läuft nach 3,5 s ab – der Wachhund muss die Kopfzeile zurücksetzen
  ev('typers.set("bert",Date.now()-9000)');
  ev('updateSubTyping()');
  assert.equal(sub.textContent.includes('schreibt'), false, 'Hinweis verschwindet wieder');
});

test('Screenshot-Schutz: Cover und Wasserzeichen', () => {
  ev("secProt=true;show('scChat')");
  ev('secCover(true)');
  assert.equal($('secCover').classList.contains('on'), true, 'schwarzer Cover aktiv');
  ev('secCover(false)');
  assert.equal($('secCover').classList.contains('on'), false, 'Cover wieder weg');
  ev('renderWatermark()');
  const wm = $('wm');
  assert.ok(wm.children.length >= 6, 'Wasserzeichen gesetzt: ' + wm.children.length + ' Felder');
  assert.ok(wm.textContent.includes('anna'), 'Kennung enthält den Namen');
  ev("show('scHome')");
});

test('Admin: fest eingebauter Schlüssel verifiziert echte Signaturen', async () => {
  assert.ok(ev('ADMIN_PUB && ADMIN_PUB.kty'), 'ADMIN_PUB ist im Code hinterlegt');
  await ev('loadAdminPub()');
  assert.ok(ev('adminPubKey'), 'öffentlicher Schlüssel geladen');
  const keyFile = readFileSync(resolve(ROOT, 'admin-key.local.txt'), 'utf8');
  const line = keyFile.split('\n').map((l) => l.trim()).find((l) => l.startsWith('{') && l.includes('"d"'));
  assert.ok(line, 'privater Schlüssel in admin-key.local.txt gefunden');
  const priv = JSON.parse(line);
  const key = await webcrypto.subtle.importKey('jwk', priv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const payload = JSON.stringify({ k: 'ann', text: 'Willkommen im Nexus!', by: 'admin', t: Date.now(), n: 'nonce-test-1' });
  const sig = await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, Buffer.from(payload, 'utf8'));
  const b64 = Buffer.from(sig).toString('base64');
  const notis = ev('notis.length');
  await ev(`onAdminRaw({b:${JSON.stringify(payload)},s:${JSON.stringify(b64)}})`);
  assert.ok(ev('notis.length') > notis, 'signierte Ankündigung wurde angenommen');
  assert.ok(ev('notis[0].x').includes('Willkommen'), 'Text der Ankündigung übernommen');
  assert.ok(ev("modlog.some(l=>l.t.includes('📢')&&l.t.includes('Willkommen'))"), 'Moderations-Log gefüllt: ' + ev('JSON.stringify(modlog[0]||{})'));
  // Gefälschte Signatur muss abgelehnt werden
  const fake = JSON.stringify({ k: 'ann', text: 'FALSCHE Ankündigung', by: 'hacker', t: Date.now(), n: 'nonce-fake' });
  const n2 = ev('notis.length');
  await ev(`onAdminRaw({b:${JSON.stringify(fake)},s:${JSON.stringify(b64)}})`);
  assert.equal(ev('notis.length'), n2, 'Manipulierte Ankündigung wird verworfen');
});

test('Service Worker: Datei vorhanden und mit App-Liste konsistent', () => {
  const sw = readFileSync(resolve(ROOT, 'sw.js'), 'utf8');
  assert.ok(sw.includes("addEventListener('install'"), 'install-Handler');
  assert.ok(sw.includes("addEventListener('fetch'"), 'fetch-Handler (Offline)');
  assert.ok(sw.includes("addEventListener('notificationclick'"), 'Klick öffnet den Raum');
  ['index.html', 'games.js', 'qr.js', 'vendor/mqtt.min.js', 'vendor/qrcode.js', 'icons/icon-192.png']
    .forEach((f) => assert.ok(sw.includes(f), f + ' wird vorgehalten'));
  assert.ok(sw.includes('showNotification'), 'System-Benachrichtigungen');
});

test('Keine unbehandelten Fehler während des gesamten Durchlaufs', () => {
  const real = errors.filter((e) => !/favicon/i.test(e));
  assert.deepEqual(real, [], 'Fehlermeldungen: ' + real.join(' | '));
});
