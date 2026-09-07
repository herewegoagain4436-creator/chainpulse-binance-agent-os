# ChainPulse — LIVE Demo Video

**File:** `demo/chainpulse-live-demo.mp4`  
**Resolution:** 1280x720 · H.264 · silent  
**Duration:** ~75–81 seconds (target 60-90s)

## What the video shows (LIVE — not paper)

1. **Title** — ChainPulse: onchain workflows via Binance Agentic Wallet (`baw`)
2. **Auth** — `baw auth signin` → Binance App QR → verify (**not** Hub Connect)
3. **Wallet** — LIVE CONNECTED: Solana `Bq7j…CNvr` / EVM `0xC270…6593`
4. **Balances** — BSC after ops: USDT ~4.43, BNB ~0.0027, roxptUSDT ~1.97
5. **Swap** — 1 USDT → 0.001337 BNB · order FINISHED · tx `0x9945b10c…9b92`
6. **Lista Earn** — 2 USDT → ~1.966 roxptUSDT · tx `0xa753e146…ff48`
7. **Quotas** — swap ~$50k left, DeFi $5k, x402 $20 · risk gates · no withdrawals
8. **Repo + PASS** — `github.com/herewegoagain4436-creator/chainpulse-binance-agent-os` · **LIVE PASS**

## Notes

- Evidence: `demo/live-smoke.txt` (wallet CONNECTED + settings/quotas)
- Live txs are on BSC (swap + Lista Earn deposit)
- Frames via Pillow (`demo/gen_live_slides.py`); assemble via ffmpeg
- Green **LIVE** badge on every slide (not PAPER/SIM)
- Slide timings sum ~75s; encoded duration ~81s
