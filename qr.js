/* ══════════════════════════════════════════════════════════════════════════
   Nexus QR-Helfer
   ──────────────────────────────────────────────────────────────────────────
   Nutzt den mitgelieferten Generator (vendor/qrcode.js, MIT, Kazuhiko Arase)
   und zeichnet das Ergebnis selbst auf Canvas bzw. als SVG.

   Warum kein CDN mehr?
     • unpkg/jsdelivr ist offline, blockiert oder langsam nicht verfügbar
     • Barcodes/QR sind sicherheitsrelevant (Einladungen) → lokal ist stabil
     • Renderskalierung + Kontrast können so selbst bestimmt werden
   ══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else if (typeof define === 'function' && define.amd) define([], factory);
  else root.NexusQR = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  let _lib = null;
  function lib() {
    if (_lib) return _lib;
    if (typeof module === 'object' && module.exports) {
      _lib = require('./vendor/qrcode.js');
    } else {
      _lib = typeof qrcode === 'function' ? qrcode : (typeof window !== 'undefined' && window.qrcode);
    }
    // WICHTIG: Die Bibliothek kodiert standardmäßig in SJIS. Für Umlaute,
    // „ß“ und Emoji muss die UTF-8-Variante aktiv sein, sonst kommt beim
    // Scannen Kauderwelsch an (oder gar nichts).
    if (_lib && _lib.stringToBytesFuncs && _lib.stringToBytesFuncs['UTF-8']) {
      _lib.stringToBytes = _lib.stringToBytesFuncs['UTF-8'];
    }
    return _lib;
  }

  /** Modulmatrix erzeugen: {size, dark(row,col), version, ecl} */
  function matrixFor(text, opts) {
    const o = opts || {};
    const q = lib();
    if (!q) throw new Error('QR-Generator nicht geladen (vendor/qrcode.js fehlt)');
    const type = o.version || 0;                        // 0 = automatische Version
    const qr = q(type, o.ecl || 'M');
    qr.addData(String(text == null ? '' : text), o.mode || 'Byte');
    qr.make();
    const size = qr.getModuleCount();
    return {
      size, version: Math.floor((size - 17) / 4), ecl: o.ecl || 'M',
      dark: (r, c) => qr.isDark(r, c),
      rows: (function () {
        const out = [];
        for (let r = 0; r < size; r++) { const row = []; for (let c = 0; c < size; c++) row.push(qr.isDark(r, c) ? 1 : 0); out.push(row); }
        return out;
      })(),
    };
  }

  /** Kantenlänge in Modulen (inkl. Ruhezone) */
  function modulesWithMargin(matrix, margin) {
    const m = margin === undefined ? 4 : margin;        // QR-Standard: 4 Module Ruhezone
    return matrix.size + m * 2;
  }

  /**
   * Auf eine Canvas zeichnen – scharf auf Retina/HiDPI.
   * opts: {size (css-px, Standard 220), margin, dark, light, ecl, label}
   */
  function drawToCanvas(canvas, text, opts) {
    if (!canvas || !canvas.getContext) return false;
    const o = opts || {};
    const m = matrixFor(text, o);
    const cssSize = o.size || 220;
    const margin = o.margin === undefined ? 4 : o.margin;
    const total = modulesWithMargin(m, margin);
    const scale = Math.max(1, Math.floor((cssSize * (window.devicePixelRatio || 1)) / total));
    const px = total * scale;
    canvas.width = px;
    canvas.height = px;
    canvas.style.width = cssSize + 'px';
    canvas.style.height = cssSize + 'px';
    const ctx = canvas.getContext('2d');
    const light = o.light || '#ffffff', dark = o.dark || '#070b14';
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, px, px);
    ctx.fillStyle = dark;
    for (let r = 0; r < m.size; r++) {
      for (let c = 0; c < m.size; c++) {
        if (!m.dark(r, c)) continue;
        ctx.fillRect((c + margin) * scale, (r + margin) * scale, scale, scale);
      }
    }
    return true;
  }

  /** QR als SVG-Markup (scharf in jeder Größe, gut zum Ausdrucken/Teilen). */
  function svgFor(text, opts) {
    const o = opts || {};
    const m = matrixFor(text, o);
    const margin = o.margin === undefined ? 4 : o.margin;
    const total = modulesWithMargin(m, margin);
    const scale = o.scale || 8;
    const light = o.light || '#ffffff', dark = o.dark || '#070b14';
    let path = '';
    for (let r = 0; r < m.size; r++) {
      for (let c = 0; c < m.size; c++) {
        if (m.dark(r, c)) path += 'M' + ((c + margin) * scale) + ' ' + ((r + margin) * scale) + 'h' + scale + 'v' + scale + 'h-' + scale + 'z';
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + (total * scale) + '" height="' + (total * scale) + '" viewBox="0 0 ' + (total * scale) + ' ' + (total * scale) + '" shape-rendering="crispEdges">' +
      '<rect width="100%" height="100%" fill="' + light + '"/><path d="' + path + '" fill="' + dark + '"/></svg>';
  }

  /** QR als PNG-Daten-URL (für <img>, Teilen, Download). */
  function dataUrl(text, opts) {
    const c = document.createElement('canvas');
    if (!drawToCanvas(c, text, opts)) return '';
    return c.toDataURL('image/png');
  }

  /** Prüft, ob ein Generator verfügbar ist. */
  function available() { return !!lib(); }

  return { matrixFor, drawToCanvas, svgFor, dataUrl, available, modulesWithMargin };
});
