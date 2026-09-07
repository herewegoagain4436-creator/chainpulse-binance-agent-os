/**
 * ChainPulse LIVE demo / smoke via baw CLI (+ paper escape hatch).
 * Requires CONNECTED wallet for live. Quote is read-only.
 * Mutating swap/deposit only when LIVE_MUTATE=1 — labeled PENDING, never fake fills.
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
import { printJudgeChecklist } from "../core/judgeChecklist.js";
import { WorkflowOrchestrator } from "../core/orchestrator.js";
import { DEFAULT_RISK } from "../core/risk.js";
import {
  overCapSwapWorkflow,
  stakeEthWorkflow,
  swapThenStakeWorkflow,
} from "../core/workflows.js";
import { formatRationaleLine } from "../core/rationale.js";

async function runPaperJudgeDemo(): Promise<void> {
  console.log("CHAINPULSE_MODE=paper — offline escape hatch (not live).");
  console.log("Running paper workflow suite for judge checklist / rationales.\n");

  // Fresh orchestrator per workflow so documented daily caps do not bleed across demos.
  const stake = await new WorkflowOrchestrator({ mode: "paper" }).runWorkflow(
    stakeEthWorkflow({ ethAmount: 1, id: "demo-stake" }),
    { confirmed: true }
  );
  const multi = await new WorkflowOrchestrator({ mode: "paper" }).runWorkflow(
    swapThenStakeWorkflow({ usdtAmount: 3_200, id: "demo-swap-stake" }),
    { confirmed: true }
  );
  const over = await new WorkflowOrchestrator({ mode: "paper" }).runWorkflow(
    overCapSwapWorkflow({ usdtAmount: 75_000, id: "demo-over-cap" }),
    { confirmed: true, cfg: { ...DEFAULT_RISK, maxNotionalPerStepUsd: 100_000 } }
  );

  let pending = 0;
  let rejected = 0;
  let filled = 0;
  for (const run of [stake, multi, over]) {
    console.log(`-- Workflow: ${run.name} → ${run.status} --`);
    for (const s of run.steps) {
      const r = s.rationale;
      console.log(`  [${s.status}] ${s.kind} ${s.label}`);
      console.log(`    outcome=${s.liveOutcome ?? "—"} | ${s.detail ?? ""}`);
      if (r) console.log(`    rationale: ${formatRationaleLine(r)}`);
      if (s.status === "awaiting_confirm" || s.liveOutcome === "PENDING") pending++;
      if (s.status === "rejected") rejected++;
      if (s.liveOutcome === "FILLED_PAPER" || (s.status === "done" && run.mode === "paper")) filled++;
    }
    console.log("");
  }

  console.log(
    `Asserts: stake=${stake.status} multi=${multi.status} over-cap=${over.status} (expect completed/completed/rejected)`
  );
  printJudgeChecklist({
    connectionStatus: "PAPER",
    mode: "paper",
    pendingCount: pending,
    rejectedCount: rejected,
    filledPaperCount: filled,
    caps: { ...BAW_DOCUMENTED_DAILY_CAPS_USD },
  });
  process.exitCode =
    stake.status === "completed" && multi.status === "completed" && over.status === "rejected"
      ? 0
      : 1;
}

async function main(): Promise<void> {
  console.log("===========================================================");
  console.log(" ChainPulse LIVE DEMO — Track A / Binance Agent OS");
  console.log(" On-chain workflows via baw CLI (Binance Agentic Wallet)");
  console.log(" Product: automated staking / DeFi / swaps — not news trading, not A2A pay");
  console.log("===========================================================");
  console.log("");

  const mode = envStr("CHAINPULSE_MODE", "live").toLowerCase();
  if (mode === "paper") {
    await runPaperJudgeDemo();
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
  console.log(
    `  caps (documented defaults, not guarantees): swap=$${BAW_DOCUMENTED_DAILY_CAPS_USD.swap}/d defi=$${BAW_DOCUMENTED_DAILY_CAPS_USD.defi}/d x402=$${BAW_DOCUMENTED_DAILY_CAPS_USD.x402}/d`
  );
  console.log(`  MCP (optional context): ${mcp.endpoint}`);
  console.log(`       ${mcp.label}`);
  console.log(`  LIVE_MUTATE=${mutate ? "1" : "0"} (mutates label PENDING, never fake FILLED)`);
  console.log("");
  console.log("Auth guidance: baw auth signin → Binance App QR → baw auth verify");
  console.log("              (Hub Connect alone is NOT enough)");
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
    console.error("\nREJECTED: baw wallet must be CONNECTED for live demo.");
    console.error("Auth: baw auth signin → Binance App QR → baw auth verify");
    console.error("(Hub Connect alone is not enough)");
    printJudgeChecklist({
      connectionStatus: String(st.connectionStatus),
      mode: "live",
      pendingCount: 0,
      rejectedCount: 1,
      filledPaperCount: 0,
      caps: { ...BAW_DOCUMENTED_DAILY_CAPS_USD },
    });
    process.exitCode = 2;
    return;
  }

  const bal = await baw.getBalances();
  console.log("\n-- Balances --");
  console.log(`  ${bal.label}`);
  for (const b of bal.data) {
    console.log(`  ${b.asset.padEnd(8)} free=${b.free}`);
  }

  console.log(`\n-- Quote ${quoteAmt} USDT → BNB (read-only) --`);
  const quote = await baw.quoteSwap({
    fromAsset: "USDT",
    toAsset: "BNB",
    amountIn: quoteAmt,
  });
  console.log(`  ${quote.label}`);
  if (!quote.ok) {
    console.error("\nREJECTED: live quote failed (not falling back to paper).");
    printJudgeChecklist({
      connectionStatus: "CONNECTED",
      mode: "live",
      pendingCount: 0,
      rejectedCount: 1,
      filledPaperCount: 0,
      caps: st.documentedCapsUsd,
    });
    process.exitCode = 1;
    return;
  }
  console.log(`  amountOut≈ ${quote.data.amountOut} BNB`);

  let pending = 0;
  let rejected = 0;

  // Paper-style over-cap gate demo even on live (local risk + documented cap check, no mutate)
  console.log("\n-- Cap gate demo (expect REJECT on huge notional) --");
  const cap = await baw.checkCap({ bucket: "swap", notionalUsd: 75_000 });
  console.log(`  ${cap.label}`);
  if (!cap.ok) rejected++;
  console.log("  rationale: REJECT — over documented/live swap daily remaining; refuse mutate.");

  if (!mutate) {
    console.log("\n-- Mutate skipped --");
    console.log("  Set LIVE_MUTATE=1 to also market-order swap and/or Lista Earn deposit.");
    console.log("  Those paths label PENDING (App confirm) — never FILLED success.");
    console.log("\nPASS: CONNECTED + balances + live quote + cap REJECT demo.");
    printJudgeChecklist({
      connectionStatus: "CONNECTED",
      mode: "live",
      pendingCount: pending,
      rejectedCount: rejected,
      filledPaperCount: 0,
      caps: st.documentedCapsUsd,
    });
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
  console.log(
    "  rationale: SWAP — size under swap daily cap to obtain BNB; live ack is PENDING until App confirms."
  );
  if (swap.data.status === "PENDING") pending++;
  if (swap.data.status === "REJECTED" || !swap.ok) rejected++;

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
    console.log(
      "  rationale: STAKE — DeFi Earn deposit under defi daily cap; PENDING App confirm, not filled success."
    );
    if (dep.data.status === "PENDING") pending++;
    if (dep.data.status === "REJECTED" || !dep.ok) rejected++;
  } else {
    console.log("  SKIP deposit — no investmentId");
    console.log("  rationale: SKIP — cannot stake without a discovered Lista/helio investment id.");
  }

  const bal2 = await baw.getBalances();
  console.log("\n-- Balances (after) --");
  for (const b of bal2.data) {
    console.log(`  ${b.asset.padEnd(8)} free=${b.free}`);
  }

  console.log("\nDONE: live mutate path attempted — check status labels (PENDING ≠ success).");
  printJudgeChecklist({
    connectionStatus: "CONNECTED",
    mode: "live",
    pendingCount: pending,
    rejectedCount: rejected,
    filledPaperCount: 0,
    caps: st.documentedCapsUsd,
  });
  console.log("Disclaimer: Not financial advice. No external withdrawals.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
