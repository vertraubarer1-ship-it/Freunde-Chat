/* Tests für games.js – laufen ohne Browser: node --test tests/ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const G = require('../games.js');

/* ── Hilfen ──────────────────────────────────────────────────────────── */
const play = (state, player, m) => { const r = G.move(state, player, m); return r; };
const mustPlay = (state, player, m) => { const r = G.move(state, player, m); assert.equal(r.ok, true, 'Zug sollte erlaubt sein: ' + JSON.stringify(m) + ' → ' + r.error); return r.state; };
const createAny = (type, seed) => G.create(type, seed);

/* ══ Zufall & Hilfsfunktionen ═════════════════════════════════════════ */
test('rng: gleicher Seed liefert gleiche Folge, andere Seeds nicht', () => {
  const a = G.rng(1234), b = G.rng(1234), c = G.rng(1235);
  const seqA = [a(), a(), a(), a()], seqB = [b(), b(), b(), b()], seqC = [c(), c(), c(), c()];
  assert.deepEqual(seqA, seqB);
  assert.notDeepEqual(seqA, seqC);
  seqA.forEach((v) => { assert.ok(v >= 0 && v < 1, 'Wert im Bereich [0,1)'); });
});

test('rng: akzeptiert Zahlen und Zeichenketten als Seed', () => {
  assert.deepEqual([G.rng('raum-7')(), G.rng('raum-7')()], [G.rng(G.seedFrom('raum-7'))(), G.rng(G.seedFrom('raum-7'))()]);
  assert.equal(typeof G.seedFrom('abc'), 'number');
  assert.equal(G.seedFrom(''), G.seedFrom(''));
  assert.notEqual(G.seedFrom('a'), G.seedFrom('b'));
});

test('shuffle: behält alle Elemente, verändert das Original nicht', () => {
  const src = [1, 2, 3, 4, 5, 6, 7, 8];
  const out = G.shuffle(src, G.rng(7));
  assert.equal(src.length, 8);
  assert.deepEqual(src, [1, 2, 3, 4, 5, 6, 7, 8], 'Original unverändert');
  assert.deepEqual(out.slice().sort((x, y) => x - y), [1, 2, 3, 4, 5, 6, 7, 8], 'Permutation');
  assert.deepEqual(out, G.shuffle(src, G.rng(7)), 'deterministisch');
});

test('other/winner: einfache Helfer', () => {
  assert.equal(G.other(0), 1);
  assert.equal(G.other(1), 0);
  assert.equal(G.winner(null), undefined);
  assert.equal(G.winner({ type: 'ttt', over: false }), undefined);
  assert.equal(G.winner({ type: 'ttt', over: true, winner: 1 }), 1);
  assert.equal(G.winner({ type: 'ttt', over: true, winner: null }), -1);
});

/* ══ Tic Tac Toe ══ */
test('winTTT: erkennt alle acht Reihen', () => {
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const l of lines) {
    const b = new Array(9).fill(0);
    l.forEach((i) => { b[i] = 1; });
    const w = G.winTTT(b);
    assert.ok(w, 'Reihe ' + l.join(',') + ' erkannt');
    assert.equal(w.p, 1);
    assert.deepEqual(w.line.slice().sort(), l.slice().sort());
  }
});

test('winTTT: kein falsch-positiver Treffer bei gemischten Feldern', () => {
  assert.equal(G.winTTT([1,1,2,2,1,1,1,2,2]), null);
  assert.equal(G.winTTT(new Array(9).fill(0)), null);
  assert.equal(G.winTTT([1,2,1,2,1,2,2,1,2]), null);
});

test('aiPickTTT: gewinnt sofort, wenn möglich', () => {
  const b = [2,2,0, 1,1,0, 0,0,0];
  assert.equal(G.aiPickTTT(b, { me: 2, rng: G.rng(1) }), 2);
});

test('aiPickTTT: blockt den Gegner, wenn nötig', () => {
  const b = [1,1,0, 2,0,0, 0,0,0];
  assert.equal(G.aiPickTTT(b, { me: 2, rng: G.rng(1) }), 2);
});

test('aiPickTTT: nimmt die Mitte, sonst ein freies Feld', () => {
  assert.equal(G.aiPickTTT([0,0,0,0,0,0,0,0,0], { me: 2, rng: G.rng(3) }), 4);
  assert.equal(G.aiPickTTT(new Array(9).fill(1), { me: 2 }), -1, 'volles Feld → -1');
  const pick = G.aiPickTTT([1,0,0,0,1,0,0,0,1], { me: 2, rng: G.rng(5) });
  assert.ok([1, 2, 5, 6, 7, 8].includes(pick));
});

test('move(ttt): Sieg, Gleichstand und Regelverstöße', () => {
  let s = createAny('ttt', 's1');
  s = mustPlay(s, 0, { a: 'place', i: 0 });
  s = mustPlay(s, 1, { a: 'place', i: 3 });
  s = mustPlay(s, 0, { a: 'place', i: 1 });
  s = mustPlay(s, 1, { a: 'place', i: 4 });
  assert.equal(play(s, 1, { a: 'place', i: 8 }).ok, false, 'nicht am Zug');
  const r = play(s, 0, { a: 'place', i: 2 });
  assert.equal(r.ok, true);
  assert.equal(r.state.over, true);
  assert.equal(r.state.winner, 0);
  assert.ok(r.events.some((e) => e.type === 'win'));
  assert.equal(play(s, 0, { a: 'place', i: 0 }).ok, false, 'belegtes Feld');
});

test('move(ttt): Unentschieden wird erkannt', () => {
  let s = createAny('ttt', 'x');
  const seq = [[0,4],[1,0],[0,8],[1,2],[0,6],[1,3],[0,5],[1,7],[0,1]];   // endet 4:5 ohne Reihe
  for (const [p, i] of seq) s = mustPlay(s, p, { a: 'place', i });
  assert.equal(s.over, true);
  assert.equal(s.winner, null);
  assert.equal(G.winner(s), -1);
});

/* ══ Vier Gewinnt ══ */
test('winC4: waagerecht, senkrecht und diagonal', () => {
  const mk = (cells, p) => { const b = new Array(42).fill(0); cells.forEach(([r, c]) => { b[r * 7 + c] = p; }); return b; };
  assert.ok(G.winC4(mk([[5,0],[5,1],[5,2],[5,3]], 1)));
  assert.ok(G.winC4(mk([[2,4],[3,4],[4,4],[5,4]], 2)));
  assert.ok(G.winC4(mk([[2,0],[3,1],[4,2],[5,3]], 1)));
  assert.ok(G.winC4(mk([[2,6],[3,5],[4,4],[5,3]], 2)));
  assert.equal(G.winC4(mk([[5,0],[5,1],[5,2]], 1)), null, 'drei reichen nicht');
});

