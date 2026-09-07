/** ChainPulse domain types — onchain workflow / BAW-first. */

export type AssetId = string;

export type WorkflowKind =
  | "stake_eth"
  | "swap_then_stake"
  | "unstake_then_swap"
  | "custom";

export type StepKind =
  | "approve"
  | "swap"
  | "stake"
  | "unstake"
  | "transfer_internal"
  | "check_cap"
  | "confirm";

export type StepStatus =
  | "pending"
  | "running"
  | "done"
  | "awaiting_confirm"
  | "rejected"
  | "rolled_back"
  | "skipped";

export type WorkflowStatus =
  | "draft"
  | "awaiting_confirm"
  | "running"
  | "completed"
  | "rejected"
  | "failed"
  | "rolled_back";

export interface RiskConfig {
  maxNotionalPerStepUsd: number;
  maxStepsPerDay: number;
  killSwitch: boolean;
  requireWorkflowConfirm: boolean;
}

export interface WalletBalance {
  asset: AssetId;
  free: number;
  locked: number;
  /** Staked / receipt token amount when applicable */
  staked?: number;
}

export interface WorkflowStep {
  id: string;
  kind: StepKind;
  label: string;
  assetIn?: AssetId;
  assetOut?: AssetId;
  amountIn?: number;
  amountOut?: number;
  notionalUsd: number;
  status: StepStatus;
  detail?: string;
  /** Compensating action note for saga-style rollback */
  rollbackNote?: string;
  /** Rules-based explainable rationale (no LLM) */
  rationale?: {
    action: string;
    headline: string;
    why: string;
    factors: string[];
  };
  /** Live ack honesty: PENDING | REJECTED | FILLED_PAPER | … */
  liveOutcome?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface WorkflowDefinition {
  id: string;
  kind: WorkflowKind;
  name: string;
  description: string;
  steps: Omit<WorkflowStep, "status" | "startedAt" | "finishedAt" | "amountOut" | "detail">[];
  /** Soft max notional for the whole workflow (sum of step notionals checked separately) */
  estimatedNotionalUsd: number;
}

export interface WorkflowRun {
  id: string;
  definitionId: string;
  kind: WorkflowKind;
  name: string;
  status: WorkflowStatus;
  confirmed: boolean;
  steps: WorkflowStep[];
  createdAt: string;
  finishedAt?: string;
  rejectReason?: string;
  mode: "paper" | "mock" | "live";
  label: string;
}

export interface StepLogEntry {
  at: string;
  workflowId: string;
  stepId: string;
  kind: StepKind;
  status: StepStatus;
  message: string;
  notionalUsd?: number;
  rationaleWhy?: string;
}

export interface OrchestratorSnapshot {
  workflows: WorkflowRun[];
  stepLog: StepLogEntry[];
  balances: WalletBalance[];
  bawStatus: Record<string, unknown>;
  mcpNote: Record<string, unknown>;
  risk: RiskConfig & { stepsToday: number; dayKey: string };
}
