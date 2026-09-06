/**
 * Binance Wallet Agentic Hub (BAW) adapter — ChainPulse primary rail.
 *
 * Hub: https://web3.binance.com/agentic-hub
 * Paper/mock: balances, approve, stake, unstake, swap, daily caps, kill-switch.
 *
 * Documented daily caps below are from public Agent OS / Agentic Wallet materials —
 * labeled as documented defaults, NOT invented guarantees. Confirm live quotas in App.
 *
 * @see https://web3.binance.com/agentic-hub
 * @see ../../AGENT_OS_NOTES.md
 */
import { envNum, envStr } from "../core/env.js";
import type { WalletBalance } from "../core/types.js";
import prices from "../data/fixtures/prices.json";

export const BAW_HUB_URL = envStr(
  "BINANCE_BAW_HUB_URL",
  "https://web3.binance.com/agentic-hub"
);

/**
 * Documented defaults from public Binance Agent OS / Agentic Wallet coverage
 * (swap / DeFi / x402 daily caps). Not contractual guarantees — confirm in App.
 */
export const BAW_DOCUMENTED_DAILY_CAPS_USD = {
  /** Regular token swaps (documented default) */
  swap: 50_000,
  /** DeFi operations e.g. stake/unstake (documented default; App may show lower user quota) */
  defi: 100_000,
  /** x402-style agent payments (documented default) */
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
  status: "APPROVED_PAPER" | "APPROVED_MOCK" | "REJECTED";
}

export interface StakeAck {
  stakeId: string;
  assetIn: string;
  assetOut: string;
  amountIn: number;
  amountOut: number;
  notionalUsd: number;
  status: "FILLED_PAPER" | "SUBMITTED_MOCK" | "REJECTED";
}

export interface UnstakeAck {
  unstakeId: string;
  assetIn: string;
  assetOut: string;
  amountIn: number;
  amountOut: number;
  notionalUsd: number;
  status: "FILLED_PAPER" | "SUBMITTED_MOCK" | "REJECTED";
}

export interface SwapAck {
  swapId: string;
  fromAsset: string;
  toAsset: string;
  amountIn: number;
  amountOut: number;
  notionalUsd: number;
  status: "FILLED_PAPER" | "SUBMITTED_MOCK" | "REJECTED";
  remainingCapUsd: number;
}

function modeFromEnv(): BawMode {
  const m = envStr("CHAINPULSE_MODE", "paper").toLowerCase();
  if (m === "live" || m === "mock" || m === "paper") return m;
  return "paper";
}

function utcDayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function priceOf(asset: string): number {
  const key = asset.toUpperCase() as keyof typeof prices;
  return (prices as Record<string, number>)[key] ?? 1;
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

  constructor(opts?: { hubUrl?: string; mode?: BawMode }) {
    this.hubUrl = opts?.hubUrl ?? BAW_HUB_URL;
    this.mode = opts?.mode ?? modeFromEnv();
    this.balances = {
      ETH: envNum("PAPER_ETH", 5),
      USDT: envNum("PAPER_USDT", 25_000),
      BNB: envNum("PAPER_BNB", 10),
      STETH: envNum("PAPER_STETH", 0),
    };
  }

  metaLabel(usedMock: boolean): string {
    if (this.mode === "paper") {
      return "PAPER SIM (BAW) — local wallet ledger; Agentic Hub unused";
    }
    if (this.mode === "mock" || usedMock) {
      return "MOCK (BAW) — Agentic Hub not in-process; not live on-chain";
    }
    return "LIVE via Binance Wallet Agentic Hub — swaps/DeFi under documented daily caps + App confirmations";
  }

  status() {
    this.rollDayIfNeeded();
    return {
      rail: "BAW" as const,
      hubUrl: this.hubUrl,
      mode: this.mode,
      killSwitch: this.killSwitchOn,
      documentedCapsUsd: { ...BAW_DOCUMENTED_DAILY_CAPS_USD },
      spentUsd: { ...this.spent },
      remainingUsd: {
        swap: Math.max(0, BAW_DOCUMENTED_DAILY_CAPS_USD.swap - this.spent.swap),
        defi: Math.max(0, BAW_DOCUMENTED_DAILY_CAPS_USD.defi - this.spent.defi),
        x402: Math.max(0, BAW_DOCUMENTED_DAILY_CAPS_USD.x402 - this.spent.x402),
      },
      label: this.metaLabel(this.mode !== "live"),
      note: "Caps are documented defaults from public materials — not invented guarantees; confirm in Binance App / wallet settings.",
      noWithdrawals: true,
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
    return Math.max(0, BAW_DOCUMENTED_DAILY_CAPS_USD[bucket] - this.spent[bucket]);
  }

  async getBalances(): Promise<BawAdapterResult<WalletBalance[]>> {
    const data: WalletBalance[] = Object.entries(this.balances).map(([asset, free]) => ({
      asset,
      free,
      locked: 0,
      staked: this.staked[asset],
    }));
    return {
      data,
      usedMock: this.mode !== "live",
      label:
        this.mode === "paper"
          ? "PAPER SIM balances (BAW local ledger)"
          : "MOCK balances — live Agentic Hub unavailable in-process",
      hubUrl: this.hubUrl,
      rail: "BAW",
      ok: true,
    };
  }

  /** Snapshot balances synchronously for orchestrator / UI. */
  snapshotBalances(): WalletBalance[] {
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

  async checkCap(opts: {
    bucket: CapBucket;
    notionalUsd: number;
  }): Promise<BawAdapterResult<{ withinCap: boolean; remainingUsd: number; documentedCapUsd: number }>> {
    this.rollDayIfNeeded();
    if (this.killSwitchOn) {
      return {
        data: {
          withinCap: false,
          remainingUsd: this.remainingCap(opts.bucket),
          documentedCapUsd: BAW_DOCUMENTED_DAILY_CAPS_USD[opts.bucket],
        },
        usedMock: this.mode !== "live",
        label: "BAW cap check FAIL — kill-switch engaged",
        hubUrl: this.hubUrl,
        rail: "BAW",
        ok: false,
      };
    }
    const remaining = this.remainingCap(opts.bucket);
    const within = opts.notionalUsd <= remaining;
    return {
      data: {
        withinCap: within,
        remainingUsd: remaining,
        documentedCapUsd: BAW_DOCUMENTED_DAILY_CAPS_USD[opts.bucket],
      },
      usedMock: this.mode !== "live",
      label: within
        ? `BAW cap OK — ${opts.bucket} remaining $${remaining} (documented default $${BAW_DOCUMENTED_DAILY_CAPS_USD[opts.bucket]}/day)`
        : `BAW cap REJECT — $${opts.notionalUsd} exceeds ${opts.bucket} remaining $${remaining} (documented default $${BAW_DOCUMENTED_DAILY_CAPS_USD[opts.bucket]}/day)`,
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
    const spender = opts.spender ?? "PaperProtocol";
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
      label: `MOCK BAW approve — hub not in-process`,
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
        `BAW stake REJECTED — DeFi daily cap (documented default $${BAW_DOCUMENTED_DAILY_CAPS_USD.defi}/day)`
      );
    }

    // 1:1 paper liquid-stake with tiny haircut on receipt
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
      label: "MOCK BAW stake — hub not in-process",
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
        `BAW unstake REJECTED — DeFi daily cap (documented default $${BAW_DOCUMENTED_DAILY_CAPS_USD.defi}/day)`
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
      label: "MOCK BAW unstake — hub not in-process",
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
    const from = opts.fromAsset.toUpperCase();
    const to = opts.toAsset.toUpperCase();
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
        `BAW swap REJECTED — would exceed documented swap daily cap ($${BAW_DOCUMENTED_DAILY_CAPS_USD.swap}/day default); remaining $${remaining}`
      );
    }

    const pxFrom = priceOf(from);
    const pxTo = priceOf(to);
    const amountOut = (opts.amountIn * pxFrom) / pxTo * 0.999; // 10 bps fee paper

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
      label: "MOCK BAW swap — hub not in-process",
      hubUrl: this.hubUrl,
      rail: "BAW",
      ok: true,
    };
  }
}