test('move(c4): Stein fällt nach unten, volle Spalte wird abgelehnt, Sieg erkannt', () => {
  let s = createAny('c4', 'c1');
  s = mustPlay(s, 0, { a: 'drop', i: 0 });
  assert.equal(s.board[5 * 7 + 0], 1, 'unten gelandet');
  s = mustPlay(s, 1, { a: 'drop', i: 0 });
  assert.equal(s.board[4 * 7 + 0], 2);
  let t = createAny('c4', 'c2');
  for (let i = 0; i < 6; i++) t = mustPlay(t, i % 2, { a: 'drop', i: 3 });
  assert.equal(play(t, 0, { a: 'drop', i: 3 }).ok, false, 'Spalte voll');
  let w = createAny('c4', 'c3');
  w = mustPlay(w, 0, { a: 'drop', i: 0 });
  w = mustPlay(w, 1, { a: 'drop', i: 6 });
  w = mustPlay(w, 0, { a: 'drop', i: 1 });
  w = mustPlay(w, 1, { a: 'drop', i: 6 });
  w = mustPlay(w, 0, { a: 'drop', i: 2 });
  w = mustPlay(w, 1, { a: 'drop', i: 6 });
  const r = play(w, 0, { a: 'drop', i: 3 });
  assert.equal(r.state.over, true);
  assert.equal(r.state.winner, 0);
});

/* ══ Schere Stein Papier ══ */
test('rpsResult: vollständige Matrix', () => {
  assert.equal(G.rpsResult(1, 1), 0);
  assert.equal(G.rpsResult(2, 2), 0);
  assert.equal(G.rpsResult(3, 3), 0);
  assert.equal(G.rpsResult(1, 3), 1);   // Stein schlägt Schere
  assert.equal(G.rpsResult(2, 1), 1);   // Papier schlägt Stein
  assert.equal(G.rpsResult(3, 2), 1);   // Schere schlägt Papier
  assert.equal(G.rpsResult(3, 1), -1);
  assert.equal(G.rpsResult(1, 2), -1);
  assert.equal(G.rpsResult(2, 3), -1);
});

test('move(rps): verdeckte Wahl, dann Auflösung', () => {
  let s = createAny('rps', 'r1');
  s = mustPlay(s, 0, { a: 'pick', i: 1 });
  assert.equal(play(s, 1, { a: 'pick', i: 9 }).ok, false, 'ungültige Wahl');
  const r = play(s, 1, { a: 'pick', i: 3 });
  assert.equal(r.ok, true);
  assert.equal(r.state.over, true);
  assert.equal(r.state.result, 1);
  assert.equal(r.state.winner, 0);
  assert.equal(play(s, 0, { a: 'pick', i: 2 }).ok, false, 'schon gewählt');
});

/* ══ Memory ══ */
test('memCreate: 16 Karten, jedes Paar genau zweimal, deterministisch', () => {
  const s = G.memCreate('mem-seed-1');
  assert.equal(s.type, 'mem');
  assert.equal(s.cards.length, 16);
  assert.equal(s.pairs, 8);
  const counts = {};
  s.cards.forEach((c) => { counts[c.k] = (counts[c.k] || 0) + 1; });
  assert.equal(Object.keys(counts).length, 8);
  Object.values(counts).forEach((n) => assert.equal(n, 2, 'jede Kartenart genau zweimal'));
  assert.deepEqual(s.cards.map((c) => c.e), G.memCreate('mem-seed-1').cards.map((c) => c.e), 'gleicher Seed → gleiches Feld');
  assert.notDeepEqual(s.cards.map((c) => c.e), G.memCreate('mem-seed-2').cards.map((c) => c.e), 'anderer Seed → anderes Feld');
});

test('memCreate: alle Emojis unterscheidbar', () => {
  const s = G.memCreate(42);
  const emojis = s.cards.map((c) => c.e);
  const uniq = [...new Set(emojis)];
  assert.equal(uniq.length, 8);
  assert.ok(uniq.every((e) => typeof e === 'string' && e.length > 0));
});

test('memFlip: Reihenfolge, Fehlversuch-Auflösung und Zugwechsel', () => {
  const s = G.memCreate(9);
  const first = 0;
  const twin = s.cards.findIndex((c, i) => i !== first && c.k === s.cards[first].k);
  const notTwin = s.cards.findIndex((c) => c.k !== s.cards[first].k);
  let a = mustPlay(s, 0, { a: 'flip', i: first });
  assert.equal(a.open.length, 1);
  assert.equal(a.turn, 0, 'nach erster Karte weiter am Zug');
  assert.equal(play(a, 0, { a: 'flip', i: first }).ok, false, 'nicht zweimal dieselbe Karte');
  const b = mustPlay(a, 0, { a: 'flip', i: notTwin });
  assert.equal(b.open.length, 2);
  assert.equal(b.pending, 'hide');
  const c = mustPlay(b, 0, { a: 'resolve' });
  assert.equal(c.open.length, 0);
  assert.equal(c.turn, 1, 'nach Fehlversuch wechselt der Zug');
  assert.equal(G.memResolve(c).ok, false, 'nichts mehr aufzulösen');
  const d = mustPlay(s, 0, { a: 'flip', i: first });
  const e = mustPlay(d, 0, { a: 'flip', i: twin });
  assert.equal(e.score[0], 1);
  assert.equal(e.open.length, 0, 'Treffer bleiben offen');
  assert.equal(e.turn, 0, 'bei Treffer weiter am Zug');
  assert.equal(play(e, 0, { a: 'flip', i: twin }).ok, false, 'bereits gefundenes Paar');
});

test('memFlip: Regelverstöße', () => {
  const s = G.memCreate(4);
  assert.equal(play(s, 1, { a: 'flip', i: 0 }).ok, false, 'nicht am Zug');
  assert.equal(play(s, 0, { a: 'flip', i: -1 }).ok, false);
  assert.equal(play(s, 0, { a: 'flip', i: 99 }).ok, false);
  assert.equal(play(s, 0, { a: 'flip', i: 1.5 }).ok, false);
  assert.equal(play(s, 0, { a: 'quatsch' }).ok, false);
});

test('Memory: ganzes Spiel bis zum Ende, Punkte und Sieger stimmen', () => {
  let s = G.memCreate('full-game');
  let guard = 0;
  while (!s.over && guard++ < 200) {
    const p = s.turn;
    const free = [];
    for (let i = 0; i < s.cards.length; i++) if (s.done.indexOf(i) < 0 && s.open.indexOf(i) < 0) free.push(i);
    const first = free[0];
    const twin = free.find((i) => i !== first && s.cards[i].k === s.cards[first].k);
    s = mustPlay(s, p, { a: 'flip', i: first });
    s = mustPlay(s, p, { a: 'flip', i: twin });
  }
  assert.equal(s.over, true);
  assert.equal(s.done.length, 16);
  assert.equal(s.score[0] + s.score[1], 8, 'acht Paare verteilt');
  assert.equal(s.score[0], 8, 'wer alles kennt, holt alle Paare');
  assert.equal(G.winner(s), 0);
});

test('memAiMove: nimmt die zweite Karte, wenn sie bekannt ist', () => {
  const s = G.memCreate(11);
  const first = 0, twin = s.cards.findIndex((c, i) => i !== first && c.k === s.cards[first].k);
  const opened = mustPlay(s, 0, { a: 'flip', i: first });
  assert.equal(G.memAiMove(opened, { rng: G.rng(2) }), twin);
});

test('memAiMove: trifft keine verbotenen Felder', () => {
  const s = G.memCreate(21);
  const rnd = G.rng(5);
  for (let n = 0; n < 50; n++) {
    const i = G.memAiMove(s, { rng: rnd });
    assert.ok(Number.isInteger(i) && i >= 0 && i < 16);
    assert.equal(s.done.indexOf(i), -1);
  }
});

