import { useEffect, useRef, useState } from "react";
import { WorkflowOrchestrator } from "../core/orchestrator";
import {
  overCapSwapWorkflow,
  stakeEthWorkflow,
  swapThenStakeWorkflow,
} from "../core/workflows";
import { DEFAULT_RISK } from "../core/risk";
import type { OrchestratorSnapshot, WorkflowRun } from "../core/types";
import { WorkflowList } from "./components/WorkflowList";
import { StepLog } from "./components/StepLog";
import { WalletPanel } from "./components/WalletPanel";
import { BawStatus } from "./components/BawStatus";

function freshOrch() {
  return new WorkflowOrchestrator();
}

export function App() {
  const orchRef = useRef<WorkflowOrchestrator>(freshOrch());
  const [snap, setSnap] = useState<OrchestratorSnapshot>(() =>
    orchRef.current.snapshot()
  );
  const [loading, setLoading] = useState(false);
  const [last, setLast] = useState<WorkflowRun | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    setSnap(orchRef.current.snapshot());
  }
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const baw = orchRef.current.baw;
        const r = await baw.refreshLive();
        if (cancelled) return;
        await baw.getBalances();
        if (cancelled) return;
        setSnap(orchRef.current.snapshot());
        if (!r.ok) setError(r.label);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, []);


  async function runDemoSuite() {
    setLoading(true);
    setError(null);
    try {
      orchRef.current = freshOrch();
      const orch = orchRef.current;
      const a = await orch.runWorkflow(
        stakeEthWorkflow({ ethAmount: 0.5, id: "ui-stake" }),
        { confirmed: true }
      );
      const b = await orch.runWorkflow(
        swapThenStakeWorkflow({ usdtAmount: 1500, id: "ui-swap-stake" }),
        { confirmed: true }
      );
      const c = await orch.runWorkflow(
        overCapSwapWorkflow({ usdtAmount: 75_000, id: "ui-over-cap" }),
        {
          confirmed: true,
          cfg: { ...DEFAULT_RISK, maxNotionalPerStepUsd: 100_000 },
        }
      );
      setLast(c);
      refresh();
      void a;
      void b;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function runOne(kind: "stake" | "swap-stake" | "over-cap") {
    setLoading(true);
    setError(null);
    try {
      const orch = orchRef.current;
      const def =
        kind === "stake"
          ? stakeEthWorkflow({ id: `ui-${kind}-${Date.now()}` })
          : kind === "swap-stake"
            ? swapThenStakeWorkflow({ id: `ui-${kind}-${Date.now()}` })
            : overCapSwapWorkflow({
                usdtAmount: 75_000,
                id: `ui-${kind}-${Date.now()}`,
              });
      const cfg =
        kind === "over-cap"
          ? { ...DEFAULT_RISK, maxNotionalPerStepUsd: 100_000 }
          : undefined;
      const run = await orch.runWorkflow(def, { confirmed: true, cfg });
      setLast(run);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app">
      <header>
        <div>
          <h1>
            Chain<span>Pulse</span>
          </h1>
          <p className="sub">
            Automated on-chain workflows (swap / stake / DeFi) via Binance
            Agentic Wallet CLI (baw). LIVE-first on BSC with documented daily
            caps and App confirmations. Auth: baw auth signin → App QR →
            verify (Hub Connect alone is not enough). Pending ≠ filled
            success. Not CEX news trading; not A2A micropay (x402 = quota
            only). MCP optional for CEX context — hosts flexible.
          </p>
        </div>
        <div className="actions">
          <span className="badge">mode: live</span>
          <span className="badge">BAW primary</span>
          <button onClick={runDemoSuite} disabled={loading}>
            {loading ? "Running…" : "Run demo suite"}
          </button>
        </div>
      </header>

      <div className="grid" style={{ marginBottom: 14 }}>
        <div className="card half">
          <h2>Quick actions</h2>
          <div className="actions">
            <button
              className="secondary"
              disabled={loading}
              onClick={() => runOne("stake")}
            >
              Stake ETH
            </button>
            <button
              className="secondary"
              disabled={loading}
              onClick={() => runOne("swap-stake")}
            >
              Swap → Stake
            </button>
            <button
              className="secondary"
              disabled={loading}
              onClick={() => runOne("over-cap")}
            >
              Over-cap (expect reject)
            </button>
          </div>
          {last ? (
            <p className="sub mono" style={{ marginTop: 10 }}>
              Last:{" "}
              <span className={`status-${last.status}`}>{last.status}</span> —{" "}
              {last.name}
            </p>
          ) : (
            <p className="sub" style={{ marginTop: 10 }}>
              Run the demo suite or a single workflow. Each run requires
              confirm=true.
            </p>
          )}
          {error ? <p className="bad">{error}</p> : null}
        </div>
        <BawStatus snap={snap} />
      </div>

      <div className="grid">
        <WalletPanel balances={snap.balances} live note="live baw balances via adapter" />
        <WorkflowList workflows={snap.workflows} />
        <StepLog entries={snap.stepLog} />
      </div>

      <p className="disclaimer">
        Not financial advice. LIVE uses baw CLI / App confirmations — mutates
        label PENDING until confirmed (never fake fills). Paper only when
        CHAINPULSE_MODE=paper. Documented quotas (defaults, not guarantees):
        swap ~$50k / DeFi ~$5k / x402 ~$20 per day. Confirm in the Binance
        App. No withdrawal scope. See JUDGE.md for the 60–90s demo path.
      </p>
    </div>
  );
}
