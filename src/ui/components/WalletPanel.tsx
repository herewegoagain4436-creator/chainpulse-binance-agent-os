import type { WalletBalance } from "../../core/types";

export function WalletPanel({ balances }: { balances: WalletBalance[] }) {
  return (
    <div className="card half">
      <h2>Wallet balances (paper)</h2>
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
          {balances.map((b) => (
            <tr key={b.asset}>
              <td className="mono">{b.asset}</td>
              <td className="mono">{b.free}</td>
              <td className="mono">{b.locked}</td>
              <td className="mono">{b.staked ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="sub" style={{ marginTop: 8 }}>
        Local BAW ledger only — not live on-chain balances. No external withdrawals.
      </p>
    </div>
  );
}