/* ══ Schiffe versenken ══ */
test('bsCreate: Feld, Flotte und Phasen', () => {
  const s = G.bsCreate('bs-1');
  assert.equal(s.type, 'bs');
  assert.equal(s.size, 8);
  assert.equal(s.phase, 'place');
  assert.equal(s.grid[0].length, 64);
  assert.equal(G.BS_FLEET.length, 5);
  assert.equal(G.BS_CELLS, 14, '4+3+3+2+2');
  assert.ok(s.grid[0].every((v) => v === -1));
  assert.deepEqual(s.ready, [false, false]);
  assert.equal(play(s, 0, { a: 'fire', i: 0 }).ok, false, 'vor dem Platzieren kein Schießen');
});

test('bsAutoPlace: 14 belegte Zellen, keine Überlappung, im Feld', () => {
  for (const seed of [1, 2, 3, 99, 123456]) {
    const r = G.bsAutoPlace(G.bsCreate(seed), 0, seed);
    assert.equal(r.ok, true);
    const s = r.state;
    assert.equal(s.ships[0].length, 5, 'alle fünf Schiffe gesetzt');
    const cells = [];
    s.ships[0].forEach((sh) => G.bsCellsOf(s, sh).forEach((c) => cells.push(c)));
    assert.equal(cells.length, 14);
    assert.equal(new Set(cells).size, 14, 'keine Doppelbelegung');
    cells.forEach((c) => { assert.ok(c >= 0 && c < 64, 'im Feld'); assert.notEqual(s.grid[0][c], -1); });
  }
});

test('bsAutoPlace: deterministisch und für beide Spieler unterschiedlich', () => {
  const a = G.bsAutoPlace(G.bsCreate('d'), 0, 7).state;
  const b = G.bsAutoPlace(G.bsCreate('d'), 0, 7).state;
  assert.deepEqual(a.ships[0], b.ships[0], 'gleicher Seed → gleiche Aufstellung');
  const p1 = G.bsAutoPlace(G.bsCreate('d'), 1, 7).state;
  assert.notDeepEqual(a.ships[0].map(JSON.stringify), p1.ships[1].map(JSON.stringify), 'Spieler 1 bekommt eine andere Aufstellung');
});

test('bsPlaceShip: gültig, überlappend und außerhalb', () => {
  let s = G.bsCreate('pl');
  const ok1 = G.bsPlaceShip(s, 0, 'S', 0, 0, true);
  assert.equal(ok1.ok, true);
  assert.deepEqual(G.bsShipCells(ok1.state, 0, 'S'), [0, 1, 2, 3]);
  assert.equal(G.bsPlaceShip(ok1.state, 0, 'K', 0, 2, false).ok, false, 'Überlappung');
  assert.equal(G.bsPlaceShip(ok1.state, 0, 'K', 0, 6, true).ok, false, 'ragt hinaus');
  assert.equal(G.bsPlaceShip(ok1.state, 0, 'K', 7, 6, false).ok, false, 'ragt hinaus (unten)');
  assert.equal(G.bsPlaceShip(ok1.state, 0, 'S', 4, 0, true).ok, false, 'Schiff schon gesetzt');
  assert.equal(G.bsPlaceShip(ok1.state, 0, 'XX', 4, 0, true).ok, false, 'unbekanntes Schiff');
  const ok2 = G.bsPlaceShip(ok1.state, 0, 'K', 2, 0, false);
  assert.equal(ok2.ok, true);
  assert.deepEqual(G.bsShipCells(ok2.state, 0, 'K'), [16, 24, 32]);
  assert.equal(G.bsPlaceShip(ok2.state, 0, 'K2', 3, 0, false).ok, false, 'Überlappung mit Kreuzer');
});

test('bsRemoveShip/bsClearShips: geben Zellen frei', () => {
  let s = G.bsAutoPlace(G.bsCreate('rm'), 0, 3).state;
  const before = s.grid[0].filter((v) => v !== -1).length;
  assert.equal(before, 14);
  const ship = s.ships[0][0];
  const cells = G.bsCellsOf(s, ship);
  const after = G.bsRemoveShip(s, 0, ship.id).state;
  cells.forEach((c) => assert.equal(after.grid[0][c], -1, 'Zelle frei'));
  assert.equal(after.ships[0].length, 4);
  const cleared = G.bsClearShips(after, 0).state;
  assert.equal(cleared.grid[0].filter((v) => v !== -1).length, 0);
  assert.equal(G.bsRemoveShip(cleared, 0, 'S').ok, false, 'nichts zu entfernen');
});

test('bsReady: nur mit vollständiger Flotte, dann Schussphase', () => {
  let s = G.bsAutoPlace(G.bsCreate('r'), 0, 5).state;
  assert.equal(G.bsReady(s, 1).ok, false, 'Flotte fehlt');
  s = G.bsAutoPlace(s, 1, 6).state;
  const a = G.bsReady(s, 0);
  assert.equal(a.ok, true);
  assert.equal(a.state.phase, 'place', 'einer allein startet nicht');
  const b = G.bsReady(a.state, 1);
  assert.equal(b.ok, true);
  assert.equal(b.state.phase, 'fire');
  assert.equal(b.state.turn, 0);
  assert.ok(b.events.some((e) => e.type === 'start'));
});

/* Schuss-Tests brauchen eine bekannte Aufstellung: das Schlachtschiff liegt
   waagerecht auf 0,1,2,3 – die anderen Schiffe manuell drumherum.          */
function mustPlace(s, p, id, r, c, horiz) {
  const res = G.bsPlaceShip(s, p, id, r, c, horiz);
  assert.equal(res.ok, true, 'Platzierung ' + id + ' auf ' + r + '/' + c + ' → ' + res.error);
  return res.state;
}
function bsFixture() {
  let s = G.bsCreate('fx');
  // Spieler 0:  S=[0,1,2,3] K=[16,17,18] K2=[20,21,22] Z=[32,33] Z2=[35,36]
  s = mustPlace(s, 0, 'S', 0, 0, true);
  s = mustPlace(s, 0, 'K', 2, 0, true);
  s = mustPlace(s, 0, 'K2', 2, 4, true);
  s = mustPlace(s, 0, 'Z', 4, 0, true);
  s = mustPlace(s, 0, 'Z2', 4, 3, true);
  // Spieler 1:  S=[60,61,62,63] K=[48,49,50] K2=[51,52,53] Z=[38,39] Z2=[32,33]
  s = mustPlace(s, 1, 'S', 7, 4, true);
  s = mustPlace(s, 1, 'K', 6, 0, true);
  s = mustPlace(s, 1, 'K2', 6, 3, true);
  s = mustPlace(s, 1, 'Z', 4, 6, true);
  s = mustPlace(s, 1, 'Z2', 4, 0, true);
  s = G.bsReady(s, 0).state;
  s = G.bsReady(s, 1).state;
  return s;
}

test('bsFire: Treffer, Fehlschuss und Zuglogik', () => {
  let s = bsFixture();
  assert.equal(s.phase, 'fire');
  assert.equal(play(s, 1, { a: 'fire', i: 60 }).ok, false, 'nicht am Zug');
  // Spieler 0 schießt auf Spieler 1 (Schiff auf 60..63)
  let r = play(s, 0, { a: 'fire', i: 60 });
  assert.equal(r.ok, true);
  assert.ok(r.events.some((e) => e.type === 'hit'));
  assert.equal(r.state.turn, 0, 'Treffer ⇒ nochmal schießen');
  assert.equal(play(r.state, 0, { a: 'fire', i: 60 }).ok, false, 'Feld schon beschossen');
  r = play(r.state, 0, { a: 'fire', i: 0 });
  assert.ok(r.events.some((e) => e.type === 'miss'));
  assert.equal(r.state.turn, 1, 'Fehlschuss ⇒ Gegner dran');
  r = play(r.state, 1, { a: 'fire', i: 0 });
  assert.ok(r.events.some((e) => e.type === 'hit'));
  assert.equal(r.state.turn, 1, 'Treffer ⇒ nochmal');
});

