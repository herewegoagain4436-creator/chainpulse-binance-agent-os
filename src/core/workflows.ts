/**
 * Workflow definitions for ChainPulse Track A demos.
 * Saga-style multi-step flows include rollback notes on each mutating step.
 */
import type { WorkflowDefinition } from "./types.js";

/** Liquid-stake style paper flow: approve → stake ETH → receive stETH receipt. */
export function stakeEthWorkflow(opts?: {
  ethAmount?: number;
  ethPriceUsd?: number;
  id?: string;
}): WorkflowDefinition {
  const ethAmount = opts?.ethAmount ?? 1;
  const ethPriceUsd = opts?.ethPriceUsd ?? 3_200;
  const notional = ethAmount * ethPriceUsd;
  const id = opts?.id ?? "wf-stake-eth";

  return {
    id,
    kind: "stake_eth",
    name: "Automated ETH liquid-stake",
    description:
      "Liquid-stake: approve staking protocol → stake ETH → mint stETH receipt token (BAW DeFi path).",
    estimatedNotionalUsd: notional,
    steps: [
      {
        id: `${id}-s1`,
        kind: "approve",
        label: `Approve ${ethAmount} ETH for liquid-staking protocol`,
        assetIn: "ETH",
        amountIn: ethAmount,
        notionalUsd: notional,
        rollbackNote: "Revoke spending allowance if later steps fail.",
      },
      {
        id: `${id}-s2`,
        kind: "stake",
        label: `Stake ${ethAmount} ETH → mint stETH`,
        assetIn: "ETH",
        assetOut: "stETH",
        amountIn: ethAmount,
        notionalUsd: notional,
        rollbackNote: "Unstake / burn stETH and return ETH if receipt mint fails mid-flight.",
      },
    ],
  };
}

/** Multi-app DeFi: swap USDT→ETH on DEX, then liquid-stake ETH. */
export function swapThenStakeWorkflow(opts?: {
  usdtAmount?: number;
  ethPriceUsd?: number;
  id?: string;
}): WorkflowDefinition {
  const usdtAmount = opts?.usdtAmount ?? 3_200;
  const ethPriceUsd = opts?.ethPriceUsd ?? 3_200;
  const ethOut = usdtAmount / ethPriceUsd;
  const id = opts?.id ?? "wf-swap-stake";

  return {
    id,
    kind: "swap_then_stake",
    name: "Multi-app: swap USDT → stake ETH",
    description:
      "Saga: approve USDT → swap to ETH (BAW swap rail) → approve ETH → liquid-stake (BAW DeFi rail).",
    estimatedNotionalUsd: usdtAmount,
    steps: [
      {
        id: `${id}-s1`,
        kind: "approve",
        label: `Approve ${usdtAmount} USDT for DEX router`,
        assetIn: "USDT",
        amountIn: usdtAmount,
        notionalUsd: usdtAmount,
        rollbackNote: "Revoke USDT allowance on abort.",
      },
      {
        id: `${id}-s2`,
        kind: "swap",
        label: `Swap ${usdtAmount} USDT → ~${ethOut.toFixed(4)} ETH`,
        assetIn: "USDT",
        assetOut: "ETH",
        amountIn: usdtAmount,
        notionalUsd: usdtAmount,
        rollbackNote: "Reverse-swap ETH→USDT at market if stake leg aborts (slippage applies).",
      },
      {
        id: `${id}-s3`,
        kind: "approve",
        label: `Approve ~${ethOut.toFixed(4)} ETH for staking protocol`,
        assetIn: "ETH",
        amountIn: ethOut,
        notionalUsd: usdtAmount,
        rollbackNote: "Revoke ETH allowance; keep ETH or reverse-swap.",
      },
      {
        id: `${id}-s4`,
        kind: "stake",
        label: `Stake ~${ethOut.toFixed(4)} ETH → mint stETH`,
        assetIn: "ETH",
        assetOut: "stETH",
        amountIn: ethOut,
        notionalUsd: usdtAmount,
        rollbackNote: "Unstake stETH → ETH, then reverse-swap to USDT if needed.",
      },
    ],
  };
}

/** Unstake receipt → swap back to stable (exit path). */
export function unstakeThenSwapWorkflow(opts?: {
  stEthAmount?: number;
  ethPriceUsd?: number;
  id?: string;
}): WorkflowDefinition {
  const stEthAmount = opts?.stEthAmount ?? 0.5;
  const ethPriceUsd = opts?.ethPriceUsd ?? 3_200;
  const notional = stEthAmount * ethPriceUsd;
  const id = opts?.id ?? "wf-unstake-swap";

  return {
    id,
    kind: "unstake_then_swap",
    name: "Exit: unstake stETH → swap ETH→USDT",
    description: "Saga exit path: unstake liquid receipt → swap ETH to USDT.",
    estimatedNotionalUsd: notional,
    steps: [
      {
        id: `${id}-s1`,
        kind: "unstake",
        label: `Unstake ${stEthAmount} stETH → ETH`,
        assetIn: "stETH",
        assetOut: "ETH",
        amountIn: stEthAmount,
        notionalUsd: notional,
        rollbackNote: "Re-stake ETH if swap leg fails and policy prefers remaining staked.",
      },
      {
        id: `${id}-s2`,
        kind: "approve",
        label: `Approve ${stEthAmount} ETH for DEX router`,
        assetIn: "ETH",
        amountIn: stEthAmount,
        notionalUsd: notional,
        rollbackNote: "Revoke ETH allowance.",
      },
      {
        id: `${id}-s3`,
        kind: "swap",
        label: `Swap ${stEthAmount} ETH → USDT`,
        assetIn: "ETH",
        assetOut: "USDT",
        amountIn: stEthAmount,
        notionalUsd: notional,
        rollbackNote: "Hold ETH; optional reverse path not automatic.",
      },
    ],
  };
}

/** Over-cap attempt: intentionally huge notional to demo daily / step rejection. */
export function overCapSwapWorkflow(opts?: {
  usdtAmount?: number;
  id?: string;
}): WorkflowDefinition {
  const usdtAmount = opts?.usdtAmount ?? 75_000; // above documented $50k/day swap default
  const id = opts?.id ?? "wf-over-cap";

  return {
    id,
    kind: "custom",
    name: "Over-cap swap attempt (expect REJECT)",
    description:
      "Intentionally exceeds documented BAW swap daily cap (~$50k/day default) and/or per-step risk max.",
    estimatedNotionalUsd: usdtAmount,
    steps: [
      {
        id: `${id}-s1`,
        kind: "check_cap",
        label: `Pre-check daily swap cap for $${usdtAmount} USDT→ETH`,
        assetIn: "USDT",
        assetOut: "ETH",
        amountIn: usdtAmount,
        notionalUsd: usdtAmount,
        rollbackNote: "N/A — rejected before mutate.",
      },
      {
        id: `${id}-s2`,
        kind: "swap",
        label: `Swap $${usdtAmount} USDT → ETH (should not execute)`,
        assetIn: "USDT",
        assetOut: "ETH",
        amountIn: usdtAmount,
        notionalUsd: usdtAmount,
        rollbackNote: "N/A if rejected at cap check.",
      },
    ],
  };
}

export const DEMO_WORKFLOWS = {
  stakeEth: stakeEthWorkflow,
  swapThenStake: swapThenStakeWorkflow,
  unstakeThenSwap: unstakeThenSwapWorkflow,
  overCap: overCapSwapWorkflow,
};
