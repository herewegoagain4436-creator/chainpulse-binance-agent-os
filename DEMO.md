# ChainPulse Demo (LIVE-first)

**Hook:** Automated on-chain workflows (swap / stake / DeFi) via BAW — documented caps + App confirmations.
Not CEX news trading. Not A2A micropay (x402 = wallet quota only).

## Live (preferred)

1. Auth: baw auth signin, Binance App QR, baw auth verify until CONNECTED
2. Package script live-smoke — read-only status / balances / quotas / quote + judge checklist
3. Package script demo — same rails; LIVE_MUTATE=1 for swap / Lista deposit labeled pending (not success)
4. Over-cap / auth failures → rejected with reason
5. See JUDGE.md for a 60-90s script

## Paper escape hatch

Set CHAINPULSE_MODE=paper then run demo.
Stake + swap-then-stake PASS + over-cap REJECT, with step rationales. Clearly labeled paper — not live.

## Quotas (documented defaults)

swap 50k / defi 5k / x402 20 USD/day — confirm in App.
