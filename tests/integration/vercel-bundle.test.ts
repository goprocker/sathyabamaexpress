import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(__dirname, "../..");

describe("Vercel API bundle", () => {
  it("builds one self-contained file that boots and answers on its own", () => {
    // The shared workspace packages point at raw .ts files, which a deployed function cannot load.
    // The bundle inlines them; this proves the deployed shape actually starts.
    execFileSync("node", ["scripts/build-api.mjs"], { cwd: root, stdio: "pipe" });

    const probe = `
      const http = require("node:http");
      const handler = require("./api/index.js");
      const server = http.createServer((req, res) => handler(req, res));
      server.listen(0, "127.0.0.1", async () => {
        const { port } = server.address();
        const res = await fetch("http://127.0.0.1:" + port + "/api/health");
        console.log(JSON.stringify({ status: res.status, isFunction: typeof handler === "function", body: await res.json() }));
        server.close();
        process.exit(0);
      });
    `;
    const out = execFileSync("node", ["-e", probe], {
      cwd: root,
      env: { ...process.env, VERCEL: "1", CLERK_SECRET_KEY: "", DATABASE_URL: "" },
      encoding: "utf8",
    });
    const result = JSON.parse(out.trim().split("\n").pop() ?? "{}") as { status: number; isFunction: boolean; body: { status: string } };
    assert.equal(result.isFunction, true, "api/index.js must export the request handler itself");
    assert.equal(result.status, 200);
    assert.equal(result.body.status, "ok");
  });
});
