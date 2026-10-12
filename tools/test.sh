#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
#  Alle Tests ausführen (Spiellogik, QR, End-to-End in jsdom)
#  Aufruf:  bash tools/test.sh
# ══════════════════════════════════════════════════════════════════════════
set -uo pipefail
cd "$(dirname "$0")/.."
if [ ! -d node_modules ]; then
  echo "→ Testabhängigkeiten werden installiert (npm install)…"
  npm install --silent || { echo "npm install fehlgeschlagen – Tests benötigen jsdom/jsQR."; exit 2; }
fi
node --test tests/games.test.mjs tests/qr.test.mjs tests/e2e.test.mjs "$@"