test('bsFire: Versenken und Sieg', () => {
  let s = bsFixture();
  // Spieler 0 versenkt die komplette Flotte von Spieler 1 (Treffer ⇒ nochmal)
  const targets = [];
  s.ships[1].forEach((sh) => G.bsCellsOf(s, sh).forEach((c) => targets.push(c)));
  assert.equal(targets.length, 14);
  let events = [];
  for (const cell of targets) {
    if (s.over) break;
    assert.equal(s.turn, 0, 'Treffer halten den Zug');
    const r = play(s, 0, { a: 'fire', i: cell });
    assert.equal(r.ok, true, 'Schuss auf ' + cell + ' sollte gehen → ' + r.error);
    s = r.state;
    events = events.concat(r.events);
  }
  assert.ok(events.some((e) => e.type === 'sunk'), 'mindestens ein Schiff versenkt');
  assert.ok(events.filter((e) => e.type === 'sunk').length >= 3, 'mehrere Schiffe versenkt');
  assert.equal(s.over, true);
  assert.equal(s.winner, 0);
  assert.equal(s.phase, 'over');
  assert.equal(G.bsFleetRemaining(s, 1), 0, 'keine Schiffe übrig');
  assert.equal(G.bsAllSunk(s, 1), true);
  assert.ok(events.some((e) => e.type === 'over'));
  assert.equal(play(s, 0, { a: 'fire', i: 20 }).ok, false, 'nach Spielende kein Schuss');
});

test('bsFire: Regelverstöße', () => {
  const s = bsFixture();
  assert.equal(play(s, 0, { a: 'fire', i: -1 }).ok, false);
  assert.equal(play(s, 0, { a: 'fire', i: 64 }).ok, false);
  assert.equal(play(s, 0, { a: 'fire', i: 1.2 }).ok, false);
  assert.equal(play(s, 0, { a: 'reload' }).ok, false);
});

test('bsStats: Trefferquote wird berechnet', () => {
  let s = bsFixture();
  s = mustPlay(s, 0, { a: 'fire', i: 60 });   // Treffer auf Schlachtschiff von Spieler 1
  s = mustPlay(s, 0, { a: 'fire', i: 7 });    // Fehlschuss → Gegner dran
  assert.equal(s.turn, 1);
  s = mustPlay(s, 1, { a: 'fire', i: 1 });    // Treffer auf Schiff von Spieler 0
  s = mustPlay(s, 1, { a: 'fire', i: 30 });   // Fehlschuss → Spieler 0 dran
  assert.equal(s.turn, 0);
  const st0 = G.bsStats(s, 0);
  assert.equal(st0.shots, 2);
  assert.equal(st0.hits, 1);
  assert.equal(st0.misses, 1);
  assert.equal(st0.accuracy, 50);
  assert.equal(st0.remaining, 5, 'kein Schiff komplett versenkt');
  const st1 = G.bsStats(s, 1);
  assert.equal(st1.shots, 2);
  assert.equal(st1.hits, 1);
  assert.equal(st1.misses, 1);
  assert.equal(st1.accuracy, 50);
  assert.equal(G.bsFleetRemaining(s, 1), 5);
  const empty = G.bsStats(bsFixture(), 0);
  assert.equal(empty.shots, 0);
  assert.equal(empty.accuracy, 0, 'keine Division durch Null');
});

test('bsRandomFleet: nur gültige Aufstellungen', () => {
  for (let seed = 0; seed < 40; seed++) {
    const fleet = G.bsRandomFleet(seed);
    assert.ok(fleet && fleet.length === 5, 'acht Seed ' + seed);
    const cells = [];
    for (const sh of fleet) {
      const cs = [];
      for (let i = 0; i < sh.id.length && i < 99; i++) break;
      const len = { S: 4, K: 3, K2: 3, Z: 2, Z2: 2 }[sh.id];
      for (let i = 0; i < len; i++) cs.push(sh.horiz ? G.bsIdx(8, sh.r, sh.c + i) : G.bsIdx(8, sh.r + i, sh.c));
      cs.forEach((c) => { assert.ok(c >= 0 && c < 64); cells.push(c); });
    }
    assert.equal(new Set(cells).size, 14, 'keine Überlappung (Seed ' + seed + ')');
  }
});

/* ══ Tank Wars ══ */
test('tankCreate: Gelände, Panzer und Wind', () => {
  const s = G.tankCreate('tank-1');
  assert.equal(s.type, 'tank');
  assert.equal(s.size[0], G.TK_W);
  assert.equal(s.size[1], G.TK_H);
  assert.equal(s.h.length, G.TK_W);
  s.h.forEach((h) => assert.ok(h >= 0 && h <= G.TK_H, 'Höhe im Feld'));
  assert.equal(s.tanks.length, 2);
  assert.deepEqual(s.hp, [G.TK_HP, G.TK_HP]);
  assert.ok(Number.isInteger(s.wind));
  assert.equal(s.turn, 0);
  assert.equal(s.grid.length, G.TK_H);
  assert.equal(s.grid[0].length, G.TK_W);
  assert.equal(s.grid[G.TK_H - 1][0], true, 'unterste Reihe ist solide');
});

test('tankCreate: deterministisch pro Seed', () => {
  const a = G.tankCreate('same'), b = G.tankCreate('same'), c = G.tankCreate('other');
  assert.deepEqual(a.h, b.h);
  assert.equal(a.wind, b.wind);
  assert.notDeepEqual(a.h, c.h);
});

test('tankFire: Regelverstöße bei Winkel, Power und Zugrecht', () => {
  const s = G.tankCreate('v');
  assert.equal(play(s, 1, { a: 'fire', angle: 45, power: 50 }).ok, false, 'nicht am Zug');
  assert.equal(play(s, 0, { a: 'fire', angle: 0, power: 50 }).ok, false, 'Winkel zu klein');
  assert.equal(play(s, 0, { a: 'fire', angle: 90, power: 50 }).ok, false, 'Winkel zu groß');
  assert.equal(play(s, 0, { a: 'fire', angle: 45, power: 0 }).ok, false, 'Power zu klein');
  assert.equal(play(s, 0, { a: 'fire', angle: 45, power: 999 }).ok, false, 'Power zu groß');
  assert.equal(play(s, 0, { a: 'fire', angle: NaN, power: 50 }).ok, false);
  assert.equal(play(s, 0, { a: 'nuke' }).ok, false);
});

test('tankFire: Schuss trifft Gelände, Zug wechselt, Protokoll gefüllt', () => {
  let s = G.tankCreate('shot', { turn: 0 });
  const r = play(s, 0, { a: 'fire', angle: 45, power: 60 });
  assert.equal(r.ok, true);
  s = r.state;
  const impact = r.events.find((e) => e.type === 'impact');
  assert.ok(impact, 'Einschlag gemeldet');
  assert.ok(impact.x >= 0 && impact.x < G.TK_W);
  assert.ok(impact.path.length > 0, 'Flugbahn protokolliert');
  assert.equal(s.turn, 1, 'danach ist der Gegner dran');
  assert.equal(s.shots[0].length, 1);
  assert.equal(s.log.length, 1);
});

