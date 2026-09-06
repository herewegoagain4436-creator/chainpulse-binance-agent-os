/**
 * ChainPulse demo — asserts:
 *  1) successful stake workflow
 *  2) multi-app DeFi workflow (swap then stake)
 *  3) rejected over-cap attempt
 */
import { WorkflowOrchestrator } from "../core/orchestrator.js";
import {
  overCapSwapWorkflow,
  stakeEthWorkflow,
  swapThenStakeWorkflow,
} from "../core/workflows.js";
import { BAW_DOCUMENTED_DAILY_CAPS_USD } from "../adapters/bawWallet.js";
import { mcpStatusNote } from "../adapters/mcpContext.js";
import { DEFAULT_RISK } from "../core/risk.js";

function printRun(
  title: string,
  run: Awaited<ReturnType<WorkflowOrchestrator["runWorkflow"]>>
): void {
  console.log(`\n-- ${title} --`);
  console.log(`  id:     ${run.id}`);
  console.log(`  name:   ${run.name}`);
  console.log(`  status: ${run.status}`);
  if (run.rejectReason) console.log(`  reject: ${run.rejectReason}`);
  for (const s of run.steps) {
    const mark =
      s.status === "done"
        ? "OK  "
        : s.status === "rejected"
          ? "REJ "
          : s.status === "skipped"
            ? "skip"
            : s.status.padEnd(4);
    console.log(
      `  [${mark}] ${s.kind.padEnd(8)} ${s.label}  ($${s.notionalUsd})`
    );
    if (s.detail) console.log(`         ${s.detail}`);
    if (s.status === "done" && s.rollbackNote) {
      console.log(`         rollback-note: ${s.rollbackNote}`);
    }
  }
}

async function main(): Promise<void> {
  console.log("===========================================================");
  console.log(" ChainPulse DEMO — Track A / Binance Agent OS Mini Hackathon");
  console.log(" Onchain Workflows via BAW (Wallet Agentic Hub)");
  console.log("===========================================================");
  console.log("");

  const orch = new WorkflowOrchestrator({ mode: "paper" });
  const baw = orch.baw.status();
  const mcp = mcpStatusNote();

  console.log("-- Rails --");
  console.log(`  BAW (primary): ${baw.hubUrl}`);
  console.log(`                ${baw.label}`);
  console.log(
    `                documented caps (defaults, not guarantees): swap=$${BAW_DOCUMENTED_DAILY_CAPS_USD.swap}/day, defi=$${BAW_DOCUMENTED_DAILY_CAPS_USD.defi}/day, x402=$${BAW_DOCUMENTED_DAILY_CAPS_USD.x402}/day`
  );
  console.log(`  MCP (optional): ${mcp.endpoint}`);
  console.log(`                  oauth_client_id=${mcp.oauthClientId}`);
  console.log(`                  ${mcp.label}`);
  console.log("");
  console.log("-- Risk --");
  console.log(
    `  maxNotionalPerStep=$${DEFAULT_RISK.maxNotionalPerStepUsd}  maxSteps/day=${DEFAULT_RISK.maxStepsPerDay}  killSwitch=${DEFAULT_RISK.killSwitch}  requireConfirm=${DEFAULT_RISK.requireWorkflowConfirm}`
  );

  const bal0 = orch.baw.snapshotBalances();
  console.log("\n-- Paper wallet (before) --");
  for (const b of bal0) {
    console.log(`  ${b.asset.padEnd(6)} free=${b.free}`);
  }

  const stakeDef = stakeEthWorkflow({ ethAmount: 1, ethPriceUsd: 3200, id: "demo-stake" });
  const stakeRun = await orch.runWorkflow(stakeDef, { confirmed: true });
  printRun("1) Automated staking (ETH to stETH)", stakeRun);

  const multiDef = swapThenStakeWorkflow({
    usdtAmount: 3200,
    ethPriceUsd: 3200,
    id: "demo-swap-stake",
  });
  const multiRun = await orch.runWorkflow(multiDef, { confirmed: true });
  printRun("2) Multi-app DeFi (swap USDT to ETH then stake)", multiRun);

  const overDef = overCapSwapWorkflow({ usdtAmount: 75_000, id: "demo-over-cap" });
  const overRun = await orch.runWorkflow(overDef, {
    confirmed: true,
    cfg: {
      ...DEFAULT_RISK,
      maxNotionalPerStepUsd: 100_000,
    },
  });
  printRun("3) Over-cap attempt (expect REJECT)", overRun);

  const bal1 = orch.baw.snapshotBalances();
  console.log("\n-- Paper wallet (after) --");
  for (const b of bal1) {
    console.log(`  ${b.asset.padEnd(6)} free=${b.free}${b.staked ? ` staked=${b.staked}` : ""}`);
  }

  console.log("\n-- Demo assertions --");
  const stakeOk = stakeRun.status === "completed";
  const multiOk = multiRun.status === "completed";
  const overRejected = overRun.status === "rejected";
  const overCapReason =
    (overRun.rejectReason ?? "").toLowerCase().includes("cap") ||
    overRun.steps.some(
      (s) =>
        s.status === "rejected" &&
        (s.detail ?? "").toLowerCase().includes("cap")
    );

  console.log(`  stake workflow completed:     ${stakeOk}`);
  console.log(`  swap+stake workflow completed:${multiOk}`);
  console.log(`  over-cap rejected:            ${overRejected}`);
  console.log(`  over-cap mentions daily cap:  ${overCapReason}`);

  if (!stakeOk || !multiOk || !overRejected || !overCapReason) {
    console.error("\nFAIL: expected stake PASS + multi-app PASS + over-cap REJECT");
    process.exitCode = 1;
    return;
  }

  console.log("\nPASS: stake + multi-app DeFi + over-cap rejection demonstrated.");
  console.log(
    "Disclaimer: Not financial advice. PAPER/MOCK is not live on-chain. No external withdrawals. Documented BAW caps are public defaults, not guarantees."
  );
  console.log("See AGENT_OS_NOTES.md, DEMO.md, BRIEF.md");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
