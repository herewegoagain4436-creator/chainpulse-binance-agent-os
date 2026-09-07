import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { pathToFileURL } from "node:url";
import path from "node:path";

function bawApiPlugin() {
  return {
    name: "baw-api",
    configureServer(server: { middlewares: { use: Function } }) {
      server.middlewares.use(async (req: { url?: string; method?: string }, res: {
        setHeader: Function;
        end: Function;
        statusCode: number;
      }, next: Function) => {
        if (!req.url?.startsWith("/api/baw")) return next();
        if (req.method === "GET" && req.url.startsWith("/api/baw/status")) {
          try {
            const mod = await import(pathToFileURL(path.resolve("scripts/baw-api-handler.mjs")).href);
            const status = mod.handleBawApi(["wallet", "status"]);
            const address = mod.handleBawApi(["wallet", "address"]);
            const balance = mod.handleBawApi(["wallet", "balance"]);
            const settings = mod.handleBawApi(["wallet", "settings"]);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true, status, address, balance, settings }));
          } catch (e) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: false, label: String(e) }));
          }
          return;
        }
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("method not allowed");
          return;
        }
        const chunks: Buffer[] = [];
        (req as unknown as NodeJS.ReadableStream).on("data", (c: Buffer) => chunks.push(c));
        (req as unknown as NodeJS.ReadableStream).on("end", async () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as { args?: string[] };
            const mod = await import(pathToFileURL(path.resolve("scripts/baw-api-handler.mjs")).href);
            const result = mod.handleBawApi(body.args || []);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(result));
          } catch (e) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: false, data: null, raw: "", label: String(e), code: "BAW_API_ERROR" }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), bawApiPlugin()],
  root: ".",
  publicDir: "public",
  server: { port: 5174, host: true },
  build: { outDir: "dist", sourcemap: true },
});