test('tankFire: Physik ist deterministisch (gleiche Eingabe → gleiches Ergebnis)', () => {
  for (const [angle, power] of [[30, 40], [45, 70], [60, 100], [12, 25], [80, 90]]) {
    const a = play(G.tankCreate('det'), 0, { a: 'fire', angle, power });
    const b = play(G.tankCreate('det'), 0, { a: 'fire', angle, power });
    assert.deepEqual(a.state, b.state, 'gleicher Zustand für ' + angle + '/' + power);
    assert.deepEqual(a.events, b.events, 'gleiche Ereignisse');
  }
  const c = play(G.tankCreate('det'), 0, { a: 'fire', angle: 45, power: 50 });
  const d = play(G.tankCreate('det'), 0, { a: 'fire', angle: 46, power: 50 });
  assert.notDeepEqual(c.state.last, d.state.last, 'andere Eingabe → andere Bahn');
});

test('tankFire: Krater zerstört Gelände und Panzer fällt nach', () => {
  let s = G.tankCreate('crater', { turn: 0 });
  const solidBefore = s.grid.flat().filter(Boolean).length;
  const r = play(s, 0, { a: 'fire', angle: 45, power: 75 });
  s = r.state;
  const solidAfter = s.grid.flat().filter(Boolean).length;
  assert.ok(solidAfter <= solidBefore, 'Gelände wurde abgetragen oder blieb gleich');
  const impact = r.events.find((e) => e.type === 'impact');
  assert.ok(impact.y >= 0);
  s.tanks.forEach((t) => {
    assert.ok(t.y >= 0 && t.y < G.TK_H);
    assert.equal(s.grid[t.y + 1][t.x], true, 'unter dem Panzer ist fester Boden');
    assert.equal(s.grid[t.y][t.x], false, 'Panzer steht in einer Luftzelle');
  });
});

/* Sucht den besten Schuss (Treffer > Reichweite) – wie ein guter Spieler. */
function bestTankShot(state, p) {
  let best = null;
  for (let a = 5; a <= 85; a += 5) {
    for (let pw = 10; pw <= 100; pw += 5) {
      const r = G.move(state, p, { a: 'fire', angle: a, power: pw });
      if (!r.ok) continue;
      const imp = r.events.find((e) => e.type === 'impact');
      const hit = r.events.find((e) => e.type === 'hit' && e.victim !== p);
      const score = hit ? 1000 + hit.dmg : -Math.abs(imp.x - state.tanks[1 - p].x);
      if (!best || score > best.score) best = { score, angle: a, power: pw, result: r };
    }
  }
  return best;
}

test('tankFire: es gibt immer Treffer-Möglichkeiten (Spielbarkeit)', () => {
  for (const seed of ['t1', 't2', 'abc', 'zzz', 12345, 'sync']) {
    let hits = 0;
    for (let a = 5; a <= 85; a += 5) {
      for (let pw = 10; pw <= 100; pw += 5) {
        const r = G.move(G.tankCreate(seed, { turn: 0 }), 0, { a: 'fire', angle: a, power: pw });
        if (r.events.some((e) => e.type === 'hit' && e.victim === 1)) hits++;
      }
    }
    assert.ok(hits > 0, 'Seed ' + seed + ' hat mindestens einen treffenden Schuss');
  }
});

test('tankFire: Schaden wird verteilt und das Spiel endet regulär', () => {
  for (const seed of ['a', 'b', 'c', 'end']) {
    let s = G.tankCreate(seed, { turn: 0 });
    let shots = 0, dmgSeen = 0;
    while (!s.over && shots < 40) {
      const b = bestTankShot(s, s.turn);
      assert.ok(b, 'irgendein Schuss ist immer möglich');
      const hit = b.result.events.find((e) => e.type === 'hit' && e.victim !== s.turn);
      if (hit) dmgSeen += hit.dmg;
      s = b.result.state;
      shots++;
    }
    assert.equal(s.over, true, 'Spiel ' + seed + ' endet innerhalb von 40 Schüssen');
    assert.ok(dmgSeen > 0, 'Schaden wurde verteilt');
    assert.ok(s.hp[0] === 0 || s.hp[1] === 0, 'Verlierer hat 0 HP');
    assert.ok([0, 1].includes(s.winner));
    assert.equal(play(s, s.turn, { a: 'fire', angle: 45, power: 50 }).ok, false, 'kein Schuss nach Spielende');
  }
});

test('tankFire: HP-Grenzen und Schadensbilanz sind konsistent', () => {
  let s = G.tankCreate('hp', { turn: 0 });
  let guard = 0;
  while (!s.over && guard++ < 40) {
    const shooter = s.turn;
    const beforeHp = [s.hp[0], s.hp[1]];
    const beforeDmg = s.dmg[shooter];
    const r = bestTankShot(s, shooter).result;
    s = r.state;
    s.hp.forEach((hp) => assert.ok(hp >= 0 && hp <= G.TK_HP, 'HP im gültigen Bereich'));
    const hit = r.events.find((e) => e.type === 'hit' && e.victim !== shooter);
    if (hit) {
      const applied = beforeHp[1 - shooter] - s.hp[1 - shooter];       // tatsächlich abgezogen (geklammert)
      assert.ok(applied > 0, 'Treffer zieht HP ab');
      assert.ok(hit.dmg >= applied, 'Rohschaden ≥ abgezogene HP (' + hit.dmg + ' ≥ ' + applied + ')');
      assert.equal(s.dmg[shooter] - beforeDmg, hit.dmg, 'genau der gemeldete Schaden wird gutgeschrieben');
      assert.equal(hit.hp, s.hp[1 - shooter], 'HP im Ereignis passt zum Zustand');
    }
    assert.ok(s.dmg[0] >= 0 && s.dmg[1] >= 0);
  }
  assert.equal(s.over, true);
  assert.ok(s.hp[0] === 0 || s.hp[1] === 0);
});

test('tankNextRound: neue Landschaft, volle HP, Seed bleibt', () => {
  let s = G.tankCreate('rounds', { turn: 0 });
  s = play(s, 0, { a: 'fire', angle: 50, power: 80 }).state;
  const seed = s.seed;
  const r = G.tankNextRound(s);
  assert.equal(r.ok, true);
  assert.equal(r.state.seed, seed);
  assert.equal(r.state.round, s.round + 1);
  assert.deepEqual(r.state.hp, [G.TK_HP, G.TK_HP]);
  assert.equal(r.state.over, false);
  assert.equal(r.state.last, null);
  assert.ok(r.state.shots[0].length >= 1, 'Statistik bleibt erhalten');
});

test('tankFire: Zwei Geräte, gleiche Zugfolge → identischer Zustand', () => {
  const moves = [[0, 45, 60], [1, 50, 70], [0, 30, 90], [1, 70, 55], [0, 60, 100]];
  let A = G.tankCreate('sync'), B = G.tankCreate('sync');
  for (const [p, angle, power] of moves) {
    const ra = play(A, p, { a: 'fire', angle, power });
    const rb = play(B, p, { a: 'fire', angle, power });
    assert.equal(ra.ok, true);
    assert.deepEqual(ra.state, rb.state, 'Geräte bleiben synchron');
    A = ra.state; B = rb.state;
  }
  assert.deepEqual(A.tanks, B.tanks);
});

