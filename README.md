# ChainPulse

**Track A — Binance Agent OS Mini Hackathon 2026**

**On-chain Workflows** agent: automated **staking / DeFi / swaps** via **BAW (Binance Wallet Agentic Hub)**, with saga-style steps, risk gates, documented daily caps, and honest pending / rejected labels.

> Not a CEX news-trading bot. Not an A2A micropay product.
> x402 may appear only as a **wallet quota** (about USD20/day documented default).

## Product hook (for judges)

Automated on-chain workflows with **documented daily caps** and **App confirmations** — LIVE-first through the baw CLI.

| Rail | Role |
|------|------|
| **BAW** (primary) | Swaps, DeFi Earn / stake-style flows, balances, quotas — https://web3.binance.com/agentic-hub |
| **MCP** (optional) | CEX market/context only — https://agent.binance.com/mcp/agentic |

Agent OS hosts are **flexible** — example oauth_client_id=grok; other hosts may differ. ChainPulse does **not** place CEX orders in the demo.

## Documented daily caps (defaults — not guarantees)

| Bucket | Default |
|--------|---------|
| Regular swaps | **USD 50,000 / day** |
| DeFi operations | **USD 5,000 / day** |
| x402-style | **USD 20 / day** |

Confirm live left-quota in the Binance App / baw wallet settings. Quotas are independent.

## Auth (required for live)

Hub Connect alone is **not** enough for CLI live smoke / on-chain agent flows:

1. baw auth signin — shows QR
2. Scan with **Binance App** (Wallet)
3. baw auth verify — until connectionStatus CONNECTED

## Honesty labels

| Label | Meaning |
|-------|---------|
| **pending** | Live submit awaiting App confirm / settlement — **not** a filled success |
| **rejected** | Auth, cap, kill-switch, or baw error — clear reason, no silent paper |
| **FILLED_PAPER** | Only when CHAINPULSE_MODE=paper escape hatch |

No fake live fills. No external withdrawals. No device API secrets.

## Features

- LIVE-first BAW adapter (src/adapters/bawWallet.ts)
- Saga workflows: stake, swap then stake, unstake then swap, over-cap reject
- Risk: max notional/step, max steps/day, kill-switch, require confirm
- Rules-based step rationales (src/core/rationale.ts) — no LLM
- Vite dashboard + CLI demo with judge checklist
- JUDGE.md — 60-90s demo script

## Quick start

Clone the repo, install deps, copy env example (live default).
Then use package scripts: live-smoke, demo, dev, build.
Paper offline: set CHAINPULSE_MODE=paper before running demo.

## Scripts

| Script | Purpose |
|--------|---------|
| live-smoke | Read-only baw checks + judge checklist |
| demo | Live or paper suite + rationales + checklist |
| dev | Vite + React dashboard |
| cli | Single workflow / snapshot JSON |
| build | typecheck + Vite build |

## Key files

- src/adapters/bawWallet.ts — LIVE baw CLI adapter
- src/core/orchestrator.ts — saga runner + pending honesty
- src/core/rationale.ts — explainable step rationales
- src/core/judgeChecklist.ts and JUDGE.md — judge path
- AGENT_OS_NOTES.md, DEMO.md, BRIEF.md

## Disclaimer

Not financial advice. Documented BAW caps are public defaults, not contractual SLAs. Live ops need Binance App confirmation. No withdrawal scope.
