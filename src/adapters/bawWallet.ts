/**
 * Binance Agentic Wallet (baw CLI) adapter — ChainPulse primary rail.
 * LIVE-first: shells to `baw --json` via bawExec. Paper only when CHAINPULSE_MODE=paper.
 * Never returns PAPER SIM fills when mode is live.
 *
 * Auth: baw auth signin → Binance App QR → baw auth verify (Hub Connect alone is not enough).
 * Real quotas (confirm in App): swap ~50k / defi ~5k / x402 ~20 USD/day.
 */
import { envNum, envStr } from "../core/env.js";
import type { WalletBalance } from "../core/types.js";
import prices from "../data/fixtures/prices.json";
import { bawJson, bawJsonSync, resolveBawBin } from "./bawExec.js";

export const BAW_HUB_URL = envStr(
  "BINANCE_BAW_HUB_URL",
  "https://web3.binance.com/agentic-hub"
);

/** BSC constants */
export const BSC_CHAIN_ID = "56";
export const USDT_BSC = "0x55d398326f99059fF775485246999027B3197955";
export const NATIVE_BNB = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

/**
 * Real / documented daily caps from Agentic Wallet settings (not invented guarantees).
 * Confirm live left-quota in App / `baw wallet settings --json`.
 */
export const BAW_DOCUMENTED_DAILY_CAPS_USD = {
  swap: 50_000,
  defi: 5_000,
  x402: 20,
} as const;

export type BawMode = "paper" | "mock" | "live";
export type CapBucket = keyof typeof BAW_DOCUMENTED_DAILY_CAPS_USD;

export interface BawAdapterResult<T> {
  data: T;
  usedMock: boolean;
  label: string;
  hubUrl: string;
  rail: "BAW";
  ok: boolean;
}

export interface ApproveAck {
  approvalId: string;
  asset: string;
  spender: string;
  amount: number;
  status: "APPROVED_PAPER" | "APPROVED_MOCK" | "APPROVED_LIVE" | "REJECTED";
}

export interface StakeAck {
  stakeId: string;
  assetIn: string;
  assetOut: string;
  amountIn: number;
  amountOut: number;
  notionalUsd: number;
  status: "FILLED_PAPER" | "SUBMITTED_MOCK" | "PENDING" | "REJECTED";
  investmentId?: string;
}

export interface UnstakeAck {
  unstakeId: string;
  assetIn: string;
  assetOut: string;
  amountIn: number;
  amountOut: number;
  notionalUsd: number;
  status: "FILLED_PAPER" | "SUBMITTED_MOCK" | "PENDING" | "REJECTED";
}

export interface SwapAck {
  swapId: string;
  fromAsset: string;
  toAsset: string;
  amountIn: number;
  amountOut: number;
  notionalUsd: number;
  status: "FILLED_PAPER" | "SUBMITTED_MOCK" | "PENDING" | "REJECTED";
  remainingCapUsd: number;
}

export interface QuoteAck {
  fromAsset: string;
  toAsset: string;
  amountIn: number;
  amountOut: number;
  slippage?: number;
  raw?: unknown;
}

function modeFromEnv(): BawMode {
  const m = envStr("CHAINPULSE_MODE", "live").toLowerCase();
  if (m === "paper" || m === "mock" || m === "live") return m;
  return "live";
}

function utcDayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function priceOf(asset: string): number {
  const key = asset.toUpperCase() as keyof typeof prices;
  return (prices as Record<string, number>)[key] ?? 1;
}

function tokenAddress(asset: string): string {
  const a = asset.toUpperCase();
  if (a === "USDT") return USDT_BSC;
  if (a === "BNB" || a === "ETH" || a === "NATIVE") return NATIVE_BNB;
  if (asset.startsWith("0x") || asset.startsWith("0X")) return asset;
  return asset;
}

function assetSymbol(asset: string): string {
  const a = asset.toUpperCase();
  if (a === "ETH") return "BNB";
  return a;
}

export class BawWalletAdapter {
  readonly hubUrl: string;
  readonly mode: BawMode;
  private killSwitchOn = false;
  private spendDay = utcDayKey();
  private spent: Record<CapBucket, number> = { swap: 0, defi: 0, x402: 0 };
  private allowances: Record<string, number> = {};
  private balances: Record<string, number>;
  private staked: Record<string, number> = { STETH: 0 };
  private liveConnection: string = "UNKNOWN";
  private liveAddress: string = "";
  private liveBalances: WalletBalance[] = [];
  private liveCaps: Record<CapBucket, number> = { ...BAW_DOCUMENTED_DAILY_CAPS_USD };
  private liveRemaining: Record<CapBucket, number> = { ...BAW_DOCUMENTED_DAILY_CAPS_USD };
  private liveReady = false;
  private lastLiveLabel = "";

  constructor(opts?: { hubUrl?: string; mode?: BawMode }) {
    this.hubUrl = opts?.hubUrl ?? BAW_HUB_URL;
    this.mode = opts?.mode ?? modeFromEnv();
    this.balances = {
      ETH: envNum("PAPER_ETH", 5),
      USDT: envNum("PAPER_USDT", 25_000),
      BNB: envNum("PAPER_BNB", 10),
      STETH: envNum("PAPER_STETH", 0),
    };
    if (this.mode === "live") {
      this.refreshLiveSync();
    }
  }

  metaLabel(usedMock: boolean): string {
    if (this.mode === "paper") {
      return "PAPER SIM (BAW) — CHAINPULSE_MODE=paper escape hatch; Agentic Hub unused";
    }
    if (this.mode === "mock" || usedMock) {
      return "MOCK (BAW) — not live on-chain";
    }
    if (this.liveConnection && this.liveConnection !== "CONNECTED") {
      return `LIVE — wallet ${this.liveConnection || "UNCONNECTED"} (baw auth signin → App QR → verify)`;
    }
    return this.lastLiveLabel || "LIVE via baw CLI — BSC swaps/DeFi under real daily quotas + App confirmations";
  }

