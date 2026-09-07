/**
 * Workflow orchestrator — saga-style step runner with risk gates + BAW calls.
 * Each mutating step records a rollback note; on rejection, prior steps are marked
 * with rollback guidance (paper mode does not auto-compensate ledger — notes only).
 */
import {
  BawWalletAdapter,
  type BawMode,
} from "../adapters/bawWallet.js";
import { mcpStatusNote } from "../adapters/mcpContext.js";
import {
  DEFAULT_RISK,
  createRiskState,
  gateStep,
  gateWorkflow,
  recordStep,
  setKillSwitch,
  type RiskState,
} from "./risk.js";
import type {
  OrchestratorSnapshot,
  RiskConfig,
  StepLogEntry,
  WorkflowDefinition,
  WorkflowRun,
  WorkflowStep,
} from "./types.js";

export interface RunOptions {
  confirmed: boolean;
  /** Override risk for a single run (e.g. demo over-cap still needs confirm) */
  cfg?: RiskConfig;
}

export class WorkflowOrchestrator {
  readonly baw: BawWalletAdapter;
  readonly riskState: RiskState;
  readonly cfg: RiskConfig;
  private runs: WorkflowRun[] = [];
  private stepLog: StepLogEntry[] = [];

  constructor(opts?: { mode?: BawMode; cfg?: RiskConfig; baw?: BawWalletAdapter }) {
    this.cfg = opts?.cfg ?? { ...DEFAULT_RISK };
    this.baw = opts?.baw ?? new BawWalletAdapter({ mode: opts?.mode });
    this.riskState = createRiskState(this.cfg);
  }

  setKillSwitch(on: boolean): void {
    setKillSwitch(this.riskState, on);
    this.baw.setKillSwitch(on);
  }

  listRuns(): WorkflowRun[] {
    return [...this.runs];
  }

  getStepLog(): StepLogEntry[] {
    return [...this.stepLog];
  }

  snapshot(): OrchestratorSnapshot {
    return {
      workflows: this.listRuns(),
      stepLog: this.getStepLog(),
      balances: this.baw.snapshotBalances(),
      bawStatus: this.baw.status(),
      mcpNote: mcpStatusNote(),
      risk: {
        ...this.cfg,
        killSwitch: this.riskState.killSwitch,
        stepsToday: this.riskState.stepsToday,
        dayKey: this.riskState.dayKey,
      },
    };
  }

  private log(
    run: WorkflowRun,
    step: WorkflowStep,
    status: WorkflowStep["status"],
    message: string
  ): void {
    this.stepLog.push({
      at: new Date().toISOString(),
      workflowId: run.id,
      stepId: step.id,
      kind: step.kind,
      status,
      message,
      notionalUsd: step.notionalUsd,
    });
  }

  private materialize(def: WorkflowDefinition): WorkflowRun {
    const steps: WorkflowStep[] = def.steps.map((s) => ({
      ...s,
      status: "pending",
    }));
    return {
      id: `${def.id}-${Date.now()}`,
      definitionId: def.id,
      kind: def.kind,
      name: def.name,
      status: "draft",
      confirmed: false,
      steps,
      createdAt: new Date().toISOString(),
      mode: this.baw.mode,
      label: this.baw.metaLabel(this.baw.mode !== "live"),
    };
  }

  private annotateRollback(run: WorkflowRun, failedIndex: number, reason: string): void {
    for (let i = 0; i < failedIndex; i++) {
      const s = run.steps[i];
      if (s.status === "done") {
        s.detail = `${s.detail ?? ""} | ROLLBACK NOTE: ${s.rollbackNote ?? "manual review"} (triggered by: ${reason})`;
      }
    }
  }

