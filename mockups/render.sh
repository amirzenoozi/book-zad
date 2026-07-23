#!/usr/bin/env bash
# Regenerate the store screenshots from the HTML sources in mockups/src/.
# Renders with headless Chrome at 2× and downscales to the exact store sizes,
# then writes matching JPGs. Run from the repo root: bash mockups/render.sh
set -euo pipefail

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$DIR/src"

render() { # src-html width height out-png
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
    --screenshot="$4" --window-size="$2,$3" "file://$1" >/dev/null 2>&1
  sips -z "$3" "$2" "$4" >/dev/null 2>&1            # 2× supersample → exact size
  sips -s format jpeg -s formatOptions 86 "$4" --out "${4%.png}.jpg" >/dev/null 2>&1
}

render "$SRC/s-hero.html"  1280 800  "$DIR/banner.png"
render "$SRC/s-nudge.html" 1280 800  "$DIR/banner-nudge.png"
render "$SRC/s-popup.html" 1280 800  "$DIR/banner-popup.png"
render "$SRC/p-dark.html"   600 1031 "$DIR/popup-dark.png"
render "$SRC/p-light.html"  600 1031 "$DIR/popup-light.png"

echo "Rendered store screenshots to $DIR"
