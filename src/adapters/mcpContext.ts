/**
 * Optional MCP note for CEX market/context.
 * ChainPulse is BAW-first (onchain); MCP is optional context only.
 *
 * Endpoint: https://agent.binance.com/mcp/agentic
 * OAuth: oauth_client_id=grok — no API keys on device.
 * Do NOT open the MCP URL in a browser.
 */
import { envStr } from "../core/env.js";
import prices from "../data/fixtures/prices.json";

export const MCP_ENDPOINT = envStr(
  "BINANCE_AGENT_OS_MCP_URL",
  "https://agent.binance.com/mcp/agentic"
);
export const MCP_OAUTH_CLIENT_ID = envStr(
  "BINANCE_AGENT_OS_OAUTH_CLIENT_ID",
  "grok"
);

export function mcpStatusNote() {
  return {
    rail: "MCP" as const,
    role: "optional_cex_context",
    endpoint: MCP_ENDPOINT,
    oauthClientId: MCP_OAUTH_CLIENT_ID,
    label:
      "OPTIONAL MCP — CEX market/context via OAuth (oauth_client_id=grok). ChainPulse executes onchain via BAW, not MCP orders.",
    note: "Do not open MCP URL in a browser. No device API keys. No withdrawals.",
    fixturePrices: prices as Record<string, number>,
  };
}

/** Paper price hints (fixtures) — stand-in for MCP market data. */
export function getPaperPrice(asset: string): number {
  const key = asset.toUpperCase();
  const map = prices as Record<string, number>;
  return map[key] ?? 1;
}