  async runWorkflow(def: WorkflowDefinition, opts: RunOptions): Promise<WorkflowRun> {
    const cfg = opts.cfg ?? this.cfg;
    const run = this.materialize(def);
    run.confirmed = opts.confirmed;
    this.runs.push(run);

    if (!opts.confirmed && cfg.requireWorkflowConfirm) {
      run.status = "awaiting_confirm";
      run.rejectReason = "workflow requires explicit confirm before execution";
      this.log(
        run,
        run.steps[0] ?? {
          id: "n/a",
          kind: "confirm",
          label: "confirm",
          notionalUsd: 0,
          status: "rejected",
        },
        "rejected",
        run.rejectReason
      );
      return run;
    }

    const gate = gateWorkflow({
      confirmed: opts.confirmed,
      estimatedNotionalUsd: def.estimatedNotionalUsd,
      stepCount: def.steps.length,
      state: this.riskState,
      cfg,
    });
    if (!gate.ok) {
      run.status = "rejected";
      run.rejectReason = gate.reason;
      run.finishedAt = new Date().toISOString();
      if (run.steps[0]) {
        run.steps[0].status = "rejected";
        run.steps[0].detail = gate.reason;
        this.log(run, run.steps[0], "rejected", gate.reason ?? "gate fail");
      }
      return run;
    }

    run.status = "running";

    for (let i = 0; i < run.steps.length; i++) {
      const step = run.steps[i];
      step.status = "running";
      step.startedAt = new Date().toISOString();

      const stepGate = gateStep({ step, state: this.riskState, cfg });
      if (!stepGate.ok) {
        step.status = "rejected";
        step.detail = stepGate.reason;
        step.finishedAt = new Date().toISOString();
        this.log(run, step, "rejected", stepGate.reason ?? "step gate fail");
        this.annotateRollback(run, i, stepGate.reason ?? "step gate");
        // Mark remaining as skipped
        for (let j = i + 1; j < run.steps.length; j++) {
          run.steps[j].status = "skipped";
          run.steps[j].detail = "skipped after prior rejection";
        }
        run.status = "rejected";
        run.rejectReason = stepGate.reason;
        run.finishedAt = new Date().toISOString();
        return run;
      }

      const exec = await this.executeStep(step);
      step.finishedAt = new Date().toISOString();

      if (!exec.ok) {
        step.status = "rejected";
        step.detail = exec.detail;
        this.log(run, step, "rejected", exec.detail);
        this.annotateRollback(run, i, exec.detail);
        for (let j = i + 1; j < run.steps.length; j++) {
          run.steps[j].status = "skipped";
          run.steps[j].detail = "skipped after prior rejection";
        }
        run.status = "rejected";
        run.rejectReason = exec.detail;
        run.finishedAt = new Date().toISOString();
        return run;
      }

      step.status = "done";
      step.amountOut = exec.amountOut;
      step.detail = exec.detail;
      recordStep(this.riskState);
      this.log(run, step, "done", exec.detail);
    }

    run.status = "completed";
    run.finishedAt = new Date().toISOString();
    return run;
  }

  private async executeStep(
    step: WorkflowStep
  ): Promise<{ ok: boolean; detail: string; amountOut?: number }> {
    switch (step.kind) {
      case "confirm":
        return { ok: true, detail: "confirmed" };

      case "check_cap": {
        const bucket =
          step.label.toLowerCase().includes("swap") || step.assetOut === "ETH"
            ? "swap"
            : "defi";
        const res = await this.baw.checkCap({
          bucket: bucket as "swap" | "defi" | "x402",
          notionalUsd: step.notionalUsd,
        });
        return {
          ok: res.ok,
          detail: res.label,
        };
      }

      case "approve": {
        const res = await this.baw.approve({
          asset: step.assetIn ?? "ETH",
          amount: step.amountIn ?? 0,
        });
        return { ok: res.ok, detail: res.label };
      }

      case "swap": {
        // Cap check baked into adapter
        const res = await this.baw.swap({
          fromAsset: step.assetIn ?? "USDT",
          toAsset: step.assetOut ?? "ETH",
          amountIn: step.amountIn ?? 0,
          notionalUsd: step.notionalUsd,
        });
        return {
          ok: res.ok,
          detail: res.label,
          amountOut: res.data.amountOut,
        };
      }

      case "stake": {
        const res = await this.baw.stake({
          assetIn: step.assetIn ?? "ETH",
          assetOut: step.assetOut ?? "stETH",
          amountIn: step.amountIn ?? 0,
          notionalUsd: step.notionalUsd,
        });
        return {
          ok: res.ok,
          detail: res.label,
          amountOut: res.data.amountOut,
        };
      }

      case "unstake": {
        const res = await this.baw.unstake({
          assetIn: step.assetIn ?? "stETH",
          assetOut: step.assetOut ?? "ETH",
          amountIn: step.amountIn ?? 0,
          notionalUsd: step.notionalUsd,
        });
        return {
          ok: res.ok,
          detail: res.label,
          amountOut: res.data.amountOut,
        };
      }

      case "transfer_internal":
        return {
          ok: true,
          detail: "PAPER internal transfer (no external withdrawal) — no-op ledger",
        };

      default:
        return { ok: false, detail: `unknown step kind: ${step.kind}` };
    }
  }
}
