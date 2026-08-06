#!/usr/bin/env bash
# Regenerate public/og.png from scripts/og-card.html.
#
# Uses a headless browser screenshot rather than adding an image-rendering
# dependency (sharp / resvg / canvas) to the project. og:image must be a real
# raster — Twitter and Facebook both ignore SVG — so a static PNG is committed,
# and this script exists so it can be re-derived from source instead of being an
# opaque binary.
#
# Requires: agent-browser. Run: ./scripts/make-og.sh
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="public/og.png"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cp scripts/og-card.html "$TMP/card.html"

# The card is authored at exactly 1200x630, so the viewport must match or the
# screenshot is cropped/letterboxed and the ratio breaks in link previews.
agent-browser --session ogcard set viewport 1200 630 >/dev/null 2>&1
agent-browser --session ogcard open "file://$TMP/card.html" >/dev/null 2>&1
sleep 2
agent-browser --session ogcard screenshot "$(pwd)/$OUT" >/dev/null 2>&1

if [ ! -f "$OUT" ]; then
  echo "FAILED to write $OUT" >&2
  exit 1
fi

# Verify the raster is exactly 1200x630 by reading the PNG IHDR, rather than
# trusting the screenshot. A silently mis-sized og:image is the kind of thing
# nobody notices until a link looks wrong in public.
node -e '
const fs = require("fs");
const b = fs.readFileSync("'"$OUT"'");
const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
if (w !== 1200 || h !== 630) {
  console.error(`FAILED: og.png is ${w}x${h}, expected 1200x630`);
  process.exit(1);
}
console.log(`wrote '"$OUT"' (${w}x${h}, ${b.length} bytes)`);
'
