# ChainPulse — Track A (Binance Agent OS Mini Hackathon 2026)

## Product
**Onchain Workflows** agent: automated staking + multi-step DeFi interactions
(swap then stake / unstake then swap) via **BAW / Wallet Agentic Hub**, with saga-style
steps, rollback notes, and **rules-based step rationales** (no LLM). Optional MCP for CEX market context only.

## Track A focus
- BAW-first (not a CEX trading/news bot; not an A2A micropay product)
- LIVE-first via baw CLI; paper only when CHAINPULSE_MODE=paper
- Risk: max notional per step, max steps/day, kill-switch, confirm each workflow
- Honest labels: pending (awaiting App confirm) vs rejected vs paper FILLED_PAPER
- Demo / live-smoke print a judge checklist; see JUDGE.md (60-90s)

## Agent OS
- **BAW** — https://web3.binance.com/agentic-hub (primary)
- **MCP** — https://agent.binance.com/mcp/agentic (optional; example oauth_client_id=grok, hosts flexible)
- Documented caps: about USD50k swap / USD5k DeFi / USD20 x402 (defaults, not guarantees)

## Defaults
- CHAINPULSE_MODE=live
- No secrets / no API keys on device
- No external withdrawals

See README.md, DEMO.md, JUDGE.md, AGENT_OS_NOTES.md.
