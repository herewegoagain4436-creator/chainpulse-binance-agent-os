/**
 * Judge-facing checklist printed by live-smoke / demo.
 * Product hook: automated on-chain workflows (staking / DeFi / swaps) via BAW — not CEX news trading, not A2A micropay.
 */

export const PRODUCT_HOOK =
  "ChainPulse = automated on-chain workflows (swap / stake / DeFi) via BAW Agentic Hub, with documented daily caps + App confirmations.";

export const NOT_THIS_PRODUCT = [
  "NOT NewsPulse — not CEX news→trade brain",
  "NOT PayPulse — not A2A x402 micropay product (x402 may appear only as a wallet quota bucket)",
];

export function printJudgeChecklist(opts?: {
  connectionStatus?: string;
  mode?: string;
  pendingCount?: number;
  rejectedCount?: number;
  filledPaperCount?: number;
  caps?: { swap: number; defi: number; x402: number };
}): void {
  const caps = opts?.caps ?? { swap: 50_000, defi: 5_000, x402: 20 };
  console.log("");
  console.log("========== JUDGE CHECKLIST (ChainPulse / Track A) ==========");
  console.log(`HOOK: ${PRODUCT_HOOK}`);
  for (const line of NOT_THIS_PRODUCT) console.log(`  · ${line}`);
  console.log("");
  console.log("Auth (required for live):");
  console.log("  [ ] baw auth signin → Binance App QR → baw auth verify");
  console.log("  [ ] baw wallet status shows CONNECTED (Hub Connect alone is NOT enough)");
  console.log(`  → current: ${opts?.connectionStatus ?? "(unknown)"} | mode=${opts?.mode ?? "live"}`);
  console.log("");
  console.log("Documented daily caps (defaults, not guarantees — confirm in App):");
  console.log(`  [ ] swap ~$${caps.swap}/day`);
  console.log(`  [ ] defi ~$${caps.defi}/day`);
  console.log(`  [ ] x402 ~$${caps.x402}/day (quota only; not an A2A product here)`);
  console.log("");
  console.log("Honesty labels (no fake live fills):");
  console.log("  [ ] PENDING  = submitted / awaiting App confirm or settlement (NOT success)");
  console.log("  [ ] REJECTED = auth, cap, kill-switch, or baw error (clear reason)");
  console.log("  [ ] FILLED_PAPER / done only when CHAINPULSE_MODE=paper escape hatch");
  if (opts?.pendingCount != null || opts?.rejectedCount != null || opts?.filledPaperCount != null) {
    console.log(
      `  → this run: PENDING=${opts?.pendingCount ?? 0} REJECTED=${opts?.rejectedCount ?? 0} FILLED_PAPER=${opts?.filledPaperCount ?? 0}`
    );
  }
  console.log("");
  console.log("Demo path (60–90s): see JUDGE.md");
  console.log("  1) Auth CONNECTED  2) quotas  3) live quote  4) optional LIVE_MUTATE=1 → PENDING");
  console.log("  5) over-cap / risk REJECT  6) step rationales (why swap/stake/skip)");
  console.log("============================================================");
  console.log("");
}