  get connectionStatus(): string {
    return this.mode === "live" ? this.liveConnection : this.mode.toUpperCase();
  }

  get bscAddress(): string {
    return this.liveAddress;
  }

  /** Sync live snapshot (Node + baw-bridge). Safe no-op labels when runner missing. */
  refreshLiveSync(): BawAdapterResult<{ connectionStatus: string; address: string }> {
    if (this.mode !== "live") {
      return {
        data: { connectionStatus: this.mode, address: "" },
        usedMock: true,
        label: `skip live refresh — mode=${this.mode}`,
        hubUrl: this.hubUrl,
        rail: "BAW",
        ok: true,
      };
    }
    const bin = resolveBawBin();
    if (!bin && !globalThis.__chainpulseBawJsonSync) {
      this.liveConnection = "BAW_MISSING";
      this.lastLiveLabel = "BAW_MISSING — install baw or set BAW_BIN; not falling back to paper";
      return {
        data: { connectionStatus: "BAW_MISSING", address: "" },
        usedMock: false,
        label: this.lastLiveLabel,
        hubUrl: this.hubUrl,
        rail: "BAW",
        ok: false,
      };
    }

    const st = bawJsonSync(["wallet", "status"]);
    if (!st.ok) {
      this.liveConnection = st.code === "BAW_RUNNER_MISSING" ? "BAW_RUNNER_MISSING" : "UNCONNECTED";
      this.lastLiveLabel = st.label;
      return {
        data: { connectionStatus: this.liveConnection, address: "" },
        usedMock: false,
        label: st.label,
        hubUrl: this.hubUrl,
        rail: "BAW",
        ok: false,
      };
    }
    const stData = st.data as { status?: string; connectionStatus?: string };
    this.liveConnection = (stData.status || stData.connectionStatus || "UNKNOWN").toUpperCase();
    if (this.liveConnection !== "CONNECTED") {
      this.lastLiveLabel = `UNCONNECTED — baw wallet status=${this.liveConnection}. Auth: baw auth signin → App QR → baw auth verify`;
      return {
        data: { connectionStatus: this.liveConnection, address: "" },
        usedMock: false,
        label: this.lastLiveLabel,
        hubUrl: this.hubUrl,
        rail: "BAW",
        ok: false,
      };
    }

    const addr = bawJsonSync(["wallet", "address"]);
    if (addr.ok) {
      const addresses = (addr.data as { addresses?: Array<{ binanceChainId?: string; address?: string }> })
        ?.addresses;
      const bsc = addresses?.find((a) => String(a.binanceChainId) === BSC_CHAIN_ID);
      this.liveAddress = bsc?.address || addresses?.[0]?.address || "";
    }

    const bal = bawJsonSync(["wallet", "balance"]);
    if (bal.ok && Array.isArray(bal.data)) {
      this.liveBalances = (bal.data as Array<{ symbol?: string; balance?: string }>).map((row) => ({
        asset: (row.symbol || "?").toUpperCase(),
        free: Number(row.balance || 0),
        locked: 0,
      }));
      for (const b of this.liveBalances) {
        this.balances[b.asset] = b.free;
      }
    }

    const settings = bawJsonSync(["wallet", "settings"]);
    if (settings.ok && settings.data && typeof settings.data === "object") {
      const s = settings.data as Record<string, number>;
      if (typeof s.dailyLimit === "number") this.liveCaps.swap = s.dailyLimit;
      if (typeof s.defiDailyLimit === "number") this.liveCaps.defi = s.defiDailyLimit;
      if (typeof s.x402DailyLimit === "number") this.liveCaps.x402 = s.x402DailyLimit;
      if (typeof s.quotaLeft === "number") this.liveRemaining.swap = s.quotaLeft;
      if (typeof s.defiQuotaLeft === "number") this.liveRemaining.defi = s.defiQuotaLeft;
      if (typeof s.x402QuotaLeft === "number") this.liveRemaining.x402 = s.x402QuotaLeft;
      if (typeof s.quotaUsed === "number") this.spent.swap = s.quotaUsed;
      if (typeof s.defiQuotaUsed === "number") this.spent.defi = s.defiQuotaUsed;
      if (typeof s.x402QuotaUsed === "number") this.spent.x402 = s.x402QuotaUsed;
    } else {
      const q = bawJsonSync(["wallet", "left-quota"]);
      if (q.ok && q.data && typeof q.data === "object") {
        const qd = q.data as { quotaLeft?: number; dailyLimit?: number; quotaUsed?: number };
        if (typeof qd.dailyLimit === "number") this.liveCaps.swap = qd.dailyLimit;
        if (typeof qd.quotaLeft === "number") this.liveRemaining.swap = qd.quotaLeft;
        if (typeof qd.quotaUsed === "number") this.spent.swap = qd.quotaUsed;
      }
    }

    this.liveReady = true;
    this.lastLiveLabel = `LIVE CONNECTED — BSC ${this.liveAddress || "(no address)"} via baw`;
    return {
      data: { connectionStatus: "CONNECTED", address: this.liveAddress },
      usedMock: false,
      label: this.lastLiveLabel,
      hubUrl: this.hubUrl,
      rail: "BAW",
      ok: true,
    };
  }

