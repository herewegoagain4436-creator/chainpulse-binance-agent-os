import type { RiskConfig, WorkflowStep } from "./types.js";
import { envBool, envNum } from "./env.js";

export const DEFAULT_RISK: RiskConfig = {
  maxNotionalPerStepUsd: envNum("MAX_NOTIONAL_PER_STEP_USD", 5_000),
  maxStepsPerDay: envNum("MAX_STEPS_PER_DAY", 40),
  killSwitch: envBool("KILL_SWITCH", false),
  requireWorkflowConfirm: envBool("REQUIRE_WORKFLOW_CONFIRM", true),
};

export interface RiskState {
  stepsToday: number;
  dayKey: string;
  killSwitch: boolean;
}

export function createRiskState(cfg: RiskConfig = DEFAULT_RISK): RiskState {
  return {
    stepsToday: 0,
    dayKey: utcDayKey(),
    killSwitch: cfg.killSwitch,
  };
}

export function utcDayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function refreshDay(state: RiskState): void {
  const key = utcDayKey();
  if (state.dayKey !== key) {
    state.dayKey = key;
    state.stepsToday = 0;
  }
}

export function setKillSwitch(state: RiskState, on: boolean): void {
  state.killSwitch = on;
}

export interface RiskGateResult {
  ok: boolean;
  reason?: string;
}

/** Pre-flight gate for an entire workflow before any step runs. */
export function gateWorkflow(opts: {
  confirmed: boolean;
  estimatedNotionalUsd: number;
  stepCount: number;
  state: RiskState;
  cfg?: RiskConfig;
}): RiskGateResult {
  const cfg = opts.cfg ?? DEFAULT_RISK;
  refreshDay(opts.state);

  if (opts.state.killSwitch || cfg.killSwitch) {
    return { ok: false, reason: "kill-switch active — all workflows blocked" };
  }
  if (cfg.requireWorkflowConfirm && !opts.confirmed) {
    return { ok: false, reason: "workflow requires explicit confirm before execution" };
  }
  if (opts.state.stepsToday + opts.stepCount > cfg.maxStepsPerDay) {
    return {
      ok: false,
      reason: `would exceed max steps/day (${cfg.maxStepsPerDay}); used=${opts.state.stepsToday}`,
    };
  }
  return { ok: true };
}

/** Per-step gate: notional + kill-switch + daily step budget. */
export function gateStep(opts: {
  step: Pick<WorkflowStep, "notionalUsd" | "kind" | "label">;
  state: RiskState;
  cfg?: RiskConfig;
}): RiskGateResult {
  const cfg = opts.cfg ?? DEFAULT_RISK;
  refreshDay(opts.state);

  if (opts.state.killSwitch || cfg.killSwitch) {
    return { ok: false, reason: "kill-switch active" };
  }
  if (opts.step.notionalUsd > cfg.maxNotionalPerStepUsd) {
    return {
      ok: false,
      reason: `step notional $${opts.step.notionalUsd} exceeds max $${cfg.maxNotionalPerStepUsd}/step`,
    };
  }
  if (opts.state.stepsToday >= cfg.maxStepsPerDay) {
    return {
      ok: false,
      reason: `max steps/day (${cfg.maxStepsPerDay}) reached`,
    };
  }
  return { ok: true };
}

export function recordStep(state: RiskState): void {
  refreshDay(state);
  state.stepsToday += 1;
}
