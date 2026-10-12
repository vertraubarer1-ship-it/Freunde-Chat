/* ══════════════════════════════════════════════════════════════════════════
   Nexus Spiele-Logik (rein, deterministisch, ohne DOM)
   ──────────────────────────────────────────────────────────────────────────
   Diese Datei enthält die komplette Spiellogik als *reine Funktionen*:
   kein DOM, kein Netzwerk, keine Zeit. Jede Aktion ist
     aktion(zustand, spieler, ...) -> { ok, state, events }
   Damit gilt:
     • Tests laufen in Node ohne Browser (siehe tests/games.test.mjs)
     • Beide Geräte berechnen aus (seed + Zügen) exakt denselben Zustand,
       deshalb müssen nur Züge übertragen werden – kein Zustands-Sync.
   ══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else if (typeof define === 'function' && define.amd) define([], factory);
  else root.NexusGames = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VERSION = '1.0.0';

  /* ══ Spiel-Metadaten (von der UI genutzt) ══ */
  const GAMES = {
    ttt:  { n: 'Tic Tac Toe',          i: '⭕', p: 2, kind: 'both', d: 'Drei in einer Reihe' },
    c4:   { n: 'Vier Gewinnt',         i: '🔴', p: 2, kind: 'both', d: 'Vier in einer Reihe' },
    rps:  { n: 'Schere Stein Papier',  i: '✌️', p: 2, kind: 'both', d: 'Mit Punktestand' },
    mem:  { n: 'Memory',               i: '🃏', p: 2, kind: 'both', d: 'Paare finden, wer mehr hat gewinnt' },
    bs:   { n: 'Schiffe versenken',    i: '🚢', p: 2, kind: 'both', d: 'Flotte platzieren, Felder treffen' },
    tank: { n: 'Tank Wars',            i: '💥', p: 2, kind: 'both', d: 'Winkel & Power, zerstörbare Landschaft' },
    q20:  { n: '20 Fragen',            i: '❓', p: 2, kind: 'both', d: 'Erraten mit 20 Ja/Nein-Fragen' },
    money:{ n: 'Geld ausgeben',        i: '💸', p: 2, kind: 'both', d: 'Budget clever in Wert verwandeln' },
  };
  const ROOM_GAMES = ['mem', 'bs', 'tank', 'q20', 'money', 'ttt', 'c4', 'rps'];

  /* ══ Zufall: deterministisch aus einem Seed ══════════════════════════════
     mulberry32 – gleicher Seed ⇒ gleiche Folge, auf jedem Gerät.           */
  function mulberry32(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function seedFrom(str) {              // beliebige Zeichenkette → 32-Bit-Seed
    let h = 2166136261 >>> 0;
    str = String(str == null ? '' : str);
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  const rng = (seed) => mulberry32(typeof seed === 'number' ? seed : seedFrom(seed));
  /** Beliebiger Seed (Zahl, Wort, Name) → stabile 32-Bit-Zahl. */
  const toSeed = (seed) => (typeof seed === 'number' && Number.isFinite(seed))
    ? (Math.abs(Math.trunc(seed)) >>> 0) : (seedFrom(String(seed == null ? '' : seed)) >>> 0);
  function shuffle(arr, rand) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const ok = (state, events) => ({ ok: true, state, events: events || [] });
  const fail = (reason) => ({ ok: false, state: null, events: [], error: reason });
  const other = (p) => (p === 0 ? 1 : 0);

  /* ══ Tic Tac Toe / Vier Gewinnt / RPS (bestehende Spiele, hier testbar) ══ */
  function winTTT(b) {
    const L = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    for (let i = 0; i < L.length; i++) {
      const l = L[i];
      if (b[l[0]] !== 0 && b[l[0]] === b[l[1]] && b[l[1]] === b[l[2]]) return { p: b[l[0]], line: l };
    }
    return null;
  }
  function winC4(b) {
    const D = [[0,1],[1,0],[1,1],[1,-1]];
    for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++) {
      const p = b[r * 7 + c]; if (!p) continue;
      for (let k = 0; k < 4; k++) {
        const dr = D[k][0], dc = D[k][1], l = [r * 7 + c]; let good = true;
        for (let s = 1; s < 4; s++) {
          const nr = r + dr * s, nc = c + dc * s;
          if (nr < 0 || nr > 5 || nc < 0 || nc > 6 || b[nr * 7 + nc] !== p) { good = false; break; }
          l.push(nr * 7 + nc);
        }
        if (good) return { p, line: l };
      }
    }
    return null;
  }
  function rpsResult(a, b) { if (a === b) return 0; return (a === 1 && b === 3) || (a === 2 && b === 1) || (a === 3 && b === 2) ? 1 : -1; }
  /** KI für Tic Tac Toe: gewinnt, blockt, nimmt Mitte, sonst zufällig. */
  function aiPickTTT(board, opts) {
    const o = opts || {}, me = o.me || 2, foe = me === 2 ? 1 : 2;
    const rand = o.rng || Math.random;
    const free = []; for (let i = 0; i < 9; i++) if (board[i] === 0) free.push(i);
    if (!free.length) return -1;
    for (const i of free) { const b = board.slice(); b[i] = me; if (winTTT(b)) return i; }
    for (const i of free) { const b = board.slice(); b[i] = foe; if (winTTT(b)) return i; }
    if (free.indexOf(4) >= 0) return 4;
    return free[Math.floor(rand() * free.length) % free.length];
  }

  /* ══════════════════════════════════════════════════════════════════════
     MEMORY
     ══════════════════════════════════════════════════════════════════════ */
  const MEM_EMOJI = ['🐶','🐱','🦊','🐼','🐸','🐵','🦁','🐧','🐙','🦄','🍕','🍩','🚀','⚡','⭐','🌸','🎈','🎧'];
  const MEM_PAIRS = 8;                             // 8 Paare = 16 Karten

  function memCreate(seed, opts) {
    const o = opts || {}, pairs = o.pairs || MEM_PAIRS;
    const rand = rng(seed);
    const pool = shuffle(MEM_EMOJI, rand).slice(0, pairs);
    const deck = [];
    pool.forEach((e, i) => { deck.push({ k: i, e }); deck.push({ k: i, e }); });
    const cards = shuffle(deck, rand).map((c) => ({ k: c.k, e: c.e }));
    return { type: 'mem', seed, pairs, cards, open: [], done: [], score: [0, 0], turn: 0, over: false, log: [] };
  }
  function memCardAt(state, i) { return state.cards[i]; }
  function memIsDone(state, i) { return state.done.indexOf(i) >= 0; }
  function memFlip(state, player, idx) {
    if (state.over) return fail('over');
    if (state.turn !== player) return fail('not-your-turn');
    if (!Number.isInteger(idx) || idx < 0 || idx >= state.cards.length) return fail('bad-index');
    if (memIsDone(state, idx)) return fail('already-matched');
    if (state.open.indexOf(idx) >= 0) return fail('already-open');
    const s = clone(state);
    s.open.push(idx);
    const ev = [{ type: 'flip', i: idx, e: s.cards[idx].e, player }];
    if (s.open.length < 2) { s.pending = 'second'; return ok(s, ev); }
    const [a, b] = s.open;
    if (s.cards[a].k === s.cards[b].k) {
      s.done.push(a, b); s.open = []; s.pending = null; s.score[player] += 1;
      ev.push({ type: 'match', i: a, j: b, player, score: [s.score[0], s.score[1]] });
      if (s.done.length === s.cards.length) {
        s.over = true;
        s.winner = s.score[0] === s.score[1] ? null : (s.score[0] > s.score[1] ? 0 : 1);
        ev.push({ type: 'over', winner: s.winner, score: [s.score[0], s.score[1]] });
      }
      s.log.push({ p: player, t: 'match', i: a, j: b });
      return ok(s, ev);
    }
    s.flash = [a, b]; s.pending = 'hide';
    s.log.push({ p: player, t: 'miss', i: a, j: b });
    ev.push({ type: 'mismatch', i: a, j: b });
    return ok(s, ev);
  }
  /** Nach einem Fehlversuch: Karten wieder umdrehen, Gegner ist dran. */
  function memResolve(state) {
    if (state.pending !== 'hide') return fail('nothing-to-resolve');
    const s = clone(state);
    s.flash = []; s.open = []; s.pending = null; s.turn = other(s.turn);
    return ok(s, [{ type: 'turn', player: s.turn }]);
  }
  /** KI: merkt sich aufgedeckte Karten – braucht dafür nur den Zustand. */
  function memAiMove(state, opts) {
    const o = opts || {}, rand = o.rng || Math.random;
    const free = []; for (let i = 0; i < state.cards.length; i++) if (!memIsDone(state, i) && state.open.indexOf(i) < 0) free.push(i);
    if (!free.length) return -1;
    if (state.open.length === 1) {
      const first = state.open[0];
      const twin = free.find((i) => state.cards[i].k === state.cards[first].k);
      if (twin !== undefined) return twin;
    }
    const seen = {};
    for (const idx of Object.keys(o.memory || {})) {
      const k = o.memory[idx];
      for (const j of free) if (j !== +idx && state.cards[j].k === k) return +idx;
    }
    return free[Math.floor(rand() * free.length) % free.length];
  }

  /* ══════════════════════════════════════════════════════════════════════
     SCHIFFE VERSENKEN
     ══════════════════════════════════════════════════════════════════════ */
  const BS_SIZE = 8;
  const BS_FLEET = [                                  // Reihenfolge der Platzierung
    { id: 'S', len: 4, name: 'Schlachtschiff' },
    { id: 'K', len: 3, name: 'Kreuzer' },
    { id: 'K2', len: 3, name: 'Kreuzer' },
    { id: 'Z', len: 2, name: 'Zerstörer' },
    { id: 'Z2', len: 2, name: 'Zerstörer' },
  ];
  const BS_CELLS = BS_FLEET.reduce((a, s) => a + s.len, 0);   // 14

  function bsCreate(seed, opts) {
    const size = (opts && opts.size) || BS_SIZE;
    return {
      type: 'bs', seed, size, phase: 'place', ready: [false, false],
      ships: [[], []], shots: [[], []], grid: [bsEmpty(size), bsEmpty(size)],
      turn: 0, over: false, winner: null, log: [],
    };
  }
  function bsEmpty(size) { return new Array(size * size).fill(-1); }   // -1 = unberührt
  const bsIdx = (size, r, c) => r * size + c;
  function bsInB(s, r, c) { return r >= 0 && c >= 0 && r < s.size && c < s.size; }
  function bsCellsOf(s, ship) {
    const out = [];
    for (let i = 0; i < ship.len; i++) out.push(ship.horiz ? bsIdx(s.size, ship.r, ship.c + i) : bsIdx(s.size, ship.r + i, ship.c));
    return out;
  }
  function bsShipCells(s, p, shipId) {
    const ship = s.ships[p].find((x) => x.id === shipId);
    return ship ? bsCellsOf(s, ship) : [];
  }
  function bsCanPlace(s, p, r, c, len, horiz) {
    const cells = [];
    for (let i = 0; i < len; i++) {
      const rr = horiz ? r : r + i, cc = horiz ? c + i : c;
      if (!bsInB(s, rr, cc)) return null;
      cells.push(bsIdx(s.size, rr, cc));
    }
    for (const ship of s.ships[p]) for (const cell of bsCellsOf(s, ship)) if (cells.indexOf(cell) >= 0) return null;
    return cells;
  }
  function bsPlaceShip(state, p, shipId, r, c, horiz) {
    if (state.phase !== 'place') return fail('phase');
    if (state.ready[p]) return fail('already-ready');
    const def = BS_FLEET.find((x) => x.id === shipId);
    if (!def) return fail('unknown-ship');
    if (state.ships[p].some((x) => x.id === shipId)) return fail('ship-placed');
    const cells = bsCanPlace(state, p, r, c, def.len, !!horiz);
    if (!cells) return fail('collision');
    const s = clone(state);
    s.ships[p].push({ id: def.id, len: def.len, r, c, horiz: !!horiz, hits: [] });
    cells.forEach((cell) => { s.grid[p][cell] = def.id; });
    return ok(s, [{ type: 'placed', p, shipId, cells }]);
  }
  function bsRemoveShip(state, p, shipId) {
    if (state.phase !== 'place' || state.ready[p]) return fail('phase');
    const s = clone(state);
    const sh = s.ships[p].find((x) => x.id === shipId);
    if (!sh) return fail('unknown-ship');
    bsCellsOf(s, sh).forEach((c) => { s.grid[p][c] = -1; });
    s.ships[p] = s.ships[p].filter((x) => x.id !== shipId);
    return ok(s, [{ type: 'removed', p, shipId }]);
  }
  function bsClearShips(state, p) {
    if (state.phase !== 'place' || state.ready[p]) return fail('phase');
    const s = clone(state); s.ships[p] = []; s.grid[p] = bsEmpty(s.size);
    return ok(s, [{ type: 'cleared', p }]);
  }
  function bsAutoPlace(state, p, seed) {
    if (state.phase !== 'place' || state.ready[p]) return fail('phase');
    const rand = rng((toSeed(seed) ^ ((p + 1) * 0x9E3779B1)) >>> 0);
    let s = bsClearShips(state, p).state;
    for (const def of BS_FLEET) {
      let placed = false;
      for (let tries = 0; tries < 500 && !placed; tries++) {
        const horiz = rand() < 0.5;
        const r = Math.floor(rand() * s.size), c = Math.floor(rand() * s.size);
        const res = bsPlaceShip(s, p, def.id, r, c, horiz);
        if (res.ok) { s = res.state; placed = true; }
      }
      if (!placed) return fail('auto-place-failed');
    }
    return ok(s, [{ type: 'auto', p }]);
  }
  function bsRandomFleet(seed) {                       // nur Zellen, für Vorschau/Tests
    const st = bsAutoPlace(bsCreate(BS_SIZE), 0, seed >>> 0);
    if (!st.ok) return null;
    return st.state.ships[0].map((sh) => ({ id: sh.id, r: sh.r, c: sh.c, horiz: sh.horiz }));
  }
  /** Aufstellung des Gegners übernehmen (wird verschlüsselt übertragen). */
  function bsSetFleet(state, p, ships) {
    if (state.phase !== 'place') return fail('phase');
    if (state.ready[p]) return fail('already-ready');
    if (!Array.isArray(ships) || ships.length !== BS_FLEET.length) return fail('fleet-incomplete');
    let s = clone(state);
    s.ships[p] = []; s.grid[p] = bsEmpty(s.size);
    for (const raw of ships) {
      if (!raw || BS_FLEET.findIndex((x) => x.id === raw.id) < 0) return fail('unknown-ship');
      const res = bsPlaceShip(s, p, raw.id, raw.r, raw.c, !!raw.horiz);
      if (!res.ok) return fail('bad-fleet');
      s = res.state;
    }
    return ok(s, [{ type: 'fleet', p }]);
  }
  function bsReady(state, p) {
    if (state.phase !== 'place') return fail('phase');
    if (state.ships[p].length !== BS_FLEET.length) return fail('fleet-incomplete');
    const s = clone(state); s.ready[p] = true;
    const ev = [{ type: 'ready', p }];
    if (s.ready[0] && s.ready[1]) { s.phase = 'fire'; s.turn = 0; ev.push({ type: 'start' }); }
    return ok(s, ev);
  }
  function bsShipOf(s, p, cell) { const id = s.grid[p][cell]; return id === -1 ? null : s.ships[p].find((x) => x.id === id); }
  function bsAllSunk(s, p) { return s.ships[p].length > 0 && s.ships[p].every((sh) => bsCellsOf(s, sh).every((c) => s.shots[other(p)].indexOf(c) >= 0)); }
  function bsFleetRemaining(s, p) { return s.ships[p].filter((sh) => !bsAllSunkOne(s, p, sh)).length; }
  function bsAllSunkOne(s, p, ship) { return bsCellsOf(s, ship).every((c) => s.shots[other(p)].indexOf(c) >= 0); }
  function bsFire(state, p, cell) {
    if (state.phase !== 'fire') return fail('phase');
    if (state.over) return fail('over');
    if (state.turn !== p) return fail('not-your-turn');
    const foe = other(p);
    if (!Number.isInteger(cell) || cell < 0 || cell >= state.size * state.size) return fail('bad-index');
    if (state.shots[p].indexOf(cell) >= 0) return fail('already-shot');
    const s = clone(state);
    s.shots[p].push(cell);
    const ship = bsShipOf(s, foe, cell);
    const ev = [{ type: 'shot', p, cell, r: Math.floor(cell / s.size), c: cell % s.size }];
    if (ship) {
      ship.hits = (ship.hits || []).concat([cell]);
      const sunk = bsAllSunkOne(s, foe, ship);
      ev.push({ type: 'hit', p, cell, ship: ship.id });
      ev.push(sunk ? { type: 'sunk', p, ship: ship.id, len: ship.len } : { type: 'damage', p, ship: ship.id });
      if (bsAllSunk(s, foe)) {
        s.over = true; s.phase = 'over'; s.winner = p;
        ev.push({ type: 'over', winner: p, loser: foe });
      }
      s.log.push({ p, cell, hit: true });
      // Treffer ⇒ gleich nochmal (klassische Regel, dokumentiert im README)
    } else {
      ev.push({ type: 'miss', p, cell });
      s.turn = foe;
      s.log.push({ p, cell, hit: false });
    }
    return ok(s, ev);
  }
  function bsStats(state, p) {
    const shots = state.shots[p].length;
    let hits = 0;
    state.shots[p].forEach((c) => { if (bsShipOf(state, other(p), c)) hits++; });
    return { shots, hits, misses: shots - hits, accuracy: shots ? Math.round(hits / shots * 100) : 0, remaining: bsFleetRemaining(state, p) };
  }

  /* ══════════════════════════════════════════════════════════════════════
     TANK WARS – rundenbasiertes Artillerie-Duell
     Rechnung ausschließlich mit Ganzzahlen (Fixed-Point 1/64 Zelle), damit
     beide Geräte zwingend dieselbe Flugbahn erhalten.

     Kalibrierung (Zelle = 1, FP = 64):
       • Geschwindigkeit  v = cos/sin(Winkel) · Power / 2074   [FP/Step]
         45°/100 → v ≈ 35 FP/Step  →  Reichweite v²/g ≈ 19 Zellen
         5°/100  → v ≈ 49 FP/Step  →  weite, flache Schüsse
         85°/100 → v ≈  7 FP/Step  →  fast senkrechter Kurzschuss
       • Schwerkraft g = 1 FP/Step²
       • Flugdauer ≈ 2·vy/g ≈ 50–70 Steps  →  feine Bahnauflösung
     ══════════════════════════════════════════════════════════════════════ */
  const TK_W = 19, TK_H = 13, TK_FP = 64;             // Spielfeld + Fixpunkt
  const TK_GRAV = 1, TK_VEL_DIV = 2074, TK_STEP_LIMIT = 600;
  const TK_HP = 100, TK_BLAST = 2.2, TK_WIND_MAX = 6;
  const COS = [], SIN = [];                            // Winkel 0..90° → 1/1024
  for (let a = 0; a <= 90; a++) {
    const rad = a * Math.PI / 180;
    COS[a] = Math.round(Math.cos(rad) * 1024);
    SIN[a] = Math.round(Math.sin(rad) * 1024);
  }
  function tkTerrain(seed) {
    const rand = rng(toSeed(seed));
    const h = new Array(TK_W);
    let base = TK_H - 4;
    for (let x = 0; x < TK_W; x++) {
      base += Math.round((rand() - 0.5) * 2.2);
      if (base < TK_H - 8) base = TK_H - 8;
      if (base > TK_H - 2) base = TK_H - 2;
      h[x] = base;
    }
    return h;
  }
  function tkBuildGrid(h) {                            // true = solide
    const g = [];
    for (let y = 0; y < TK_H; y++) {
      const row = [];
      for (let x = 0; x < TK_W; x++) row.push(y >= h[x] || y === TK_H - 1);   // Grundgestein
      g.push(row);
    }
    return g;
  }
  function tkNewRound(seed, round) {
    const s = (toSeed(seed) + round * 7919) >>> 0;
    const rand = rng(s);
    const h = tkTerrain(s);
    return {
      h, grid: tkBuildGrid(h),
      wind: Math.round((rand() - 0.5) * 2 * TK_WIND_MAX),        // −6 … +6 FP/Step
      tanks: [
        { x: 2, y: Math.max(0, h[2] - 1), hp: TK_HP },
        { x: TK_W - 3, y: Math.max(0, h[TK_W - 3] - 1), hp: TK_HP },
      ],
      round,
    };
  }
  function tankCreate(seed, opts) {
    const o = opts || {};
    const round = tkNewRound(seed, 0);
    return Object.assign({
      type: 'tank', seed, size: [TK_W, TK_H], turn: 0, over: false, winner: null,
      shots: [[], []], dmg: [0, 0], hp: [TK_HP, TK_HP], last: null, log: [],
    }, round, { turn: o.turn || 0 });
  }
  function tkFall(state, p) {                          // Panzer fällt in Krater
    const t = state.tanks[p];
    let y = t.y;
    while (y + 1 < TK_H && !state.grid[y + 1][t.x]) y++;
    t.y = y;
  }
  function tkHeight(state, x) {                        // oberste solide Zelle (sonst TK_H)
    for (let y = 0; y < TK_H; y++) if (state.grid[y][x]) return y;
    return TK_H;
  }
  /** Bahn für die Vorschau (identische Rechnung wie beim echten Schuss). */
  function tankTrajectory(state, p, angle, power, maxPoints) {
    const r = tankFire(tankNextTurnForPreview(state, p), p, { angle, power });
    if (!r.ok) return null;
    const ev = r.events.find((e) => e.type === 'impact');
    if (!ev) return null;
    return ev.path.slice(0, maxPoints || 400);
  }
  function tankNextTurnForPreview(state, p) {          // Kopie, die immer "am Zug" ist
    if (state.turn === p && !state.over) return state;
    const s = clone(state); s.turn = p; s.over = false;
    return s;
  }
  /**
   * Schuss abfeuern. angle 5..85 (Grad), power 10..100.
   * Rückgabe-Events: fire {path}, impact {x,y,hit,dmg}, hit {victim,dmg,hp}, turn, over.
   */
  function tankFire(state, p, shot) {
    if (state.over) return fail('over');
    if (state.turn !== p) return fail('not-your-turn');
    const angle = Math.round(shot && shot.angle), power = Math.round(shot && shot.power);
    if (!Number.isFinite(angle) || angle < 5 || angle > 85) return fail('bad-angle');
    if (!Number.isFinite(power) || power < 10 || power > 100) return fail('bad-power');
    const s = clone(state);
    const dir = p === 0 ? 1 : -1;
    const t = s.tanks[p];
    let x = (t.x * TK_FP) + dir * (TK_FP / 2), y = t.y * TK_FP;   // Mündung
    let vx = dir * Math.trunc((COS[angle] * power) / TK_VEL_DIV) + s.wind;
    let vy = -Math.trunc((SIN[angle] * power) / TK_VEL_DIV);
    const ev = [{ type: 'fire', p, angle, power }];
    const path = [];
    let impact = false, steps = 0, ix = 0, iy = 0;
    while (!impact && steps < TK_STEP_LIMIT) {
      steps++;
      vy += TK_GRAV;
      x += vx; y += vy;
      const cx = Math.floor(x / TK_FP), cy = Math.floor(y / TK_FP);
      if (steps % 2 === 1 || steps < 40) path.push([cx, cy]);
      if (cx < 0 || cx >= TK_W || cy >= TK_H) { impact = true; ix = Math.max(0, Math.min(TK_W - 1, cx)); iy = cy; break; }
      if (cy < 0) continue;                            // über das Feld hinaus ist ok
      if (s.grid[cy][cx]) { impact = true; ix = cx; iy = cy; break; }
    }
    if (!impact) { impact = true; ix = Math.max(0, Math.min(TK_W - 1, Math.floor(x / TK_FP))); iy = Math.floor(y / TK_FP); }
    if (iy >= TK_H) iy = TK_H - 1;
    const R = TK_BLAST, R2 = R * R;
    for (let gy = Math.max(0, iy - 3); gy < TK_H; gy++) {          // Krater graben
      if (gy === TK_H - 1) continue;                                // Grundgestein bleibt
      for (let gx = Math.max(0, ix - 3); gx <= Math.min(TK_W - 1, ix + 3); gx++) {
        const dx = gx - ix, dy = gy - iy;
        if (dx * dx + dy * dy <= R2 + 0.35) s.grid[gy][gx] = false;
      }
    }
    for (let x2 = 0; x2 < TK_W; x2++) s.h[x2] = tkHeight(s, x2);   // Höhenkarte nachziehen
    for (const q of [0, 1]) tkFall(s, q);
    let dmgTo = -1;
    for (const q of [0, 1]) {
      const o = s.tanks[q];
      const dist = Math.sqrt((o.x - ix) * (o.x - ix) + (o.y - iy) * (o.y - iy));
      if (dist <= R + 0.6) {
        const dmg = Math.max(6, Math.round(70 * (1 - dist / (R + 0.6))));
        s.hp[q] = Math.max(0, s.hp[q] - dmg);
        if (q !== p) { s.dmg[p] += dmg; dmgTo = dmg; }
        ev.push({ type: 'hit', victim: q, dmg, hp: s.hp[q] });
      }
    }
    ev.push({ type: 'impact', x: ix, y: iy, path, hit: dmgTo > 0, dmg: Math.max(0, dmgTo), steps });
    ev[0].path = path;
    s.last = { p, angle, power, x: ix, y: iy, path };
    s.shots[p].push({ angle, power, x: ix, y: iy });
    s.log.push({ p, angle, power, x: ix, y: iy });
    if (s.hp[1] <= 0 || s.hp[0] <= 0) {
      s.over = true;
      s.winner = (s.hp[0] <= 0 && s.hp[1] <= 0)
        ? (s.hp[0] === s.hp[1] ? null : (s.hp[0] > s.hp[1] ? 0 : 1))
        : (s.hp[0] <= 0 ? 1 : 0);
      ev.push({ type: 'over', winner: s.winner, hp: [s.hp[0], s.hp[1]] });
    } else {
      s.turn = other(p);
      ev.push({ type: 'turn', player: s.turn });
    }
    return ok(s, ev);
  }
  /** Neue Runde (nach Spielende) – Landschaft & Wind neu, Treffer bleiben. */
  function tankNextRound(state) {
    const s = clone(state);
    const next = tkNewRound(s.seed, (s.round || 0) + 1);
    s.h = next.h; s.grid = next.grid; s.wind = next.wind; s.tanks = next.tanks;
    s.round = next.round; s.hp = [TK_HP, TK_HP]; s.over = false; s.winner = null;
    s.turn = (s.round % 2); s.last = null;
    return ok(s, [{ type: 'round', round: s.round }]);
  }

  /* ══════════════════════════════════════════════════════════════════════
     20 FRAGEN
     ══════════════════════════════════════════════════════════════════════ */
  const Q20_WORDS = {
    Tiere: ['Elefant','Pinguin','Giraffe','Delfin','Eichhörnchen','Krokodil','Fledermaus','Eule','Wolf','Qualle','Papagei','Igel','Fuchs','Wal','Biene','Schildkröte'],
    Essen: ['Pizza','Sushi','Lasagne','Brot','Erdbeere','Schokolade','Käse','Nudeln','Apfel','Pommes','Eis','Suppe','Burger','Reis','Kuchen','Oliven'],
    Orte: ['Bahnhof','Schule','Strand','Bibliothek','Krankenhaus','Flughafen','Zoo','Museum','Supermarkt','Berggipfel','Insel','Kirche','Park','Kino','Hafen','Wüste'],
    Gegenstände: ['Regenschirm','Zahnbürste','Spiegel','Schlüssel','Brille','Kerze','Kissen','Uhr','Rucksack','Fernseher','Kühlschrank','Stift','Ventilator','Teppich','Anker','Kompass'],
    Berufe: ['Lehrer','Feuerwehr','Bäcker','Pilot','Ärztin','Gärtner','Friseur','Programmierer','Koch','Polizist','Astronaut','Zimmermann','Journalist','Tierarzt','Richter','Taucher'],
  };
  const Q20_CATS = Object.keys(Q20_WORDS);
  const q20Norm = (s) => String(s || '').trim().toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');
  function q20Create(seed, opts) {
    const o = opts || {};
    const rand = rng(seed);
    const cat = o.cat && Q20_WORDS[o.cat] ? o.cat : Q20_CATS[Math.floor(rand() * Q20_CATS.length) % Q20_CATS.length];
    const list = Q20_WORDS[cat];
    const secret = o.secret ? String(o.secret) : list[Math.floor(rand() * list.length) % list.length];
    return {
      type: 'q20', seed, cat, words: list.slice(), secret, budget: o.budget || 20,
      phase: 'play', turn: 1, asked: [], guesses: [], wrong: 0,
      over: false, winner: null, log: [],
    };
  }
  function q20Ask(state, p, text) {
    if (state.over) return fail('over');
    if (state.phase !== 'play') return fail('phase');
    if (state.turn !== p) return fail('not-your-turn');
    const t = String(text || '').trim();
    if (!t) return fail('empty');
    if (t.length > 160) return fail('too-long');
    if (q20Left(state) <= 0) return fail('budget');
    const s = clone(state);
    s.asked.push({ t, a: null, by: p });
    s.turn = other(p);
    return ok(s, [{ type: 'ask', t, by: p, left: q20Left(s) }]);
  }
  function q20Answer(state, p, ans) {
    if (state.over) return fail('over');
    if (state.turn !== p) return fail('not-your-turn');
    const last = state.asked[state.asked.length - 1];
    if (!last || last.a !== null) return fail('nothing-to-answer');
    const a = ['ja', 'nein', 'vielleicht', 'ja', 'no'].indexOf(String(ans)) >= 0 ? String(ans) : null;
    if (!a) return fail('bad-answer');
    const s = clone(state);
    s.asked[s.asked.length - 1].a = a;
    s.turn = other(p);
    s.log.push({ q: last.t, a });
    return ok(s, [{ type: 'answer', a, q: last.t }]);
  }
  function q20Guess(state, p, word) {
    if (state.over) return fail('over');
    if (state.phase !== 'play') return fail('phase');
    const w = String(word || '').trim();
    if (!w) return fail('empty');
    if (state.turn !== p) return fail('not-your-turn');
    const right = q20Norm(w) === q20Norm(state.secret);
    const s = clone(state);
    s.guesses.push({ w, right });
    if (right) {
      s.over = true; s.winner = p; s.phase = 'over';
      s.log.push({ g: w, right: true });
      return ok(s, [{ type: 'correct', w, by: p }]);
    }
    // Falscher Tipp kostet eine Frage – der Rater bleibt aber am Zug.
    // (Vorher wechselte der Zug zum Antwortgeber, der nichts zu tun hatte:
    //  die Partie stand still.)
    s.wrong = (s.wrong || 0) + 1;
    s.log.push({ g: w, right: false });
    const ev = [{ type: 'wrong', w, by: p, left: q20Left(s) }];
    if (q20Left(s) <= 0) {
      s.over = true; s.winner = other(p); s.phase = 'over';
      s.log.push({ out: true });
      ev.push({ type: 'out-of-questions', winner: s.winner });
      return ok(s, ev);
    }
    s.turn = p;
    ev.push({ type: 'turn', player: p });
    return ok(s, ev);
  }
  /** Verbleibende Fragen – falsche Tipps zählen mit. */
  function q20Left(state) {
    return Math.max(0, state.budget - state.asked.length - (state.wrong || 0));
  }

  /* ══════════════════════════════════════════════════════════════════════
     GELD AUSGEBEN – Budget in Wert verwandeln (Rucksack-Duell)
     ══════════════════════════════════════════════════════════════════════ */
  const MONEY_ITEMS = [
    { id: 'kaffee', n: 'Kaffee',        p: 4,  v: 5,  i: '☕' },
    { id: 'pizza',  n: 'Pizza',         p: 9,  v: 12, i: '🍕' },
    { id: 'buch',   n: 'Buch',          p: 14, v: 20, i: '📚' },
    { id: 'schuh',  n: 'Turnschuhe',    p: 22, v: 29, i: '👟' },
    { id: 'kopf',   n: 'Kopfhörer',     p: 17, v: 21, i: '🎧' },
    { id: 'konzert',n: 'Konzertkarte',  p: 31, v: 44, i: '🎫' },
    { id: 'pflanze',n: 'Pflanze',       p: 6,  v: 8,  i: '🪴' },
    { id: 'rad',    n: 'Fahrrad',       p: 63, v: 88, i: '🚲' },
    { id: 'torte',  n: 'Torte',         p: 12, v: 15, i: '🍰' },
    { id: 'spiel',  n: 'Brettspiel',    p: 19, v: 26, i: '🎲' },
  ];
  const MONEY_BUDGET = 100, MONEY_PENALTY = 0.5;
  function moneyCatalog(seed, count) {
    const rand = rng((toSeed(seed) ^ 0x51ED270B) >>> 0);
    return shuffle(MONEY_ITEMS, rand).slice(0, count || 8);
  }
  function moneyCreate(seed, opts) {
    const o = opts || {}, count = o.count || 8, budget = o.budget || MONEY_BUDGET;
    const catalog = moneyCatalog(seed, count);
    return {
      type: 'money', seed, budget, catalog, left: [budget, budget], taken: [],
      value: [0, 0], turn: 0, over: false, winner: null, passes: 0, log: [],
    };
  }
  const moneyLeftAfter = (s, p, price) => s.left[p] - price;
  function moneyCanBuy(s, p, item) { return item && s.taken.indexOf(item.id) < 0 && moneyLeftAfter(s, p, item.p) >= 0; }
  function moneyOptions(state, p) { return state.catalog.filter((it) => moneyCanBuy(state, p, it)); }
  function moneyBuy(state, p, itemId) {
    if (state.over) return fail('over');
    if (state.turn !== p) return fail('not-your-turn');
    const item = state.catalog.find((x) => x.id === itemId);
    if (!item) return fail('unknown-item');
    if (state.taken.indexOf(itemId) >= 0) return fail('already-taken');
    if (!moneyCanBuy(state, p, item)) return fail('too-expensive');
    const s = clone(state);
    s.taken.push(itemId);
    s.left[p] = s.left[p] - item.p;
    s.value[p] += item.v;
    s.passes = 0;
    s.log.push({ p, item: item.id, price: item.p, value: item.v });
    const ev = [{ type: 'buy', p, item: itemId, left: s.left[p], value: s.value[p] }];
    if (s.taken.length === s.catalog.length) { finishMoney(s, ev); return ok(s, ev); }
    s.turn = other(p);
    if (!moneyOptions(s, s.turn).length) {                       // Gegner kann nichts kaufen
      if (!moneyOptions(s, p).length) { finishMoney(s, ev); return ok(s, ev); }
      ev.push({ type: 'other-pass', player: s.turn });
      s.turn = p;                                                // weiter mit dem, der kann
      if (!moneyOptions(s, s.turn).length) { finishMoney(s, ev); return ok(s, ev); }
    }
    ev.push({ type: 'turn', player: s.turn });
    return ok(s, ev);
  }
  function moneySkip(state, p) {
    if (state.over) return fail('over');
    if (state.turn !== p) return fail('not-your-turn');
    const s = clone(state);
    s.passes += 1;
    const ev = [{ type: 'skip', p }];
    if (s.passes >= 2) { finishMoney(s, ev); return ok(s, ev); }
    s.turn = other(p);
    if (!moneyOptions(s, s.turn).length) {
      if (!moneyOptions(s, p).length) { finishMoney(s, ev); return ok(s, ev); }
      s.turn = p; s.passes += 1;
      ev.push({ type: 'other-pass', player: other(p) });
      if (s.passes >= 2) { finishMoney(s, ev); return ok(s, ev); }
    }
    ev.push({ type: 'turn', player: s.turn });
    return ok(s, ev);
  }
  function moneyScore(s, p) { return Math.round((s.value[p] - MONEY_PENALTY * s.left[p]) * 100) / 100; }
  function finishMoney(s, ev) {
    s.over = true;
    s.score = [moneyScore(s, 0), moneyScore(s, 1)];
    s.winner = s.score[0] === s.score[1] ? null : (s.score[0] > s.score[1] ? 0 : 1);
    ev.push({ type: 'over', winner: s.winner, score: s.score });
  }
  function moneyAiPick(state, opts) {
    const o = opts || {}, p = o.p !== undefined ? o.p : state.turn, rand = o.rng || Math.random;
    const opts2 = moneyOptions(state, p);
    if (!opts2.length) return null;
    // möglichst viel Restgeld loswerden und dabei Wert maximieren
    let best = null, bestVal = -1;
    for (const it of opts2) {
      const rest = state.left[p] - it.p;
      const val = it.v + rest * MONEY_PENALTY * 0.9 - (rest < Math.min(...opts2.map((x) => x.p)) ? 0 : 0);
      if (val > bestVal) { bestVal = val; best = it.id; }
    }
    return best || opts2[Math.floor(rand() * opts2.length) % opts2.length].id;
  }

  /* ══ Matchmaking-Warteschlange (rein, damit testbar) ════════════════════ */
  function queueJoin(queue, game, user, meta) {
    const q = clone(queue || {});
    const slot = q[game] || { list: [] };
    if (slot.list.some((e) => e.u === user)) return { ok: true, queue: q, events: [], started: null };
    slot.list.push({ u: user, meta: meta || null, ts: Date.now() });
    slot.list.sort((a, b) => a.u.localeCompare(b.u));
    q[game] = slot;
    const need = (GAMES[game] && GAMES[game].p) || 2;
    const ev = [{ type: 'join', game, user, size: slot.list.length, need }];
    let started = null;
    if (slot.list.length >= need) {
      const players = slot.list.slice(0, need).map((e) => e.u);
      started = { game, players, host: players[0] };
      slot.list = slot.list.slice(need);
      ev.push({ type: 'start', game, players, host: players[0] });
    }
    return { ok: true, queue: q, events: ev, started };
  }
  function queueLeave(queue, game, user) {
    const q = clone(queue || {});
    const slot = q[game] || { list: [] };
    slot.list = slot.list.filter((e) => e.u !== user);
    q[game] = slot;
    return { ok: true, queue: q, events: [{ type: 'leave', game, user, size: slot.list.length }], started: null };
  }
  function queueList(queue, game) { return (queue && queue[game] && queue[game].list) ? queue[game].list.map((e) => e.u) : []; }
  function queueWaiting(queue, user) {
    const out = [];
    Object.keys(queue || {}).forEach((g) => { if (queueList(queue, g).indexOf(user) >= 0) out.push(g); });
    return out;
  }
  /** Deterministischer Start-Seed für eine Partie (beide Seiten gleich). */
  function matchSeed(game, players, extra) {
    return seedFrom([game].concat(players.slice().sort()).join('|') + '|' + (extra || ''));
  }

  /* ══ Fabrik: Zustand für einen Spieltyp erzeugen ══ */
  function create(type, seed, opts) {
    switch (type) {
      case 'mem':   return memCreate(seed, opts);
      case 'bs':    return bsCreate(seed, opts);
      case 'tank':  return tankCreate(seed, opts);
      case 'q20':   return q20Create(seed, opts);
      case 'money': return moneyCreate(seed, opts);
      case 'ttt':   return { type: 'ttt', seed, board: new Array(9).fill(0), turn: 0, over: false, winner: null };
      case 'c4':    return { type: 'c4', seed, board: new Array(42).fill(0), turn: 0, over: false, winner: null };
      case 'rps':   return { type: 'rps', seed, picks: [null, null], score: [0, 0], turn: 0, over: false, winner: null };
      default:      return null;
    }
  }
  /** Zug anwenden – einheitliche Schnittstelle für die UI und die Tests. */
  function move(state, player, m) {
    if (!state || !m) return fail('bad-call');
    switch (state.type) {
      case 'mem':   return m.a === 'flip' ? memFlip(state, player, m.i) : (m.a === 'resolve' ? memResolve(state) : fail('bad-action'));
      case 'bs':    return m.a === 'fire' ? bsFire(state, player, m.i) : fail('bad-action');
      case 'tank':  return m.a === 'fire' ? tankFire(state, player, { angle: m.angle, power: m.power })
                    : (m.a === 'next-round' ? tankNextRound(state) : fail('bad-action'));
      case 'q20':   return m.a === 'ask' ? q20Ask(state, player, m.t)
                    : m.a === 'answer' ? q20Answer(state, player, m.v)
                    : m.a === 'guess' ? q20Guess(state, player, m.w) : fail('bad-action');
      case 'money': return m.a === 'buy' ? moneyBuy(state, player, m.item)
                    : m.a === 'skip' ? moneySkip(state, player) : fail('bad-action');
      case 'ttt': {
        if (m.a !== 'place') return fail('bad-action');
        if (state.over || state.turn !== player || state.board[m.i] !== 0) return fail('bad-move');
        const s = clone(state); s.board[m.i] = player === 0 ? 1 : 2;
        const w = winTTT(s.board); const full = s.board.every((x) => x !== 0);
        if (w || full) { s.over = true; s.winner = w ? player : null; }
        else s.turn = other(player);
        return ok(s, w ? [{ type: 'win', line: w.line }] : []);
      }
      case 'c4': {
        if (m.a !== 'drop') return fail('bad-action');
        if (state.over || state.turn !== player) return fail('bad-move');
        let row = -1; for (let r = 5; r >= 0; r--) if (state.board[r * 7 + m.i] === 0) { row = r; break; }
        if (row < 0) return fail('column-full');
        const s = clone(state); s.board[row * 7 + m.i] = player === 0 ? 1 : 2;
        const w = winC4(s.board); const full = s.board.every((x) => x !== 0);
        if (w || full) { s.over = true; s.winner = w ? player : null; }
        else s.turn = other(player);
        return ok(s, w ? [{ type: 'win', line: w.line }] : []);
      }
      case 'rps': {
        if (m.a !== 'pick') return fail('bad-action');
        if (state.over || state.picks[player] !== null) return fail('bad-move');
        if ([1, 2, 3].indexOf(m.i) < 0) return fail('bad-pick');
        const s = clone(state); s.picks[player] = m.i;
        if (s.picks[0] !== null && s.picks[1] !== null) {
          const r = rpsResult(s.picks[0], s.picks[1]);
          s.over = true; s.result = r; s.winner = r === 0 ? null : (r === 1 ? 0 : 1);
          return ok(s, [{ type: 'reveal', picks: s.picks, result: r }]);
        }
        return ok(s, [{ type: 'picked', player }]);
      }
      default: return fail('unknown-type');
    }
  }
  /** Sieger aus einem Zustand – einheitlich für die UI. */
  function winner(state) {
    if (!state) return undefined;
    if (state.type === 'mem') return state.over ? (state.score[0] === state.score[1] ? -1 : (state.score[0] > state.score[1] ? 0 : 1)) : undefined;
    if (state.type === 'money') return state.over ? (state.winner === null ? -1 : state.winner) : undefined;
    if (state.over) return state.winner === null ? -1 : state.winner;
    return undefined;
  }
  /** Für die UI: kurzer Status-Text. */
  function statusText(state, p, names) {
    const who = (q) => (names && names[q]) || (q === 0 ? 'Du' : 'Gegner');
    switch (state.type) {
      case 'ttt': case 'c4': case 'rps': {
        if (state.type === 'rps') {
          if (state.over) return winner(state) === -1 ? 'Unentschieden!' : (state.winner === p ? '🎉 Du gewinnst!' : '😢 Verloren');
          return state.picks[p] !== null ? 'Warte auf ' + who(other(p)) + '…' : 'Wähle deine Waffe!';
        }
        if (state.over) return winner(state) === -1 ? 'Unentschieden!' : (state.winner === p ? '🎉 Du gewinnst!' : '😢 Verloren');
        return state.turn === p ? 'Du bist dran' : who(state.turn) + ' ist dran';
      }
      case 'mem': return state.over ? (winner(state) === -1 ? 'Unentschieden!' : who(state.winner === p ? p : other(p)) + ' gewinnt!')
        : (state.turn === p ? 'Du bist dran' : who(state.turn) + ' ist dran');
      case 'bs': return state.phase === 'place' ? (state.ready[p] ? 'Warte auf ' + who(other(p)) + '…' : 'Flotte platzieren')
        : state.over ? (state.winner === p ? '🎉 Du gewinnst!' : '😢 Verloren')
        : (state.turn === p ? 'Du bist dran' : who(state.turn) + ' schießt…');
      case 'tank': return state.over ? (winner(state) === -1 ? 'Unentschieden!' : (state.winner === p ? '🎉 Du gewinnst!' : '😢 Verloren'))
        : (state.turn === p ? 'Du bist dran' : who(state.turn) + ' zielt…');
      case 'q20': return state.over ? (state.winner === p ? '🎉 Erraten!' : 'Aus! ' + who(other(p)) + ' gewinnt')
        : (state.turn === p ? (p === 0 ? 'Stelle eine Frage' : 'Frage beantworten') : who(state.turn) + ' fragt/antwortet…');
      case 'money': return state.over ? (winner(state) === -1 ? 'Unentschieden!' : (state.winner === p ? '🎉 Gewonnen!' : '😢 Verloren'))
        : (state.turn === p ? 'Du kaufst' : who(state.turn) + ' kauft…');
      default: return '';
    }
  }

  return {
    VERSION, GAMES, ROOM_GAMES, MEM_EMOJI, MEM_PAIRS, BS_SIZE, BS_FLEET, BS_CELLS,
    Q20_WORDS, Q20_CATS, MONEY_ITEMS, MONEY_BUDGET, MONEY_PENALTY,
    TK_W, TK_H, TK_HP,
    mulberry32, seedFrom, toSeed, rng, shuffle, other,
    winTTT, winC4, rpsResult, aiPickTTT,
    memCreate, memFlip, memResolve, memAiMove, memIsDone,
    bsCreate, bsPlaceShip, bsRemoveShip, bsClearShips, bsAutoPlace, bsSetFleet, bsReady, bsFire,
    bsCellsOf, bsShipCells, bsStats, bsAllSunk, bsAllSunkOne, bsFleetRemaining, bsRandomFleet, bsIdx,
    tankCreate, tankFire, tankNextRound, tankTrajectory, tkHeight,
    q20Create, q20Ask, q20Answer, q20Guess, q20Left, q20Norm,
    moneyCreate, moneyBuy, moneySkip, moneyOptions, moneyScore, moneyAiPick, moneyCatalog,
    queueJoin, queueLeave, queueList, queueWaiting, matchSeed,
    create, move, winner, statusText,
  };
});