  async refreshLive(): Promise<BawAdapterResult<{ connectionStatus: string; address: string }>> {
    if (this.mode !== "live") return this.refreshLiveSync();
    // Prefer async path (browser /api/baw) then mirror into caches via sync helper fields
    const st = await bawJson(["wallet", "status"]);
    if (!st.ok) {
      this.liveConnection = "UNCONNECTED";
      this.lastLiveLabel = st.label;
      return {
        data: { connectionStatus: "UNCONNECTED", address: "" },
        usedMock: false,
        label: st.label,
        hubUrl: this.hubUrl,
        rail: "BAW",
        ok: false,
      };
    }
    // Re-use sync parser by temporarily installing a one-shot runner is heavy;
    // call refreshLiveSync when Node runner present, else parse here.
    if (globalThis.__chainpulseBawJsonSync) {
      return this.refreshLiveSync();
    }
    const stData = st.data as { status?: string; connectionStatus?: string };
    this.liveConnection = (stData.status || stData.connectionStatus || "UNKNOWN").toUpperCase();
    const addr = await bawJson(["wallet", "address"]);
    if (addr.ok) {
      const addresses = (addr.data as { addresses?: Array<{ binanceChainId?: string; address?: string }> })
        ?.addresses;
      const bsc = addresses?.find((a) => String(a.binanceChainId) === BSC_CHAIN_ID);
      this.liveAddress = bsc?.address || "";
    }
    const bal = await bawJson(["wallet", "balance"]);
    if (bal.ok && Array.isArray(bal.data)) {
      this.liveBalances = (bal.data as Array<{ symbol?: string; balance?: string }>).map((row) => ({
        asset: (row.symbol || "?").toUpperCase(),
        free: Number(row.balance || 0),
        locked: 0,
      }));
    }
    const settings = await bawJson(["wallet", "settings"]);
    if (settings.ok && settings.data && typeof settings.data === "object") {
      const s = settings.data as Record<string, number>;
      if (typeof s.dailyLimit === "number") this.liveCaps.swap = s.dailyLimit;
      if (typeof s.defiDailyLimit === "number") this.liveCaps.defi = s.defiDailyLimit;
      if (typeof s.x402DailyLimit === "number") this.liveCaps.x402 = s.x402DailyLimit;
      if (typeof s.quotaLeft === "number") this.liveRemaining.swap = s.quotaLeft;
      if (typeof s.defiQuotaLeft === "number") this.liveRemaining.defi = s.defiQuotaLeft;
      if (typeof s.x402QuotaLeft === "number") this.liveRemaining.x402 = s.x402QuotaLeft;
    }
    this.liveReady = this.liveConnection === "CONNECTED";
    this.lastLiveLabel =
      this.liveConnection === "CONNECTED"
        ? `LIVE CONNECTED — BSC ${this.liveAddress || "(no address)"} via baw`
        : `UNCONNECTED — ${this.liveConnection}`;
    return {
      data: { connectionStatus: this.liveConnection, address: this.liveAddress },
      usedMock: false,
      label: this.lastLiveLabel,
      hubUrl: this.hubUrl,
      rail: "BAW",
      ok: this.liveConnection === "CONNECTED",
    };
  }

  status() {
    this.rollDayIfNeeded();
    const caps = this.mode === "live" ? this.liveCaps : { ...BAW_DOCUMENTED_DAILY_CAPS_USD };
    const remaining =
      this.mode === "live"
        ? { ...this.liveRemaining }
        : {
            swap: Math.max(0, caps.swap - this.spent.swap),
            defi: Math.max(0, caps.defi - this.spent.defi),
            x402: Math.max(0, caps.x402 - this.spent.x402),
          };
    return {
      rail: "BAW" as const,
      hubUrl: this.hubUrl,
      mode: this.mode,
      killSwitch: this.killSwitchOn,
      connectionStatus: this.mode === "live" ? this.liveConnection : this.mode.toUpperCase(),
      address: this.liveAddress,
      chainId: BSC_CHAIN_ID,
      documentedCapsUsd: { ...caps },
      spentUsd: { ...this.spent },
      remainingUsd: remaining,
      label: this.metaLabel(this.mode !== "live"),
      note:
        "Caps from Agentic Wallet settings / public defaults — not invented guarantees; confirm in Binance App. Auth = baw auth signin → App QR → verify. Live mutates label PENDING until App confirms — never silent FILLED.",
      noWithdrawals: true,
      liveReady: this.liveReady,
    };
  }

  setKillSwitch(on: boolean): BawAdapterResult<{ killSwitch: boolean }> {
    this.killSwitchOn = on;
    return {
      data: { killSwitch: this.killSwitchOn },
      usedMock: this.mode !== "live",
      label: on ? "BAW kill-switch ON — all wallet ops blocked" : "BAW kill-switch OFF",
      hubUrl: this.hubUrl,
      rail: "BAW",
      ok: true,
    };
  }

  getKillSwitch(): boolean {
    return this.killSwitchOn;
  }

  private rollDayIfNeeded(): void {
    const today = utcDayKey();
    if (today !== this.spendDay) {
      this.spendDay = today;
      this.spent = { swap: 0, defi: 0, x402: 0 };
    }
  }

  remainingCap(bucket: CapBucket): number {
    this.rollDayIfNeeded();
    if (this.mode === "live") return Math.max(0, this.liveRemaining[bucket] ?? 0);
    return Math.max(0, BAW_DOCUMENTED_DAILY_CAPS_USD[bucket] - this.spent[bucket]);
  }

