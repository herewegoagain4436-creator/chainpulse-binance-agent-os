#!/usr/bin/env bash
set -euo pipefail
DIR=/workspace/hackathons/binance-agent-os-onchain/demo
FRAMES="$DIR/frames"
OUT="$DIR/chainpulse-live-FULL-UNCUT.mp4"
LIST=$(mktemp)
for i in 01_title 02_auth 03_wallet 04_balances 05_swap 06_lista 07_quotas 08_end; do
  printf "file '%s/%s.png'\nduration 25\n" "$FRAMES" "$i" >> "$LIST"
done
printf "file '%s/08_end.png'\n" "$FRAMES" >> "$LIST"
ffmpeg -y -f concat -safe 0 -i "$LIST" -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p" -c:v libx264 -pix_fmt yuv420p -r 30 -movflags +faststart "$OUT"
rm -f "$LIST"
ls -la "$OUT"
ffprobe -v error -show_entries format=duration,size -of default=nw=1 "$OUT"