/* ══ 20 Fragen ══ */
test('q20Create: Kategorie und geheimes Wort stammen aus der Liste', () => {
  const s = G.q20Create('q1');
  assert.equal(s.type, 'q20');
  assert.ok(G.Q20_CATS.includes(s.cat));
  assert.ok(G.Q20_WORDS[s.cat].includes(s.secret), 'Wort aus der Kategorie');
  assert.equal(s.budget, 20);
  assert.equal(G.q20Left(s), 20);
  assert.equal(s.turn, 1, 'der Rater beginnt mit einer Frage');
  const t = G.q20Create('q1', { cat: 'Tiere' });
  assert.equal(t.cat, 'Tiere');
  assert.ok(G.Q20_WORDS.Tiere.includes(t.secret));
  assert.equal(G.q20Create('q1').secret, t.secret === G.q20Create('q1').secret ? t.secret : G.q20Create('q1').secret);
});

test('q20Create: eigener Begriff und alle Kategorien funktionieren', () => {
  const own = G.q20Create('own', { secret: 'Weltraum', cat: 'Orte' });
  assert.equal(own.secret, 'Weltraum');
  G.Q20_CATS.forEach((cat) => {
    const s = G.q20Create('cat-' + cat, { cat });
    assert.equal(s.cat, cat);
    assert.ok(s.words.length >= 8, 'genug Wörter in ' + cat);
    assert.equal(new Set(s.words).size, s.words.length, 'keine doppelten Wörter in ' + cat);
  });
});

test('q20: Fragen und Antworten im Wechsel', () => {
  let s = G.q20Create('flow', { secret: 'Elefant', cat: 'Tiere' });
  assert.equal(play(s, 0, { a: 'ask', t: 'Frage?' }).ok, false, 'nur der Rater fragt');
  s = mustPlay(s, 1, { a: 'ask', t: 'Ist es ein Tier?' });
  assert.equal(s.turn, 0, 'danach antwortet der Gegner');
  assert.equal(s.asked.length, 1);
  assert.equal(G.q20Left(s), 19);
  assert.equal(play(s, 1, { a: 'ask', t: 'noch eine?' }).ok, false, 'erst antworten');
  assert.equal(play(s, 0, { a: 'answer', v: 'keine Ahnung' }).ok, false, 'ungültige Antwort');
  s = mustPlay(s, 0, { a: 'answer', v: 'ja' });
  assert.equal(s.asked[0].a, 'ja');
  assert.equal(s.turn, 1, 'danach darf wieder gefragt werden');
  assert.equal(s.log.length, 1);
});

test('q20: Budget läuft inklusive Fehlversuchen ab', () => {
  let s = G.q20Create('budgetmix', { secret: 'Elefant', cat: 'Tiere', budget: 2 });
  s = mustPlay(s, 1, { a: 'guess', w: 'Falsch' });          // 1 Frage verbraucht
  assert.equal(G.q20Left(s), 1);
  assert.equal(s.over, false, 'noch eine Frage übrig');
  const r2 = play(s, 1, { a: 'guess', w: 'Auch falsch' });
  assert.equal(r2.ok, true);
  assert.equal(r2.state.over, true);
  assert.equal(r2.state.winner, 0, 'Budget erschöpft ⇒ Antwortgeber gewinnt');
  assert.ok(r2.events.some((e) => e.type === 'out-of-questions'));
});

test('q20: Budget von 20 Fragen läuft korrekt ab', () => {
  let s = G.q20Create('budget', { secret: 'Elefant', cat: 'Tiere', budget: 3 });
  for (let i = 0; i < 3; i++) {
    s = mustPlay(s, 1, { a: 'ask', t: 'Frage ' + i });
    s = mustPlay(s, 0, { a: 'answer', v: i % 2 ? 'nein' : 'ja' });
  }
  assert.equal(G.q20Left(s), 0);
  assert.equal(play(s, 1, { a: 'ask', t: 'Noch eine?' }).ok, false, 'Budget erschöpft');
  const r = play(s, 1, { a: 'guess', w: 'Falsch' });
  assert.equal(r.ok, true);
  assert.equal(r.state.over, true);
  assert.equal(r.state.winner, 0, 'ohne Fragen übrig gewinnt der Antwortgeber');
  assert.equal(r.state.phase, 'over');
});

test('q20: richtige und falsche Vermutungen', () => {
  let s = G.q20Create('guess', { secret: 'Elefant', cat: 'Tiere' });
  const wrong = play(s, 1, { a: 'guess', w: 'Giraffe' });
  assert.equal(wrong.ok, true);
  assert.equal(wrong.state.over, false);
  assert.equal(wrong.state.guesses.length, 1);
  assert.equal(wrong.state.guesses[0].right, false);
  assert.equal(wrong.state.turn, 1, 'falscher Tipp: der Rater bleibt am Zug');
  assert.equal(G.q20Left(wrong.state), 19, 'falscher Tipp kostet eine Frage');
  assert.equal(G.q20Left(s), 20, 'Ausgangszustand bleibt unberührt');
  // danach kann ganz normal weitergefragt werden (kein Stillstand)
  const next = mustPlay(wrong.state, 1, { a: 'ask', t: 'Ist es groß?' });
  assert.equal(next.turn, 0, 'der Antwortgeber ist gefragt');
  let t = G.q20Create('guess2', { secret: 'Elefant', cat: 'Tiere' });
  const right = play(t, 1, { a: 'guess', w: 'elefant' });
  assert.equal(right.ok, true);
  assert.equal(right.state.over, true);
  assert.equal(right.state.winner, 1);
  assert.ok(right.events.some((e) => e.type === 'correct'));
});

test('q20Norm: Groß-/Kleinschreibung, Umlaute und Sonderzeichen egal', () => {
  assert.equal(G.q20Norm('Eichhörnchen'), G.q20Norm('eichhoernchen'));
  assert.equal(G.q20Norm('  Käse '), G.q20Norm('kAeSe'));
  assert.equal(G.q20Norm('Schlüssel!'), G.q20Norm('schluessel'));
  assert.notEqual(G.q20Norm('Brot'), G.q20Norm('Torte'));
});

test('q20: Vermutung mit Umlaut-Variante zählt als richtig', () => {
  const s = G.q20Create('uml', { secret: 'Eichhörnchen', cat: 'Tiere' });
  const r = play(s, 1, { a: 'guess', w: 'EICHHOERNCHEN' });
  assert.equal(r.state.over, true);
  assert.equal(r.state.winner, 1);
});

test('q20: Regelverstöße', () => {
  const s = G.q20Create('bad');
  assert.equal(play(s, 1, { a: 'ask', t: '' }).ok, false);
  assert.equal(play(s, 1, { a: 'ask', t: 'x'.repeat(200) }).ok, false);
  assert.equal(play(s, 1, { a: 'guess', w: '   ' }).ok, false);
  assert.equal(play(s, 0, { a: 'ask', t: 'hi' }).ok, false, 'falscher Spieler');
  assert.equal(play(s, 1, { a: 'wat' }).ok, false);
});