  async getBalances(): Promise<BawAdapterResult<WalletBalance[]>> {
    if (this.mode === "live") {
      const refreshed = await this.refreshLive();
      if (!refreshed.ok) {
        return {
          data: this.liveBalances,
          usedMock: false,
          label: refreshed.label,
          hubUrl: this.hubUrl,
          rail: "BAW",
          ok: false,
        };
      }
      return {
        data: this.liveBalances.length ? this.liveBalances : this.snapshotBalances(),
        usedMock: false,
        label: `LIVE balances — ${this.liveBalances.map((b) => `${b.asset}=${b.free}`).join(", ") || "empty"}`,
        hubUrl: this.hubUrl,
        rail: "BAW",
        ok: true,
      };
    }
    const data: WalletBalance[] = Object.entries(this.balances).map(([asset, free]) => ({
      asset,
      free,
      locked: 0,
      staked: this.staked[asset],
    }));
    return {
      data,
      usedMock: this.mode !== "paper",
      label:
        this.mode === "paper"
          ? "PAPER SIM balances (BAW local ledger)"
          : "MOCK balances — not live",
      hubUrl: this.hubUrl,
      rail: "BAW",
      ok: true,
    };
  }

  snapshotBalances(): WalletBalance[] {
    if (this.mode === "live" && this.liveBalances.length) {
      return [...this.liveBalances];
    }
    return Object.entries(this.balances).map(([asset, free]) => ({
      asset,
      free,
      locked: 0,
      staked: this.staked[asset],
    }));
  }

  private reject<T extends { status: "REJECTED" }>(
    data: T,
    label: string
  ): BawAdapterResult<T> {
    return {
      data,
      usedMock: this.mode !== "live",
      label,
      hubUrl: this.hubUrl,
      rail: "BAW",
      ok: false,
    };
  }

  private liveGate(op: string): BawAdapterResult<null> | null {
    if (this.mode !== "live") return null;
    if (this.killSwitchOn) {
      return {
        data: null,
        usedMock: false,
        label: `BAW ${op} REJECTED — kill-switch`,
        hubUrl: this.hubUrl,
        rail: "BAW",
        ok: false,
      };
    }
    if (this.liveConnection !== "CONNECTED") {
      this.refreshLiveSync();
    }
    if (this.liveConnection !== "CONNECTED") {
      return {
        data: null,
        usedMock: false,
        label:
          this.lastLiveLabel ||
          `BAW ${op} blocked — ${this.liveConnection || "UNCONNECTED"} (not falling back to paper)`,
        hubUrl: this.hubUrl,
        rail: "BAW",
        ok: false,
      };
    }
    return null;
  }

  async checkCap(opts: {
    bucket: CapBucket;
    notionalUsd: number;
  }): Promise<BawAdapterResult<{ withinCap: boolean; remainingUsd: number; documentedCapUsd: number }>> {
    this.rollDayIfNeeded();
    if (this.mode === "live") {
      await this.refreshLive();
    }
    if (this.killSwitchOn) {
      return {
        data: {
          withinCap: false,
          remainingUsd: this.remainingCap(opts.bucket),
          documentedCapUsd: this.liveCaps[opts.bucket] ?? BAW_DOCUMENTED_DAILY_CAPS_USD[opts.bucket],
        },
        usedMock: this.mode !== "live",
        label: "BAW cap check FAIL — kill-switch engaged",
        hubUrl: this.hubUrl,
        rail: "BAW",
        ok: false,
      };
    }
    const cap = this.mode === "live" ? this.liveCaps[opts.bucket] : BAW_DOCUMENTED_DAILY_CAPS_USD[opts.bucket];
    const remaining = this.remainingCap(opts.bucket);
    const within = opts.notionalUsd <= remaining;
    return {
      data: { withinCap: within, remainingUsd: remaining, documentedCapUsd: cap },
      usedMock: this.mode !== "live",
      label: within
        ? `BAW cap OK — ${opts.bucket} remaining $${remaining} (cap $${cap}/day)`
        : `BAW cap REJECT — $${opts.notionalUsd} exceeds ${opts.bucket} remaining $${remaining} (cap $${cap}/day)`,
      hubUrl: this.hubUrl,
      rail: "BAW",
      ok: within,
    };
  }

  async approve(opts: {
    asset: string;
    amount: number;
    spender?: string;
  }): Promise<BawAdapterResult<ApproveAck>> {
    const asset = opts.asset.toUpperCase();
    const spender = opts.spender ?? "AgenticProtocol";
    const clientId = `apr-${Date.now()}`;

    if (this.killSwitchOn) {
      return this.reject(
        {
          approvalId: `REJ-${clientId}`,
          asset,
          spender,
          amount: opts.amount,
          status: "REJECTED" as const,
        },
        "BAW approve REJECTED — kill-switch"
      );
    }

    if (this.mode === "live") {
      const gate = this.liveGate("approve");
      if (gate) {
        return this.reject(
          {
            approvalId: `REJ-${clientId}`,
            asset,
            spender,
            amount: opts.amount,
            status: "REJECTED" as const,
          },
          gate.label
        );
      }
      return {
        data: {
          approvalId: `LIVE-${clientId}`,
          asset,
          spender,
          amount: opts.amount,
          status: "APPROVED_LIVE",
        },
        usedMock: false,
        label: `LIVE approve implicit (not a fill) — baw market-order/defi handles allowance for ${opts.amount} ${asset}; mutating steps still need App confirm`,
        hubUrl: this.hubUrl,
        rail: "BAW",
        ok: true,
      };
    }

    const key = `${asset}:${spender}`;
    this.allowances[key] = (this.allowances[key] ?? 0) + opts.amount;

    if (this.mode === "paper") {
      return {
        data: {
          approvalId: `PAPER-${clientId}`,
          asset,
          spender,
          amount: opts.amount,
          status: "APPROVED_PAPER",
        },
        usedMock: false,
        label: `PAPER SIM BAW approve ${opts.amount} ${asset} → ${spender}`,
        hubUrl: this.hubUrl,
        rail: "BAW",
        ok: true,
      };
    }

    return {
      data: {
        approvalId: `MOCK-${clientId}`,
        asset,
        spender,
        amount: opts.amount,
        status: "APPROVED_MOCK",
      },
      usedMock: true,
      label: `MOCK BAW approve`,
      hubUrl: this.hubUrl,
      rail: "BAW",
      ok: true,
    };
  }

