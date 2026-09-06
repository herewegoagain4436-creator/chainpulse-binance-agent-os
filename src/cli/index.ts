/** ChainPulse CLI — single workflow runner */
import { WorkflowOrchestrator } from "../core/orchestrator.js";
import {
  overCapSwapWorkflow,
  stakeEthWorkflow,
  swapThenStakeWorkflow,
  unstakeThenSwapWorkflow,
} from "../core/workflows.js";

async function main(): Promise<void> {
  const cmd = (process.argv[2] ?? "snapshot").toLowerCase();
  const orch = new WorkflowOrchestrator({ mode: "paper" });

  if (cmd === "snapshot") {
    console.log(JSON.stringify(orch.snapshot(), null, 2));
    return;
  }

  const map: Record<string, () => ReturnType<typeof stakeEthWorkflow>> = {
    stake: () => stakeEthWorkflow(),
    "swap-stake": () => swapThenStakeWorkflow(),
    "unstake-swap": () => unstakeThenSwapWorkflow(),
    "over-cap": () => overCapSwapWorkflow(),
  };

  const factory = map[cmd];
  if (!factory) {
    console.error("Unknown command. Use: stake | swap-stake | unstake-swap | over-cap | snapshot");
    process.exitCode = 1;
    return;
  }

  const run = await orch.runWorkflow(factory(), { confirmed: true });
  console.log(JSON.stringify(run, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
