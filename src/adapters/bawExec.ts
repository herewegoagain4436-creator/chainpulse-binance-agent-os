import { envStr } from "../core/env.js";

export type BawExecResult =
  | { ok: true; data: unknown; raw: string }
  | { ok: false; data: null; raw: string; label: string; code?: string };

export type BawExecOk = Extract<BawExecResult, { ok: true }>;
export type BawExecErr = Extract<BawExecResult, { ok: false }>;

type SyncRunner = (args: string[]) => BawExecResult;

declare global {
  // eslint-disable-next-line no-var
  var __chainpulseBawJsonSync: SyncRunner | undefined;
}

export function resolveBawBin(): string | null {
  const fromEnv = envStr("BAW_BIN", "").trim();
  if (fromEnv) return fromEnv;
  if (typeof process !== "undefined" && process.versions?.node) {
    return "/home/box/.local/bin/baw";
  }
  return null;
}

export function installBawSyncRunner(runner: SyncRunner): void {
  globalThis.__chainpulseBawJsonSync = runner;
}

export function bawJsonSync(args: string[]): BawExecResult {
  const runner = globalThis.__chainpulseBawJsonSync;
  if (runner) {
    return runner(args);
  }
  return {
    ok: false,
    data: null,
    raw: "",
    label: "BAW_RUNNER_MISSING",
    code: "BAW_RUNNER_MISSING",
  };
}

export async function bawJson(args: string[]): Promise<BawExecResult> {
  const inBrowser = typeof window !== "undefined" && typeof document !== "undefined";
  if (!inBrowser) return bawJsonSync(args);
  try {
    const res = await fetch("/api/baw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ args }),
    });
    const body = (await res.json()) as BawExecResult & { error?: string };
    if (!res.ok || body.ok === false) {
      const err = body as BawExecErr;
      return {
        ok: false,
        data: null,
        raw: err.raw ?? "",
        label: err.label ?? body.error ?? ("BAW_API_HTTP_" + String(res.status)),
        code: err.code ?? "BAW_API_ERROR",
      };
    }
    return body as BawExecOk;
  } catch (e) {
    return {
      ok: false,
      data: null,
      raw: "",
      label: "BAW_API_UNAVAILABLE — " + (e instanceof Error ? e.message : String(e)),
      code: "BAW_API_UNAVAILABLE",
    };
  }
}