  async quoteSwap(opts: {
    fromAsset: string;
    toAsset: string;
    amountIn: number;
  }): Promise<BawAdapterResult<QuoteAck>> {
    const from = assetSymbol(opts.fromAsset);
    const to = assetSymbol(opts.toAsset);
    if (this.mode === "live") {
      const gate = this.liveGate("quote");
      if (gate) {
        return {
          data: { fromAsset: from, toAsset: to, amountIn: opts.amountIn, amountOut: 0 },
          usedMock: false,
          label: gate.label,
          hubUrl: this.hubUrl,
          rail: "BAW",
          ok: false,
        };
      }
      const res = await bawJson([
        "market-order",
        "quote",
        "--binanceChainId",
        BSC_CHAIN_ID,
        "--fromTokenQty",
        String(opts.amountIn),
        "--fromToken",
        tokenAddress(from),
        "--toToken",
        tokenAddress(to),
      ]);
      if (!res.ok) {
        return {
          data: { fromAsset: from, toAsset: to, amountIn: opts.amountIn, amountOut: 0 },
          usedMock: false,
          label: res.label,
          hubUrl: this.hubUrl,
          rail: "BAW",
          ok: false,
        };
      }
      const d = res.data as {
        fromCoinAmount?: string;
        toCoinAmount?: string;
        slippage?: number;
      };
      const amountOut = Number(d.toCoinAmount || 0);
      return {
        data: {
          fromAsset: from,
          toAsset: to,
          amountIn: opts.amountIn,
          amountOut,
          slippage: d.slippage,
          raw: res.data,
        },
        usedMock: false,
        label: `LIVE quote ${opts.amountIn} ${from} → ${amountOut} ${to}`,
        hubUrl: this.hubUrl,
        rail: "BAW",
        ok: true,
      };
    }
    const amountOut = (opts.amountIn * priceOf(from)) / priceOf(to) * 0.999;
    return {
      data: { fromAsset: from, toAsset: to, amountIn: opts.amountIn, amountOut },
      usedMock: this.mode !== "paper",
      label: `${this.mode.toUpperCase()} quote ${opts.amountIn} ${from} → ${amountOut.toFixed(6)} ${to}`,
      hubUrl: this.hubUrl,
      rail: "BAW",
      ok: true,
    };
  }

  async swap(opts: {
    fromAsset: string;
    toAsset: string;
    amountIn: number;
    notionalUsd: number;
  }): Promise<BawAdapterResult<SwapAck>> {
    this.rollDayIfNeeded();
    const from = assetSymbol(opts.fromAsset);
    const to = assetSymbol(opts.toAsset);
    const clientId = `swp-${Date.now()}`;

    if (this.killSwitchOn) {
      return this.reject(
        {
          swapId: `REJ-${clientId}`,
          fromAsset: from,
          toAsset: to,
          amountIn: opts.amountIn,
          amountOut: 0,
          notionalUsd: opts.notionalUsd,
          status: "REJECTED" as const,
          remainingCapUsd: this.remainingCap("swap"),
        },
        "BAW swap REJECTED — kill-switch"
      );
    }

    const remaining = this.remainingCap("swap");
    if (opts.notionalUsd > remaining) {
      return this.reject(
        {
          swapId: `REJ-${clientId}`,
          fromAsset: from,
          toAsset: to,
          amountIn: opts.amountIn,
          amountOut: 0,
          notionalUsd: opts.notionalUsd,
          status: "REJECTED" as const,
          remainingCapUsd: remaining,
        },
        `BAW swap REJECTED — exceeds swap daily cap; remaining $${remaining}`
      );
    }

    if (this.mode === "live") {
      const gate = this.liveGate("swap");
      if (gate) {
        return this.reject(
          {
            swapId: `REJ-${clientId}`,
            fromAsset: from,
            toAsset: to,
            amountIn: opts.amountIn,
            amountOut: 0,
            notionalUsd: opts.notionalUsd,
            status: "REJECTED" as const,
            remainingCapUsd: remaining,
          },
          gate.label
        );
      }
      const res = await bawJson([
        "market-order",
        "swap",
        "--binanceChainId",
        BSC_CHAIN_ID,
        "--fromTokenQty",
        String(opts.amountIn),
        "--fromToken",
        tokenAddress(from),
        "--toToken",
        tokenAddress(to),
      ]);
      if (!res.ok) {
        return this.reject(
          {
            swapId: `REJ-${clientId}`,
            fromAsset: from,
            toAsset: to,
            amountIn: opts.amountIn,
            amountOut: 0,
            notionalUsd: opts.notionalUsd,
            status: "REJECTED" as const,
            remainingCapUsd: remaining,
          },
          res.label
        );
      }
      const d = res.data as { orderId?: string; toCoinAmount?: string; amountOut?: string };
      const amountOut = Number(d.toCoinAmount ?? d.amountOut ?? 0);
      const swapId = String(d.orderId ?? `LIVE-${clientId}`);
      this.spent.swap += opts.notionalUsd;
      this.liveRemaining.swap = Math.max(0, this.liveRemaining.swap - opts.notionalUsd);
      await this.refreshLive();
      return {
        data: {
          swapId,
          fromAsset: from,
          toAsset: to,
          amountIn: opts.amountIn,
          amountOut,
          notionalUsd: opts.notionalUsd,
          status: "PENDING",
          remainingCapUsd: this.remainingCap("swap"),
        },
        usedMock: false,
        label: `PENDING — live swap submitted orderId=${swapId} ${opts.amountIn} ${from} → ~${amountOut} ${to}; awaiting Binance App confirmation / settlement (NOT a filled success)`,
        hubUrl: this.hubUrl,
        rail: "BAW",
        ok: true,
      };
    }

    const pxFrom = priceOf(from);
    const pxTo = priceOf(to);
    const amountOut = ((opts.amountIn * pxFrom) / pxTo) * 0.999;

    if (this.mode === "paper") {
      const have = this.balances[from] ?? 0;
      if (have < opts.amountIn) {
        return this.reject(
          {
            swapId: `REJ-${clientId}`,
            fromAsset: from,
            toAsset: to,
            amountIn: opts.amountIn,
            amountOut: 0,
            notionalUsd: opts.notionalUsd,
            status: "REJECTED" as const,
            remainingCapUsd: remaining,
          },
          `PAPER SIM BAW swap — insufficient ${from}`
        );
      }
      this.balances[from] = have - opts.amountIn;
      this.balances[to] = (this.balances[to] ?? 0) + amountOut;
      this.spent.swap += opts.notionalUsd;
      return {
        data: {
          swapId: `PAPER-${clientId}`,
          fromAsset: from,
          toAsset: to,
          amountIn: opts.amountIn,
          amountOut,
          notionalUsd: opts.notionalUsd,
          status: "FILLED_PAPER",
          remainingCapUsd: this.remainingCap("swap"),
        },
        usedMock: false,
        label: `PAPER SIM BAW swap ${opts.amountIn} ${from} → ${amountOut.toFixed(6)} ${to}`,
        hubUrl: this.hubUrl,
        rail: "BAW",
        ok: true,
      };
    }

    this.spent.swap += opts.notionalUsd;
    return {
      data: {
        swapId: `MOCK-${clientId}`,
        fromAsset: from,
        toAsset: to,
        amountIn: opts.amountIn,
        amountOut,
        notionalUsd: opts.notionalUsd,
        status: "SUBMITTED_MOCK",
        remainingCapUsd: this.remainingCap("swap"),
      },
      usedMock: true,
      label: "MOCK BAW swap — not live",
      hubUrl: this.hubUrl,
      rail: "BAW",
      ok: true,
    };
  }

