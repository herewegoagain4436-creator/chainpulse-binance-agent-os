# Binance Agent OS — Notes for ChainPulse

ChainPulse is **BAW-first** (onchain workflows). MCP is optional context only.

## 1) BAW — Binance Wallet Agentic Hub (primary)

| Key | Value |
|-----|-------|
| Hub | https://web3.binance.com/agentic-hub |
| Role | On-chain / wallet ops for agents (swaps, DeFi-style stake/unstake, approvals) |

### Live auth (required for real wallet ops)

Hub Connect alone is **not** enough for CLI live smoke / on-chain agent flows.

Real auth flow:

1. `baw auth signin` — shows QR
2. Scan with **Binance App** (Wallet)
3. `baw auth verify` (or verify with `--qrCodeId`) — poll until wallet is CONNECTED

Then confirm with `baw wallet status --json` (`connectionStatus: CONNECTED`).

### Documented daily caps (defaults — not guarantees)

From public Agent OS / Agentic Wallet materials. Confirm live quotas in Binance App / wallet settings.

| Cap | Documented default |
|-----|-------------------|
| Regular swaps | USD 50,000 / day |
| DeFi operations | USD 5,000 / day (App may show a lower user quota) |
| x402-style payments | USD 20 / day |

Quotas are independent (DeFi does not consume the regular swap bucket).

Adapter: src/adapters/bawWallet.ts
LIVE interface: balances, approve, stake, unstake, swap, daily-cap checks, kill-switch.

## 2) MCP — exchange / CEX rail (optional context)

| Key | Value |
|-----|-------|
| URL | https://agent.binance.com/mcp/agentic |
| Auth | Client OAuth flow — no API keys stored on device |
| OAuth client id (Grok) | grok |

### Grok CLI setup (reference)

    add binance-mcp-server with url=https://agent.binance.com/mcp/agentic oauth_client_id=grok

Do not open the MCP endpoint in a browser. Use the MCP client / OAuth flow only.

### Capabilities (agentic MCP)

- Market data (public), agentic sub-account, spot/futures under confirmations
- Transfers within agentic sub-account only
- No withdrawal scope
- Every trade/transfer requires confirmation

ChainPulse does not place CEX orders in the demo — MCP is noted for price/context only (src/adapters/mcpContext.ts).

## ChainPulse usage

- Default mode: live via baw CLI. Paper only if CHAINPULSE_MODE=paper.
- When baw is missing or UNCONNECTED, adapters return ok:false with a clear label (never silent paper).
- This project does not invent Binance guarantees. Paper != live. Mock != live. Documented caps != contractual SLAs.

## Official docs

- Agentic MCP server: https://developers.binance.com/en/docs/agent-native/mcp-server/agentic
- Agent Native overview: https://developers.binance.com/en/docs/agent-native/overview
- LLms index: https://developers.binance.com/en/docs/llms.txt
- Agentic Hub (wallet): https://web3.binance.com/agentic-hub

## Safety

- Never put Binance API secret keys in .env for Agent OS — MCP auth is OAuth.
- Prefer live smoke for demos; paper is an offline escape hatch.
- Kill-switch + risk limits apply before BAW mutating steps.
- No external withdrawals in this product.