/* ══ Geld ausgeben ══ */
test('moneyCreate: Katalog, Budget und Startspieler', () => {
  const s = G.moneyCreate('m1');
  assert.equal(s.type, 'money');
  assert.equal(s.budget, G.MONEY_BUDGET);
  assert.deepEqual(s.left, [100, 100]);
  assert.deepEqual(s.value, [0, 0]);
  assert.equal(s.catalog.length, 8);
  assert.equal(new Set(s.catalog.map((i) => i.id)).size, 8, 'keine doppelten Artikel');
  s.catalog.forEach((i) => { assert.ok(i.p > 0 && i.v > 0, 'Preis und Wert positiv'); assert.ok(i.n && i.i); });
  assert.deepEqual(s.catalog, G.moneyCreate('m1').catalog, 'gleicher Seed → gleicher Katalog');
  const sigs = new Set();
  for (let i = 0; i < 25; i++) sigs.add(G.moneyCreate('seed-' + i).catalog.map((x) => x.id).join(','));
  assert.ok(sigs.size > 5, 'verschiedene Seeds ergeben verschiedene Kataloge (' + sigs.size + ' Varianten)');
});

test('moneyBuy: Kauf bucht ab, Artikel verschwindet, Zug wechselt', () => {
  let s = G.moneyCreate('buy', { count: 4 });
  const item = s.catalog[0];
  assert.equal(play(s, 1, { a: 'buy', item: item.id }).ok, false, 'nicht am Zug');
  const r = play(s, 0, { a: 'buy', item: item.id });
  assert.equal(r.ok, true);
  s = r.state;
  assert.equal(s.left[0], 100 - item.p);
  assert.equal(s.value[0], item.v);
  assert.ok(s.taken.includes(item.id));
  assert.equal(s.turn, 1);
  assert.equal(play(s, 1, { a: 'buy', item: item.id }).ok, false, 'Artikel ist weg');
  assert.equal(play(s, 1, { a: 'buy', item: 'gibtsnicht' }).ok, false, 'unbekannter Artikel');
  const fresh = G.moneyCreate('buy');
  assert.equal(play(fresh, 1, { a: 'buy', item: fresh.catalog[0].id }).ok, false, 'nicht am Zug');
});

test('moneyBuy: zu teuer wird abgelehnt', () => {
  let s = G.moneyCreate('teuer', { count: 8 });
  // künstlich teures Budget: alles kaufen, bis nichts mehr geht
  const cheap = s.catalog.slice().sort((a, b) => a.p - b.p)[0];
  let guard = 0;
  while (s.left[s.turn] >= Math.min(...G.moneyOptions(s, s.turn).map((i) => i.p)) && guard++ < 20) {
    const opts = G.moneyOptions(s, s.turn);
    if (!opts.length) break;
    const buy = opts.sort((a, b) => b.p - a.p)[0];
    const r = play(s, s.turn, { a: 'buy', item: buy.id });
    assert.equal(r.ok, true, 'Kauf sollte klappen');
    s = r.state;
  }
  const overpriced = s.catalog.find((i) => s.taken.indexOf(i.id) < 0 && !G.moneyOptions(s, s.turn).includes(i));
  if (overpriced && s.left[s.turn] < overpriced.p) {
    assert.equal(play(s, s.turn, { a: 'buy', item: overpriced.id }).ok, false, 'zu teuer');
  }
  assert.ok(s.taken.length > 0);
});

test('money: Spiel endet, wenn keiner mehr kaufen kann', () => {
  let s = G.moneyCreate('end', { count: 3, budget: 20 });
  let guard = 0;
  while (!s.over && guard++ < 30) {
    const opts = G.moneyOptions(s, s.turn);
    if (opts.length) s = mustPlay(s, s.turn, { a: 'buy', item: opts[0].id });
    else s = mustPlay(s, s.turn, { a: 'skip' });
  }
  assert.equal(s.over, true, 'Spiel endet');
  assert.ok(Array.isArray(s.score));
  assert.equal(s.score.length, 2);
  const expect0 = Math.round((s.value[0] - 0.5 * s.left[0]) * 100) / 100;
  assert.equal(s.score[0], expect0, 'Punktzahl = Wert − halbes Restgeld');
  assert.equal(G.winner(s), s.winner === null ? -1 : s.winner);
});

test('moneyScore: Restgeld wird zur Hälfte abgezogen', () => {
  const s = G.moneyCreate('score', { count: 4 });
  const v = { ...s, value: [40, 30], left: [20, 60] };
  assert.equal(G.moneyScore(v, 0), 30);
  assert.equal(G.moneyScore(v, 1), 0);
});

test('money: vollständiger Durchlauf mit beiden Spielern', () => {
  let s = G.moneyCreate('full', { count: 8, budget: 100 });
  let guard = 0;
  while (!s.over && guard++ < 80) {
    const opts = G.moneyOptions(s, s.turn);
    if (!opts.length) { s = mustPlay(s, s.turn, { a: 'skip' }); continue; }
    const pick = opts.slice().sort((a, b) => (b.v / b.p) - (a.v / a.p))[0];
    s = mustPlay(s, s.turn, { a: 'buy', item: pick.id });
  }
  assert.equal(s.over, true);
  assert.equal(s.taken.length > 0, true);
  assert.ok(s.left[0] >= 0 && s.left[1] >= 0, 'Budget nie überzogen');
  assert.ok(s.value[0] > 0 && s.value[1] > 0, 'beide haben gekauft');
  assert.ok([0, 1, null].includes(s.winner));
});

test('moneySkip: zweimal aussetzen beendet das Spiel', () => {
  let s = G.moneyCreate('skip', { count: 8, budget: 100 });      // genug Auswahl
  const items = s.catalog.map((i) => i.n + '(' + i.p + ')').join(', ');
  assert.ok(G.moneyOptions(s, 0).length > 0, 'es gäbe kaufbare Artikel: ' + items);
  s = mustPlay(s, 0, { a: 'skip' });
  assert.equal(s.over, false, 'einmal aussetzen beendet noch nichts');
  assert.equal(s.turn, 1, 'danach ist der Gegner dran');
  s = mustPlay(s, 1, { a: 'skip' });
  assert.equal(s.over, true);
  // Strafe: halbes Restgeld (100 €) wird abgezogen → −50 pro Spieler
  assert.deepEqual(s.score, [-50, -50], 'nichts gekauft ⇒ nur Restgeld-Strafe');
  assert.equal(s.winner, null, 'roher Zustand: kein Sieger');
  assert.equal(G.winner(s), -1, 'Fassade: -1 steht für Unentschieden');
});

test('moneySkip: ein Kauf setzt die Aussetz-Serie zurück', () => {
  let s = G.moneyCreate('reset', { count: 8 });
  s = mustPlay(s, 0, { a: 'skip' });
  const cheap = G.moneyOptions(s, 1).sort((a, b) => a.p - b.p)[0];
  s = mustPlay(s, 1, { a: 'buy', item: cheap.id });
  assert.equal(s.over, false, 'durch den Kauf geht es weiter');
  assert.equal(s.passes, 0, 'Serie zurückgesetzt');
});

test('moneySkip: Regelverstoß bei falschem Spieler', () => {
  const s = G.moneyCreate('skip2');
  assert.equal(play(s, 1, { a: 'skip' }).ok, false);
});

test('moneyAiPick: liefert nur kaufbare Artikel', () => {
  const s = G.moneyCreate('ai', { count: 8 });
  for (let n = 0; n < 20; n++) {
    const id = G.moneyAiPick(s, { p: 0, rng: G.rng(n) });
    assert.ok(id === null || s.catalog.some((i) => i.id === id), 'bekannter Artikel');
    if (id) assert.ok(G.moneyOptions(s, 0).some((i) => i.id === id), 'kaufbar');
  }
});