  /** Discover Lista / helio USDT Earn investmentId on BSC. */
  async discoverListaUsdtInvestmentId(): Promise<BawAdapterResult<{ investmentId: string; protocolName?: string }>> {
    const fromEnv = envStr("LISTA_USDT_INVESTMENT_ID", "").trim();
    if (fromEnv) {
      return {
        data: { investmentId: fromEnv, protocolName: "env" },
        usedMock: false,
        label: `investmentId from LISTA_USDT_INVESTMENT_ID`,
        hubUrl: this.hubUrl,
        rail: "BAW",
        ok: true,
      };
    }
    if (this.mode !== "live") {
      return {
        data: { investmentId: "paper-lista-usdt" },
        usedMock: true,
        label: "paper investment id stub",
        hubUrl: this.hubUrl,
        rail: "BAW",
        ok: true,
      };
    }
    const res = await bawJson([
      "defi",
      "investment-list",
      "--investType",
      "Earn",
      "--binanceChainId",
      BSC_CHAIN_ID,
      "--contractAddresses",
      USDT_BSC,
      "--size",
      "20",
    ]);
    if (!res.ok) {
      return {
        data: { investmentId: "" },
        usedMock: false,
        label: res.label,
        hubUrl: this.hubUrl,
        rail: "BAW",
        ok: false,
      };
    }
    const payload = res.data as { list?: Array<Record<string, string>> };
    const list = payload.list ?? (Array.isArray(res.data) ? (res.data as Array<Record<string, string>>) : []);
    const hit =
      list.find(
        (i) =>
          /lista|helio/i.test(String(i.protocolName || "")) ||
          /lista|helio/i.test(String(i.defiProtocolId || ""))
      ) || list[0];
    if (!hit?.investmentId) {
      return {
        data: { investmentId: "" },
        usedMock: false,
        label: "No Lista/helio USDT Earn investment found",
        hubUrl: this.hubUrl,
        rail: "BAW",
        ok: false,
      };
    }
    return {
      data: {
        investmentId: hit.investmentId,
        protocolName: hit.protocolName || hit.defiProtocolId,
      },
      usedMock: false,
      label: `Discovered ${hit.protocolName || hit.defiProtocolId} USDT Earn investmentId=${hit.investmentId}`,
      hubUrl: this.hubUrl,
      rail: "BAW",
      ok: true,
    };
  }

  async defiPreviewDeposit(opts: {
    investmentId: string;
    amount: number;
    tokenAddress?: string;
  }): Promise<BawAdapterResult<unknown>> {
    if (this.mode !== "live") {
      return {
        data: { preview: "paper" },
        usedMock: true,
        label: "paper defi preview",
        hubUrl: this.hubUrl,
        rail: "BAW",
        ok: true,
      };
    }
    const gate = this.liveGate("defi-preview");
    if (gate) return { ...gate, data: null };
    const res = await bawJson([
      "defi",
      "preview",
      "--action",
      "deposit",
      "--investmentId",
      opts.investmentId,
      "--tokenAddress",
      opts.tokenAddress || USDT_BSC,
      "--amount",
      String(opts.amount),
      "--binanceChainId",
      BSC_CHAIN_ID,
    ]);
    return {
      data: res.data,
      usedMock: false,
      label: res.ok ? `LIVE defi preview deposit ${opts.amount}` : res.label,
      hubUrl: this.hubUrl,
      rail: "BAW",
      ok: res.ok,
    };
  }

