#!/bin/bash
# Chroma-key magenta sky from sleep PNGs to transparent.
#
# Workflow: drop magenta-sky source images into public/sleep/source/
# (named like london.png, seville.png — port id, lowercase). Run this
# script. Keyed transparent-sky versions land in public/sleep/.
#
# Why hue-based instead of -fuzz: AI image models paint a built-in
# vignette into the magenta sky, so the actual pixels range from near-
# black corners through dusty wine-pink at center. A flat #FF00FF key
# misses everything but the brightest center. Instead we mask by hue:
# magenta is the only place where G is significantly lower than both R
# and B. That tests holds regardless of luminance, so the vignetted
# corners are caught too, while building silhouettes (R ≈ G ≈ B) and
# warm window glows (R > G > B) are preserved.

set -e

SRC_DIR="public/sleep/source"
OUT_DIR="public/sleep"

if [ ! -d "$SRC_DIR" ]; then
  echo "Source directory $SRC_DIR not found"
  exit 1
fi

count=0
for src in "$SRC_DIR"/*.png; do
  [ -e "$src" ] || continue
  name=$(basename "$src")
  out="$OUT_DIR/$name"
  magick "$src" \
    \( +clone -fx 'g < r - 0.10 && g < b - 0.06 && r > 0.18 ? 0 : 1' \) \
    -alpha off -compose copy-opacity -composite \
    "$out"
  echo "  keyed: $name"
  count=$((count + 1))
done

echo "Done — $count image(s) keyed."