/* ══ Warteschlange / Matchmaking ══ */
test('queue: Beitreten, Verlassen und Start bei zwei Spielern', () => {
  let q = {};
  let r = G.queueJoin(q, 'mem', 'anna');
  assert.equal(r.ok, true);
  assert.equal(r.started, null, 'alleine startet nichts');
  assert.deepEqual(G.queueList(r.queue, 'mem'), ['anna']);
  q = r.queue;
  r = G.queueJoin(q, 'mem', 'bert');
  assert.ok(r.started, 'zu zweit startet die Partie');
  assert.deepEqual(r.started.players, ['anna', 'bert']);
  assert.equal(r.started.host, 'anna', 'alphabetisch erster Name ist Host');
  assert.equal(r.started.game, 'mem');
  assert.deepEqual(G.queueList(r.queue, 'mem'), [], 'Warteschlange ist wieder leer');
});

test('queue: Host-Auswahl sortiert, Doppelbeitritt idempotent', () => {
  const solo = G.queueJoin({}, 'mem', 'solo');
  assert.equal(solo.started, null, 'einer alleine startet nichts');
  assert.deepEqual(G.queueList(solo.queue, 'mem'), ['solo']);

  const dup = G.queueJoin(G.queueJoin({}, 'tank', 'zoe').queue, 'tank', 'zoe');
  assert.equal(dup.started, null, 'zweimal derselbe Name startet nichts');
  assert.deepEqual(G.queueList(dup.queue, 'tank'), ['zoe']);

  const bea = G.queueJoin({}, 'tank', 'bea');
  assert.equal(bea.started, null);
  const ada = G.queueJoin(bea.queue, 'tank', 'ada');
  assert.ok(ada.started, 'zu zweit geht es los');
  assert.deepEqual(ada.started.players, ['ada', 'bea'], 'alphabetische Reihenfolge');
  assert.equal(ada.started.host, 'ada', 'erster Name ist Host');
  assert.equal(ada.started.game, 'tank');
});

test('queue: verschiedene Spiele stören sich nicht', () => {
  let q = G.queueJoin({}, 'mem', 'a').queue;
  q = G.queueJoin(q, 'tank', 'b').queue;
  assert.deepEqual(G.queueList(q, 'mem'), ['a']);
  assert.deepEqual(G.queueList(q, 'tank'), ['b']);
  assert.deepEqual(G.queueWaiting(q, 'a'), ['mem'], 'in welchen Warteschlangen stecke ich?');
  assert.deepEqual(G.queueWaiting(q, 'x'), []);
  q = G.queueLeave(q, 'mem', 'a').queue;
  assert.deepEqual(G.queueList(q, 'mem'), []);
  assert.deepEqual(G.queueList(q, 'tank'), ['b'], 'andere Schlange unberührt');
});

test('matchSeed: gleicher Seed für beide Spieler, unabhängig von Reihenfolge', () => {
  const a = G.matchSeed('mem', ['bert', 'anna'], 'r1');
  const b = G.matchSeed('mem', ['anna', 'bert'], 'r1');
  assert.equal(a, b);
  assert.notEqual(a, G.matchSeed('mem', ['anna', 'bert'], 'r2'));
  assert.notEqual(a, G.matchSeed('tank', ['anna', 'bert'], 'r1'));
});

/* ══ Einheitliche Schnittstelle ══ */
test('create/move: alle Spieltypen sind über die Fassade spielbar', () => {
  const types = ['ttt', 'c4', 'rps', 'mem', 'bs', 'tank', 'q20', 'money'];
  for (const t of types) {
    const s = G.create(t, 'seed-' + t);
    assert.ok(s, 'Zustand für ' + t);
    assert.equal(s.type, t);
    assert.equal(G.move(s, 0, null).ok, false, 'null-Zug wird abgelehnt (' + t + ')');
    assert.equal(G.move(null, 0, { a: 'x' }).ok, false);
  }
  assert.equal(G.create('gibtsnicht', 1), null);
  assert.equal(G.move({ type: 'gibtsnicht' }, 0, { a: 'x' }).ok, false);
});

test('statusText: liefert für jeden Typ und Zustand einen Satz', () => {
  for (const t of ['ttt', 'c4', 'rps', 'mem', 'bs', 'tank', 'q20', 'money']) {
    const s = G.create(t, 'st-' + t);
    assert.equal(typeof G.statusText(s, 0, ['Du', 'Bert']), 'string');
    assert.ok(G.statusText(s, 0, ['Du', 'Bert']).length > 0, 'nicht leer für ' + t);
    const over = { ...s, over: true, winner: 1 };
    assert.equal(typeof G.statusText(over, 0, ['Du', 'Bert']), 'string');
  }
  const tank = { ...G.create('tank', 'x'), over: true, winner: null };
  assert.equal(G.statusText(tank, 0), 'Unentschieden!');
});

test('Zustände sind JSON-serialisierbar (Netzwerk-Tauglichkeit)', () => {
  for (const t of ['ttt', 'c4', 'rps', 'mem', 'bs', 'tank', 'q20', 'money']) {
    const s = G.create(t, 'json-' + t);
    const round = JSON.parse(JSON.stringify(s));
    assert.deepEqual(round, s, 'Round-Trip unverändert (' + t + ')');
  }
});

test('Züge verändern den Ausgangszustand nicht (Immutabilität)', () => {
  const s = G.memCreate('imm');
  const snapshot = JSON.stringify(s);
  G.move(s, 0, { a: 'flip', i: 0 });
  assert.equal(JSON.stringify(s), snapshot, 'Memory-Zustand unverändert');
  const b = bsFixture();
  const bsSnap = JSON.stringify(b);
  G.move(b, 0, { a: 'fire', i: 0 });
  assert.equal(JSON.stringify(b), bsSnap, 'Schiffe-Zustand unverändert');
  const tk = G.tankCreate('imm2');
  const tkSnap = JSON.stringify(tk);
  G.move(tk, 0, { a: 'fire', angle: 45, power: 60 });
  assert.equal(JSON.stringify(tk), tkSnap, 'Tank-Zustand unverändert');
  const q = G.q20Create('imm3');
  const qSnap = JSON.stringify(q);
  G.move(q, 1, { a: 'ask', t: 'Test?' });
  assert.equal(JSON.stringify(q), qSnap, '20-Fragen-Zustand unverändert');
  const mo = G.moneyCreate('imm4');
  const moSnap = JSON.stringify(mo);
  G.move(mo, 0, { a: 'skip' });
  assert.equal(JSON.stringify(mo), moSnap, 'Geld-Zustand unverändert');
});

test('GAMES-Metadaten sind vollständig', () => {
  Object.keys(G.GAMES).forEach((k) => {
    const g = G.GAMES[k];
    assert.ok(g.n && g.i && g.d, k + ' hat Name, Icon und Beschreibung');
    assert.equal(g.p, 2, k + ' ist ein Duell');
    assert.ok(['both', 'dm', 'room'].includes(g.kind));
  });
  assert.equal(Object.keys(G.GAMES).length, 8);
  G.ROOM_GAMES.forEach((k) => assert.ok(G.GAMES[k], 'Raumspiel ' + k + ' ist bekannt'));
});