  async defiDeposit(opts: {
    investmentId: string;
    amount: number;
    tokenAddress?: string;
  }): Promise<BawAdapterResult<StakeAck>> {
    const clientId = `dep-${Date.now()}`;
    if (this.mode !== "live") {
      return this.stake({
        assetIn: "USDT",
        assetOut: "aUSDT",
        amountIn: opts.amount,
        notionalUsd: opts.amount,
      });
    }
    const gate = this.liveGate("defi-deposit");
    if (gate) {
      return this.reject(
        {
          stakeId: `REJ-${clientId}`,
          assetIn: "USDT",
          assetOut: "Earn",
          amountIn: opts.amount,
          amountOut: 0,
          notionalUsd: opts.amount,
          status: "REJECTED" as const,
        },
        gate.label
      );
    }
    const preview = await this.defiPreviewDeposit(opts);
    if (!preview.ok) {
      return this.reject(
        {
          stakeId: `REJ-${clientId}`,
          assetIn: "USDT",
          assetOut: "Earn",
          amountIn: opts.amount,
          amountOut: 0,
          notionalUsd: opts.amount,
          status: "REJECTED" as const,
        },
        preview.label
      );
    }
    const res = await bawJson([
      "defi",
      "deposit",
      "--investmentId",
      opts.investmentId,
      "--tokenAddress",
      opts.tokenAddress || USDT_BSC,
      "--amount",
      String(opts.amount),
      "--binanceChainId",
      BSC_CHAIN_ID,
    ]);
    if (!res.ok) {
      return this.reject(
        {
          stakeId: `REJ-${clientId}`,
          assetIn: "USDT",
          assetOut: "Earn",
          amountIn: opts.amount,
          amountOut: 0,
          notionalUsd: opts.amount,
          status: "REJECTED" as const,
        },
        res.label
      );
    }
    const d = res.data as { txId?: string; orderId?: string };
    this.spent.defi += opts.amount;
    this.liveRemaining.defi = Math.max(0, this.liveRemaining.defi - opts.amount);
    return {
      data: {
        stakeId: String(d.txId || d.orderId || `LIVE-${clientId}`),
        assetIn: "USDT",
        assetOut: "Earn",
        amountIn: opts.amount,
        amountOut: opts.amount,
        notionalUsd: opts.amount,
        status: "PENDING",
        investmentId: opts.investmentId,
      },
      usedMock: false,
      label: `PENDING — live defi deposit ${opts.amount} USDT → investment ${opts.investmentId}; awaiting Binance App confirmation (NOT a filled success)`,
      hubUrl: this.hubUrl,
      rail: "BAW",
      ok: true,
    };
  }

  async stake(opts: {
    assetIn: string;
    assetOut?: string;
    amountIn: number;
    notionalUsd: number;
    investmentId?: string;
  }): Promise<BawAdapterResult<StakeAck>> {
    this.rollDayIfNeeded();
    const assetIn = opts.assetIn.toUpperCase();
    const assetOut = (opts.assetOut ?? "stETH").toUpperCase();
    const clientId = `stk-${Date.now()}`;

    if (this.killSwitchOn) {
      return this.reject(
        {
          stakeId: `REJ-${clientId}`,
          assetIn,
          assetOut,
          amountIn: opts.amountIn,
          amountOut: 0,
          notionalUsd: opts.notionalUsd,
          status: "REJECTED" as const,
        },
        "BAW stake REJECTED — kill-switch"
      );
    }

    const remaining = this.remainingCap("defi");
    if (opts.notionalUsd > remaining) {
      return this.reject(
        {
          stakeId: `REJ-${clientId}`,
          assetIn,
          assetOut,
          amountIn: opts.amountIn,
          amountOut: 0,
          notionalUsd: opts.notionalUsd,
          status: "REJECTED" as const,
        },
        `BAW stake REJECTED — DeFi daily cap remaining $${remaining}`
      );
    }

    if (this.mode === "live") {
      // Map live stake → Lista Earn USDT deposit when asset is USDT; otherwise reject clearly
      if (assetIn === "USDT" || opts.investmentId) {
        let investmentId = opts.investmentId || "";
        if (!investmentId) {
          const disc = await this.discoverListaUsdtInvestmentId();
          if (!disc.ok) {
            return this.reject(
              {
                stakeId: `REJ-${clientId}`,
                assetIn,
                assetOut,
                amountIn: opts.amountIn,
                amountOut: 0,
                notionalUsd: opts.notionalUsd,
                status: "REJECTED" as const,
              },
              disc.label
            );
          }
          investmentId = disc.data.investmentId;
        }
        return this.defiDeposit({ investmentId, amount: opts.amountIn });
      }
      return this.reject(
        {
          stakeId: `REJ-${clientId}`,
          assetIn,
          assetOut,
          amountIn: opts.amountIn,
          amountOut: 0,
          notionalUsd: opts.notionalUsd,
          status: "REJECTED" as const,
        },
        `LIVE stake for ${assetIn} not mapped — use USDT Lista Earn deposit (investmentId) on BSC`
      );
    }

    const amountOut = opts.amountIn * 0.999;
    if (this.mode === "paper") {
      const have = this.balances[assetIn] ?? 0;
      if (have < opts.amountIn) {
        return this.reject(
          {
            stakeId: `REJ-${clientId}`,
            assetIn,
            assetOut,
            amountIn: opts.amountIn,
            amountOut: 0,
            notionalUsd: opts.notionalUsd,
            status: "REJECTED" as const,
          },
          `PAPER SIM BAW stake — insufficient ${assetIn} (have ${have})`
        );
      }
      this.balances[assetIn] = have - opts.amountIn;
      this.balances[assetOut] = (this.balances[assetOut] ?? 0) + amountOut;
      this.staked[assetOut] = (this.staked[assetOut] ?? 0) + amountOut;
      this.spent.defi += opts.notionalUsd;
      return {
        data: {
          stakeId: `PAPER-${clientId}`,
          assetIn,
          assetOut,
          amountIn: opts.amountIn,
          amountOut,
          notionalUsd: opts.notionalUsd,
          status: "FILLED_PAPER",
        },
        usedMock: false,
        label: `PAPER SIM BAW stake ${opts.amountIn} ${assetIn} → ${amountOut.toFixed(6)} ${assetOut}`,
        hubUrl: this.hubUrl,
        rail: "BAW",
        ok: true,
      };
    }

    this.spent.defi += opts.notionalUsd;
    return {
      data: {
        stakeId: `MOCK-${clientId}`,
        assetIn,
        assetOut,
        amountIn: opts.amountIn,
        amountOut,
        notionalUsd: opts.notionalUsd,
        status: "SUBMITTED_MOCK",
      },
      usedMock: true,
      label: "MOCK BAW stake — not live",
      hubUrl: this.hubUrl,
      rail: "BAW",
      ok: true,
    };
  }

