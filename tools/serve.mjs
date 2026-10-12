#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   Kleiner statischer Server für lokale Tests und den Live-Vorschau-Modus.
   ──────────────────────────────────────────────────────────────────────────
   Aufruf:   node tools/serve.mjs [port]
   Standard: 0.0.0.0:8123  (damit auch die Vorschau im Browser erreichbar ist)

   Eigenschaften:
     • keine Verzeichnis-Ausbrüche (nur innerhalb des Projektordners)
     • richtige MIME-Typen (inkl. .js/.mjs/.json/.svg/.png/.webmanifest)
     • sw.js wird nie gecacht – sonst bleiben Service-Worker-Updates hängen
     • schlanke Antworten, geeignet für die PWA-Installation (sicherer Kontext
       über https:// in der Vorschau; localhost gilt ebenfalls als sicher)
   ══════════════════════════════════════════════════════════════════════════ */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.argv[2] || process.env.PORT || 8123);
const HOST = process.env.HOST || '0.0.0.0';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith('/')) path += 'index.html';
    const target = normalize(join(ROOT, path));
    if (!target.startsWith(ROOT + sep) && target !== ROOT) {
      res.writeHead(403).end('Verboten');
      return;
    }
    const info = await stat(target).catch(() => null);
    if (!info || info.isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Nicht gefunden: ' + path);
      return;
    }
    const body = await readFile(target);
    const ext = extname(target).toLowerCase();
    const headers = {
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': ext === '.html' || target.endsWith('sw.js')
        ? 'no-store'                                  // App & Worker immer frisch
        : 'public, max-age=600',
      'Service-Worker-Allowed': '/',
    };
    res.writeHead(200, headers).end(req.method === 'HEAD' ? undefined : body);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Serverfehler: ' + e.message);
  }
});

server.listen(PORT, HOST, () => {
  console.log('Nexus Chat läuft auf http://' + (HOST === '0.0.0.0' ? 'localhost' : HOST) + ':' + PORT + '/');
  console.log('Ordner: ' + ROOT);
});
