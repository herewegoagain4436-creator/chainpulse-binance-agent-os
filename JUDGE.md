# ChainPulse — Judge demo script (60-90 seconds)

**Product hook:** Automated on-chain workflows (swap / stake / DeFi) via BAW Agentic Hub, with documented daily caps and Binance App confirmations.

| This is | This is NOT |
|---------|-------------|
| Track A on-chain Agent OS (BAW-first) | NewsPulse (CEX news trading) |
| Staking / DeFi / swaps under quotas | PayPulse (A2A x402 micropay product) |
| Honest PENDING / REJECTED labels | Fake live fills or silent paper under live |

x402 may appear only as a wallet quota bucket (about USD20/day default) — not an A2A payment product.

## 60-90s live path (preferred)

1. Auth (15s) — baw auth signin, Binance App QR, baw auth verify until CONNECTED. Hub Connect alone is not enough.
2. Quotas (10s) — swap about USD50k / defi about USD5k / x402 about USD20 per day (documented defaults, not guarantees).
3. Read-only live demo via package scripts; checklist prints at end.
4. Honesty: mutating live ops label pending until App confirms; failures are rejected.
5. Rationales: why swap / stake / skip / reject (rules-based, no LLM).

Close: No external withdrawals. Paper only via mode env. Live never invents fills.

## Offline escape hatch

Run paper mode demo via package scripts.

Stake plus swap-then-stake plus over-cap reject, with rationales and judge checklist.

## Checklist

- [ ] Wallet connected via App verify
- [ ] Caps: swap / defi / x402
- [ ] pending is not success; rejected has a clear reason
- [ ] Product is on-chain workflows, not news trading, not A2A pay
- [ ] Step rationales visible

See DEMO.md, AGENT_OS_NOTES.md, README.md.
