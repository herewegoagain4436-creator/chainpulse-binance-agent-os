/**
 * ChainPulse LIVE demo / smoke via baw CLI.
 * Requires CONNECTED wallet. Quote is read-only.
 * Mutating swap/deposit only when LIVE_MUTATE=1.
 */
import {
  BAW_DOCUMENTED_DAILY_CAPS_USD,
  BawWalletAdapter,
  BSC_CHAIN_ID,
  NATIVE_BNB,
  USDT_BSC,
} from "../adapters/bawWallet.js";
import { mcpStatusNote } from "../adapters/mcpContext.js";
import { envBool, envNum, envStr } from "../core/env.js";

async function main(): Promise<void> {
  console.log("===========================================================");
  console.log(" ChainPulse LIVE DEMO — Track A / Binance Agent OS");
  console.log(" Onchain via baw CLI (Binance Agentic Wallet)");
  console.log("===========================================================");
  console.log("");

  const mode = envStr("CHAINPULSE_MODE", "live").toLowerCase();
  if (mode === "paper") {
    console.log("CHAINPULSE_MODE=paper — offline escape hatch (not live).");
    console.log("Re-run without paper for live smoke.");
    process.exitCode = 0;
    return;
  }

  const baw = new BawWalletAdapter({ mode: "live" });
  const mcp = mcpStatusNote();
  const mutate = envBool("LIVE_MUTATE", false);
  const quoteAmt = envNum("LIVE_QUOTE_USDT", 1);
  const depositAmt = envNum("LIVE_DEPOSIT_USDT", 1);

  console.log("-- Rails --");
  console.log(`  BAW (primary): ${baw.hubUrl}`);
  console.log(`  chain: BSC ${BSC_CHAIN_ID}`);
  console.log(`  USDT: ${USDT_BSC}`);
  console.log(`  native BNB: ${NATIVE_BNB}`);
  console.log(`  caps (real defaults): swap=$${BAW_DOCUMENTED_DAILY_CAPS_USD.swap}/d defi=$${BAW_DOCUMENTED_DAILY_CAPS_USD.defi}/d x402=$${BAW_DOCUMENTED_DAILY_CAPS_USD.x402}/d`);
  console.log(`  MCP (optional): ${mcp.endpoint} (${mcp.label})`);
  console.log(`  LIVE_MUTATE=${mutate ? "1" : "0"}`);
  console.log("");

  const refreshed = await baw.refreshLive();
  const st = baw.status();
  console.log("-- Wallet status --");
  console.log(`  connection: ${st.connectionStatus}`);
  console.log(`  address:    ${st.address || "(none)"}`);
  console.log(`  label:      ${refreshed.label}`);
  console.log(
    `  remaining:  swap=$${st.remainingUsd.swap} defi=$${st.remainingUsd.defi} x402=$${st.remainingUsd.x402}`
  );

  if (!refreshed.ok || st.connectionStatus !== "CONNECTED") {
    console.error("\nFAIL: baw wallet must be CONNECTED for live demo.");
    console.error("Auth: baw auth signin → Binance App QR → baw auth verify");
    console.error("(Hub Connect alone is not enough)");
    process.exitCode = 2;
    return;
  }

  const bal = await baw.getBalances();
  console.log("\n-- Balances --");
  console.log(`  ${bal.label}`);
  for (const b of bal.data) {
    console.log(`  ${b.asset.padEnd(8)} free=${b.free}`);
  }

  console.log(`\n-- Quote ${quoteAmt} USDT → BNB --`);
  const quote = await baw.quoteSwap({
    fromAsset: "USDT",
    toAsset: "BNB",
    amountIn: quoteAmt,
  });
  console.log(`  ${quote.label}`);
  if (!quote.ok) {
    console.error("\nFAIL: live quote failed (not falling back to paper).");
    process.exitCode = 1;
    return;
  }
  console.log(`  amountOut≈ ${quote.data.amountOut} BNB`);

  if (!mutate) {
    console.log("\n-- Mutate skipped --");
    console.log("  Set LIVE_MUTATE=1 to also market-order swap and/or Lista Earn deposit.");
    console.log("\nPASS: CONNECTED + balances + live quote.");
    console.log("Disclaimer: Not financial advice. Live ops need App confirmation. No withdrawals.");
    return;
  }

  console.log("\n-- LIVE_MUTATE: swap 1 USDT → BNB --");
  const swap = await baw.swap({
    fromAsset: "USDT",
    toAsset: "BNB",
    amountIn: 1,
    notionalUsd: 1,
  });
  console.log(`  ${swap.label}`);
  console.log(`  ok=${swap.ok} status=${swap.data.status} id=${swap.data.swapId}`);

  console.log("\n-- LIVE_MUTATE: Lista Earn USDT deposit --");
  const disc = await baw.discoverListaUsdtInvestmentId();
  console.log(`  ${disc.label}`);
  if (disc.ok && disc.data.investmentId) {
    const dep = await baw.defiDeposit({
      investmentId: disc.data.investmentId,
      amount: depositAmt,
    });
    console.log(`  ${dep.label}`);
    console.log(`  ok=${dep.ok} status=${dep.data.status} id=${dep.data.stakeId}`);
  } else {
    console.log("  skip deposit — no investmentId");
  }

  const bal2 = await baw.getBalances();
  console.log("\n-- Balances (after) --");
  for (const b of bal2.data) {
    console.log(`  ${b.asset.padEnd(8)} free=${b.free}`);
  }

  console.log("\nPASS: live mutate path attempted (check App for confirmations / settlement).");
  console.log("Disclaimer: Not financial advice. No external withdrawals.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
