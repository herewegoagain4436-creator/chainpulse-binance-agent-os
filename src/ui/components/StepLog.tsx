import type { StepLogEntry } from "../../core/types";

export function StepLog({ entries }: { entries: StepLogEntry[] }) {
  const latest = entries.slice(-40).reverse();
  return (
    <div className="card">
      <h2>Step log</h2>
      {latest.length === 0 ? (
        <p className="sub">Empty — run a workflow to populate.</p>
      ) : (
        latest.map((e, i) => (
          <div className="log-line" key={`${e.at}-${e.stepId}-${i}`}>
            <strong className={`status-${e.status}`}>{e.status}</strong>{" "}
            <span className="pill">{e.kind}</span> {e.message}
            {e.notionalUsd != null ? (
              <span> · ${e.notionalUsd}</span>
            ) : null}
            {e.rationaleWhy ? (
              <div style={{ fontSize: "0.72rem", marginTop: 2 }}>why: {e.rationaleWhy}</div>
            ) : null}
            <div style={{ fontSize: "0.7rem" }}>
              {e.at} · wf={e.workflowId} · step={e.stepId}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
