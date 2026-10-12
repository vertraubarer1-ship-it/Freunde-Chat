#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
#  Nexus-Chat – App-Icons erzeugen (reproduzierbar)
#  Voraussetzung: ImageMagick (convert) + DejaVu-Font
#  Aufruf:  bash tools/make-icons.sh
# ══════════════════════════════════════════════════════════════════════════
set -euo pipefail
cd "$(dirname "$0")/.."
FONT="${FONT:-DejaVu-Sans-Bold}"
OUT=icons
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# ── Bausteine ─────────────────────────────────────────────────────────────
# Verlauf des App-Designs (Indigo → Cyan)
gradient() { convert -size "$1x$1" gradient:'#8b5cf6-#22d3ee' "$2"; }

# Abgerundete Ecken (für "any"-Icons; maskierbare Icons bleiben randlos)
rounded() {
  convert -size "$1x$1" xc:black -fill white \
    -draw "roundrectangle 0,0,$(( $1 - 1 )),$(( $1 - 1 )),$(( $1 * 24 / 100 )),$(( $1 * 24 / 100 ))" "$2"
}

# Sprechblase mit Schweif + Buchstabe N (weiß auf Verlauf)
artwork() {   # $1 = Größe, $2 = Zieldatei, $3 = Hintergrund-Verhalten (round|full)
  local s="$1" bg="$2" mode="$3"
  local b="$(awk "BEGIN{printf \"%d\", $s*0.60}")"      # Blasenbreite
  local h="$(awk "BEGIN{printf \"%d\", $s*0.42}")"      # Blasenhöhe
  local x="$(awk "BEGIN{printf \"%d\", $s*0.20}")"
  local y="$(awk "BEGIN{printf \"%d\", $s*0.24}")"
  local r="$(awk "BEGIN{printf \"%d\", $s*0.11}")"
  local x2="$(awk "BEGIN{printf \"%d\", $x+$b}")"
  local y2="$(awk "BEGIN{printf \"%d\", $y+$h}")"
  # Schweif
  local t1="$(awk "BEGIN{printf \"%d\", $x+$b*0.28}")"
  local t2="$(awk "BEGIN{printf \"%d\", $x+$b*0.52}")"
  local t3="$(awk "BEGIN{printf \"%d\", $x+$b*0.30}")"
  local t4="$(awk "BEGIN{printf \"%d\", $y2+$s*0.11}")"
  local fs="$(awk "BEGIN{printf \"%d\", $s*0.30}")"
  gradient "$s" "$TMP/g.png"
  if [ "$mode" = round ]; then
    rounded "$s" "$TMP/m.png"
    convert "$TMP/g.png" "$TMP/m.png" -alpha off -compose CopyOpacity -composite "$TMP/base.png"
  else
    cp "$TMP/g.png" "$TMP/base.png"
  fi
  convert "$TMP/base.png" \
    -fill white -draw "roundrectangle $x,$y,$x2,$y2,$r,$r" \
    -draw "polygon $t1,$y2 $t2,$y2 $t3,$t4" \
    -font "$FONT" -pointsize "$fs" -fill '#1e1b4b' \
    -gravity north -annotate "+0+$(( y + fs / 4 ))" "N" \
    "$bg"
}

mkdir -p "$OUT"

# ── "any"-Icons (abgerundet, transparent außen) ───────────────────────────
artwork 512 "$OUT/icon-512.png" round
artwork 192 "$OUT/icon-192.png" round
artwork 180 "$OUT/apple-touch-icon.png" full
artwork 32  "$OUT/favicon-32.png" round

# ── maskierbares Icon (randlos, Motiv in der sicheren Zone) ──────────────
convert -size 512x512 gradient:'#8b5cf6-#22d3ee' "$TMP/full.png"
convert "$OUT/icon-512.png" -resize 70% "$TMP/art70.png"
convert "$TMP/full.png" "$TMP/art70.png" -gravity center -composite "$OUT/icon-maskable-512.png"

# ── Benachrichtigungs-Badge (weiße Silhouette, wird vom System eingefärbt) ─
convert -size 96x96 xc:none \
  -fill white -draw "roundrectangle 12,20,84,66,12,12" \
  -draw "polygon 30,64 56,64 32,86" \
  -font "$FONT" -pointsize 30 -fill none \
  "$TMP/badge0.png"
convert -size 96x96 xc:none -fill white -draw "roundrectangle 12,20,84,66,12,12" \
  -draw "polygon 30,64 56,64 32,86" -resize 72x72 "$OUT/badge-72.png"

# ── PNG-Optimierung + Kontrolle ──────────────────────────────────────────
for f in "$OUT"/*.png; do convert "$f" -strip -define png:compression-level=9 "$f"; done
echo "Erzeugte Icons:"
identify -format '  %f  %wx%h  %[channels]  %B\n' "$OUT"/*.png
