import type { WalletBalance } from "../../core/types";

export function WalletPanel({
  balances,
  live,
  note,
}: {
  balances: WalletBalance[];
  live?: boolean;
  note?: string;
}) {
  return (
    <div className="card half">
      <h2>{live ? "Wallet balances (live baw)" : "Wallet balances"}</h2>
      <table>
        <thead>
          <tr>
            <th>Asset</th>
            <th>Free</th>
            <th>Locked</th>
            <th>Staked</th>
          </tr>
        </thead>
        <tbody>
          {balances.length === 0 ? (
            <tr>
              <td colSpan={4} className="sub">
                No balances yet — connect baw / fund BSC
              </td>
            </tr>
          ) : (
            balances.map((b) => (
              <tr key={b.asset}>
                <td className="mono">{b.asset}</td>
                <td className="mono">{b.free}</td>
                <td className="mono">{b.locked}</td>
                <td className="mono">{b.staked ?? "—"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <p className="sub" style={{ marginTop: 8 }}>
        {note ||
          (live
            ? "Live BSC balances from baw wallet balance — no external withdrawals."
            : "Local ledger (paper escape hatch).")}
      </p>
    </div>
  );
}
