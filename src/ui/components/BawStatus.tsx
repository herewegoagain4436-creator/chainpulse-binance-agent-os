import type { OrchestratorSnapshot } from "../../core/types";

export function BawStatus({ snap }: { snap: OrchestratorSnapshot }) {
  const baw = snap.bawStatus as {
    hubUrl?: string;
    mode?: string;
    killSwitch?: boolean;
    documentedCapsUsd?: { swap: number; defi: number; x402: number };
    remainingUsd?: { swap: number; defi: number; x402: number };
    label?: string;
    note?: string;
  };
  const mcp = snap.mcpNote as {
    endpoint?: string;
    oauthClientId?: string;
    label?: string;
  };

  return (
    <div className="card half">
      <h2>BAW status</h2>
      <p className="mono">{baw.hubUrl}</p>
      <p className="sub">
        mode={baw.mode} · kill-switch={String(baw.killSwitch)} · steps today=
        {snap.risk.stepsToday}/{snap.risk.maxStepsPerDay}
      </p>
      <p className="sub">
        documented caps (defaults): swap ${baw.documentedCapsUsd?.swap}/d · defi $
        {baw.documentedCapsUsd?.defi}/d · x402 ${baw.documentedCapsUsd?.x402}/d
      </p>
      <p className="sub">
        remaining: swap ${baw.remainingUsd?.swap} · defi ${baw.remainingUsd?.defi} · x402 $
        {baw.remainingUsd?.x402}
      </p>
      <p className="sub">{baw.label}</p>
      <p className="sub" style={{ marginTop: 10 }}>
        <strong>MCP (optional):</strong> {mcp.endpoint} · oauth_client_id=
        {mcp.oauthClientId}
      </p>
      <p className="sub">{mcp.label}</p>
    </div>
  );
}
