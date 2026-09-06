# ChainPulse — Track A (Binance Agent OS Mini Hackathon 2026)

## Product
**Onchain Workflows** agent: automated staking + multi-step DeFi interactions
(swap then stake / unstake then swap) via **BAW / Wallet Agentic Hub**, with saga-style
steps and rollback notes. Optional MCP for CEX market context.

## Track A focus
- BAW-first (not a CEX trading/news bot)
- Paper/mock adapter for Agentic Hub wallet ops
- Risk: max notional per step, max steps/day, kill-switch, confirm each workflow
- Demo asserts stake PASS, multi-app PASS, over-cap REJECT

## Agent OS
- **BAW** — https://web3.binance.com/agentic-hub (primary)
- **MCP** — https://agent.binance.com/mcp/agentic (oauth_client_id=grok, optional)
- Documented caps: ~USD50k swap / ~USD100k DeFi / USD20 x402 (defaults, not guarantees)

## Defaults
- CHAINPULSE_MODE=paper
- No secrets / no API keys on device
- No external withdrawals

See README.md, DEMO.md, AGENT_OS_NOTES.md.
