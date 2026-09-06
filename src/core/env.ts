/** Safe env reads for CLI (process) and Vite browser (import.meta.env). */
export function envStr(key: string, fallback = ""): string {
  try {
    if (typeof process !== "undefined" && process.env && process.env[key] != null) {
      return String(process.env[key]);
    }
  } catch {
    /* ignore */
  }
  try {
    const meta = import.meta as ImportMeta & { env?: Record<string, string> };
    if (meta.env && meta.env[key] != null) return String(meta.env[key]);
  } catch {
    /* ignore */
  }
  return fallback;
}

export function envNum(key: string, fallback: number): number {
  const v = envStr(key, "");
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function envBool(key: string, fallback = false): boolean {
  const v = envStr(key, "").toLowerCase();
  if (!v) return fallback;
  return v === "1" || v === "true" || v === "yes";
}