  async unstake(opts: {
    assetIn: string;
    assetOut?: string;
    amountIn: number;
    notionalUsd: number;
  }): Promise<BawAdapterResult<UnstakeAck>> {
    this.rollDayIfNeeded();
    const assetIn = opts.assetIn.toUpperCase();
    const assetOut = (opts.assetOut ?? "ETH").toUpperCase();
    const clientId = `ust-${Date.now()}`;

    if (this.killSwitchOn) {
      return this.reject(
        {
          unstakeId: `REJ-${clientId}`,
          assetIn,
          assetOut,
          amountIn: opts.amountIn,
          amountOut: 0,
          notionalUsd: opts.notionalUsd,
          status: "REJECTED" as const,
        },
        "BAW unstake REJECTED — kill-switch"
      );
    }

    const remaining = this.remainingCap("defi");
    if (opts.notionalUsd > remaining) {
      return this.reject(
        {
          unstakeId: `REJ-${clientId}`,
          assetIn,
          assetOut,
          amountIn: opts.amountIn,
          amountOut: 0,
          notionalUsd: opts.notionalUsd,
          status: "REJECTED" as const,
        },
        `BAW unstake REJECTED — DeFi daily cap remaining $${remaining}`
      );
    }

    if (this.mode === "live") {
      return this.reject(
        {
          unstakeId: `REJ-${clientId}`,
          assetIn,
          assetOut,
          amountIn: opts.amountIn,
          amountOut: 0,
          notionalUsd: opts.notionalUsd,
          status: "REJECTED" as const,
        },
        "LIVE unstake/redeem not auto-wired in demo — use baw defi redeem manually"
      );
    }

    const amountOut = opts.amountIn * 0.999;
    if (this.mode === "paper") {
      const have = this.balances[assetIn] ?? 0;
      if (have < opts.amountIn) {
        return this.reject(
          {
            unstakeId: `REJ-${clientId}`,
            assetIn,
            assetOut,
            amountIn: opts.amountIn,
            amountOut: 0,
            notionalUsd: opts.notionalUsd,
            status: "REJECTED" as const,
          },
          `PAPER SIM BAW unstake — insufficient ${assetIn}`
        );
      }
      this.balances[assetIn] = have - opts.amountIn;
      this.balances[assetOut] = (this.balances[assetOut] ?? 0) + amountOut;
      this.staked[assetIn] = Math.max(0, (this.staked[assetIn] ?? 0) - opts.amountIn);
      this.spent.defi += opts.notionalUsd;
      return {
        data: {
          unstakeId: `PAPER-${clientId}`,
          assetIn,
          assetOut,
          amountIn: opts.amountIn,
          amountOut,
          notionalUsd: opts.notionalUsd,
          status: "FILLED_PAPER",
        },
        usedMock: false,
        label: `PAPER SIM BAW unstake ${opts.amountIn} ${assetIn} → ${amountOut.toFixed(6)} ${assetOut}`,
        hubUrl: this.hubUrl,
        rail: "BAW",
        ok: true,
      };
    }

    this.spent.defi += opts.notionalUsd;
    return {
      data: {
        unstakeId: `MOCK-${clientId}`,
        assetIn,
        assetOut,
        amountIn: opts.amountIn,
        amountOut,
        notionalUsd: opts.notionalUsd,
        status: "SUBMITTED_MOCK",
      },
      usedMock: true,
      label: "MOCK BAW unstake — not live",
      hubUrl: this.hubUrl,
      rail: "BAW",
      ok: true,
    };
  }

  async listProtocols(): Promise<BawAdapterResult<unknown>> {
    if (this.mode !== "live") {
      return {
        data: [],
        usedMock: true,
        label: "paper protocol-list empty",
        hubUrl: this.hubUrl,
        rail: "BAW",
        ok: true,
      };
    }
    const res = await bawJson(["defi", "protocol-list", "--binanceChainId", BSC_CHAIN_ID]);
    return {
      data: res.data,
      usedMock: false,
      label: res.ok ? "LIVE defi protocol-list" : res.label,
      hubUrl: this.hubUrl,
      rail: "BAW",
      ok: res.ok,
    };
  }

  async listPositions(): Promise<BawAdapterResult<unknown>> {
    if (this.mode !== "live") {
      return {
        data: [],
        usedMock: true,
        label: "paper positions empty",
        hubUrl: this.hubUrl,
        rail: "BAW",
        ok: true,
      };
    }
    const res = await bawJson(["defi", "position", "--binanceChainId", BSC_CHAIN_ID]);
    return {
      data: res.data,
      usedMock: false,
      label: res.ok ? "LIVE defi position" : res.label,
      hubUrl: this.hubUrl,
      rail: "BAW",
      ok: res.ok,
    };
  }
}
