import type { WorkflowRun } from "../../core/types";

export function WorkflowList({ workflows }: { workflows: WorkflowRun[] }) {
  return (
    <div className="card">
      <h2>Workflow list</h2>
      {workflows.length === 0 ? (
        <p className="sub">No workflows yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Kind</th>
              <th>Status</th>
              <th>Steps</th>
              <th>Mode</th>
            </tr>
          </thead>
          <tbody>
            {workflows.map((w) => (
              <tr key={w.id}>
                <td>
                  <div>{w.name}</div>
                  <div className="mono" style={{ color: "var(--muted)", fontSize: "0.72rem" }}>
                    {w.id}
                  </div>
                  {w.rejectReason ? (
                    <div className="bad" style={{ fontSize: "0.78rem", marginTop: 4 }}>
                      {w.rejectReason}
                    </div>
                  ) : null}
                </td>
                <td className="mono">{w.kind}</td>
                <td className={`status-${w.status}`}>{w.status}</td>
                <td className="mono">
                  {w.steps.filter((s) => s.status === "done").length}/{w.steps.length}
                </td>
                <td className="mono">{w.mode}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {workflows.length > 0 ? (
        <div style={{ marginTop: 12 }}>
          <h2>Step detail (latest)</h2>
          <table>
            <thead>
              <tr>
                <th>Step</th>
                <th>Kind</th>
                <th>Status</th>
                <th>Notional</th>
                <th>Detail / rollback</th>
              </tr>
            </thead>
            <tbody>
              {workflows[workflows.length - 1].steps.map((s) => (
                <tr key={s.id}>
                  <td>{s.label}</td>
                  <td className="mono">{s.kind}</td>
                  <td className={`status-${s.status}`}>{s.status}</td>
                  <td className="mono">${s.notionalUsd}</td>
                  <td className="sub" style={{ fontSize: "0.78rem" }}>
                    {s.detail}
                    {s.rollbackNote ? (
                      <div style={{ marginTop: 4 }}>rollback: {s.rollbackNote}</div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
