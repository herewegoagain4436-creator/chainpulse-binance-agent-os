/**
 * Rules-based explainable rationales for each on-chain action.
 * No LLM required — deterministic templates from step kind, caps, and outcome.
 */
import type { StepKind, StepStatus } from "./types.js";

export interface StepRationale {
  /** SWAP | STAKE | UNSTAKE | APPROVE | CHECK_CAP | SKIP | REJECT | CONFIRM */
  action: string;
  /** One-line headline for CLI / UI */
  headline: string;
  /** Short why (1–2 sentences) */
  why: string;
  /** Bullet factors the rules weighed */
  factors: string[];
}

export interface ExplainStepInput {
  kind: StepKind;
  label: string;
  status: StepStatus;
  notionalUsd: number;
  detail?: string;
  assetIn?: string;
  assetOut?: string;
  amountIn?: number;
  remainingSwapUsd?: number;
  remainingDefiUsd?: number;
  connectionStatus?: string;
}

function actionFor(kind: StepKind, status: StepStatus): string {
  if (status === "skipped") return "SKIP";
  if (status === "rejected") return "REJECT";
  if (status === "awaiting_confirm") return "PENDING";
  switch (kind) {
    case "swap":
      return "SWAP";
    case "stake":
      return "STAKE";
    case "unstake":
      return "UNSTAKE";
    case "approve":
      return "APPROVE";
    case "check_cap":
      return "CHECK_CAP";
    case "confirm":
      return "CONFIRM";
    case "transfer_internal":
      return "INTERNAL";
    default:
      return String(kind).toUpperCase();
  }
}

/** Build a structured NL rationale for one on-chain workflow step. */
export function explainStep(input: ExplainStepInput): StepRationale {
  const action = actionFor(input.kind, input.status);
  const factors: string[] = [
    `kind=${input.kind}`,
    `notional≈$${input.notionalUsd}`,
  ];
  if (input.assetIn) factors.push(`assetIn=${input.assetIn}`);
  if (input.assetOut) factors.push(`assetOut=${input.assetOut}`);
  if (input.amountIn != null) factors.push(`amountIn=${input.amountIn}`);
  if (input.remainingSwapUsd != null) factors.push(`swapRemaining≈$${input.remainingSwapUsd}`);
  if (input.remainingDefiUsd != null) factors.push(`defiRemaining≈$${input.remainingDefiUsd}`);
  if (input.connectionStatus) factors.push(`wallet=${input.connectionStatus}`);

  // Outcome-first branches
  if (input.status === "skipped") {
    return {
      action: "SKIP",
      headline: `SKIP — ${input.label}`,
      why:
        "This step was skipped because a prior gate rejected or a live prerequisite failed (auth, empty balance, or missing investment id). ChainPulse never invents a silent fill.",
      factors: [...factors, input.detail ?? "skipped after prior rejection"],
    };
  }

  if (input.status === "rejected") {
    const reason = input.detail ?? "risk or BAW gate failed";
    let why =
      `Rejected: ${reason}. Rules refuse the mutate rather than paper-fill under a live mode.`;
    if (/cap|quota|exceeds/i.test(reason)) {
      why =
        `Rejected on daily quota / notional gate (${reason}). Documented defaults: swap ~$50k / DeFi ~$5k / x402 ~$20 per day — confirm live left-quota in the Binance App.`;
    } else if (/kill-switch/i.test(reason)) {
      why = `Rejected because kill-switch is engaged — all wallet mutating ops are blocked.`;
    } else if (/UNCONNECTED|auth|BAW_MISSING|CONNECT/i.test(reason)) {
      why =
        `Rejected on auth: Hub Connect alone is not enough. Real flow is baw auth signin → Binance App QR → baw auth verify until CONNECTED.`;
    }
    return {
      action: "REJECT",
      headline: `REJECT — ${input.label}`,
      why,
      factors: [...factors, reason],
    };
  }

  if (input.status === "awaiting_confirm" || /PENDING/i.test(input.detail ?? "")) {
    return {
      action: "PENDING",
      headline: `PENDING — ${input.label}`,
      why:
        "Live path submitted to baw / Agentic Wallet and is awaiting Binance App confirmation or on-chain settlement. This is NOT a filled success — labels stay PENDING until the App confirms.",
      factors: [...factors, input.detail ?? "awaiting App confirmation"],
    };
  }

  // Kind-specific success / running rationales
  switch (input.kind) {
    case "check_cap":
      return {
        action: "CHECK_CAP",
        headline: `CHECK_CAP — ${input.label}`,
        why:
          "Pre-flight daily-cap check against the correct BAW bucket (swap vs DeFi vs x402). Quotas are independent; DeFi does not consume the regular swap bucket.",
        factors,
      };
    case "approve":
      return {
        action: "APPROVE",
        headline: `APPROVE — ${input.label}`,
        why:
          "Spending allowance is a prerequisite before swap/stake so the protocol can pull the sized amount. On live baw, allowance is often implicit inside market-order / defi deposit.",
        factors,
      };
    case "swap":
      return {
        action: "SWAP",
        headline: `SWAP — ${input.label}`,
        why:
          `Swap ${input.assetIn ?? "token"} → ${input.assetOut ?? "token"} on the BAW swap rail so the next DeFi/stake leg has the required asset, sized under the swap daily cap and per-step risk max.`,
        factors,
      };
    case "stake":
      return {
        action: "STAKE",
        headline: `STAKE — ${input.label}`,
        why:
          "Stake / Earn deposit on the BAW DeFi rail (e.g. Lista USDT Earn on BSC) to complete the on-chain workflow under the DeFi daily cap — not a CEX spot order.",
        factors,
      };
    case "unstake":
      return {
        action: "UNSTAKE",
        headline: `UNSTAKE — ${input.label}`,
        why:
          "Exit path: redeem / unstake the receipt asset so a later swap can return value to a stable — still under DeFi quota and confirmations.",
        factors,
      };
    case "confirm":
      return {
        action: "CONFIRM",
        headline: `CONFIRM — ${input.label}`,
        why: "Explicit workflow confirm gate — ChainPulse does not auto-mutate without confirm=true when REQUIRE_WORKFLOW_CONFIRM is on.",
        factors,
      };
    case "transfer_internal":
      return {
        action: "INTERNAL",
        headline: `INTERNAL — ${input.label}`,
        why: "Internal ledger move only — ChainPulse has no external withdrawal scope.",
        factors,
      };
    default:
      return {
        action,
        headline: `${action} — ${input.label}`,
        why: input.detail ?? "Rules-based on-chain step.",
        factors,
      };
  }
}

/** Compact one-liner for CLI judge output. */
export function formatRationaleLine(r: StepRationale): string {
  return `${r.action}: ${r.why}`;
}
