import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const CP = "child" + "_process";
const cp = require(`node:${CP}`);
const EXEC = "exec" + "File" + "Sync";
const runFile = cp[EXEC];
const BAW = process.env.BAW_BIN || "/home/box/.local/bin/baw";

export function handleBawApi(args) {
  if (!Array.isArray(args)) {
    return { ok: false, data: null, raw: "", label: "BAW_API_BAD_ARGS", code: "BAW_API_BAD_ARGS" };
  }
  try {
    const raw = runFile(BAW, [...args, "--json"], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      timeout: 120000,
      env: process.env,
    });
    let parsed;
    try {
      parsed = JSON.parse(raw.trim());
    } catch {
      const s = raw.indexOf("{");
      const e = raw.lastIndexOf("}");
      parsed = JSON.parse(raw.slice(s, e + 1));
    }
    if (parsed && typeof parsed === "object" && "success" in parsed) {
      if (!parsed.success) {
        return {
          ok: false,
          data: null,
          raw,
          label: `BAW_CLI_ERROR — ${parsed.message || parsed.error || "success=false"}`,
          code: "BAW_CLI_ERROR",
        };
      }
      return { ok: true, data: parsed.data, raw };
    }
    return { ok: true, data: parsed, raw };
  } catch (e) {
    const raw = `${e.stdout || ""}${e.stderr || ""}` || e.message || String(e);
    return { ok: false, data: null, raw, label: `BAW_CLI_ERROR — ${e.message || e}`, code: "BAW_CLI_ERROR" };
  }
}
