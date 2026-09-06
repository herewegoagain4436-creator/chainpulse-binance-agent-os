# ChainPulse — Demo guide

## Quick start

```bash
cd /workspace/hackathons/binance-agent-os-onchain
npm install
npm run demo
```

Expected:
1. Automated ETH liquid-stake workflow completed
2. Multi-app DeFi (swap then stake) workflow completed
3. Over-cap swap attempt rejected against documented daily swap default
4. Exit 0 on PASS

## Dashboard

```bash
npm run dev
```

Open the Vite URL (port 5174). Click Run demo suite. Panels: BAW status, wallet balances, workflow list, step log.

## What the demo shows

1. Stake flow — approve then stake ETH to stETH (BAW DeFi bucket)
2. Saga multi-app — USDT swap then stake, with rollback notes
3. Cap enforcement — oversized swap rejected (documented daily swap default)
4. Risk: max notional/step, max steps/day, kill-switch, confirm-required
5. PAPER SIM labels on every BAW path; no external withdrawals

## Agent OS

### BAW (primary)
- Hub: https://web3.binance.com/agentic-hub
- Ops: balance, approve, stake, unstake, swap, daily caps, kill-switch
- Caps (documented defaults): ~USD50k swap / ~USD100k DeFi / USD20 x402 — not guarantees

### MCP (optional)
- Endpoint: https://agent.binance.com/mcp/agentic
- Auth: OAuth oauth_client_id=grok. No device API keys.
- Do not open the MCP URL in a browser.
- ChainPulse uses MCP only for context — execution is BAW

Details: AGENT_OS_NOTES.md

## Disclaimer

Not financial advice. Paper/mock is not live on-chain execution.
