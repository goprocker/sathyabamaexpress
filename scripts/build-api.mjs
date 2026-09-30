// Bundles the API (apps/api plus the shared workspace packages and every npm
// dependency) into one self-contained CommonJS file for the Vercel function.
//
// Why: the workspace packages point their entry at raw .ts files, which Vercel's
// function packaging cannot load at runtime. A single bundle has nothing left to
// resolve, so the function boots the same way everywhere.
//
// Run automatically by api/package.json ("vercel-build") right before Vercel
// packages api/index.js. Run it yourself with `pnpm build:api`.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outfile = path.join(root, "api", "_server.cjs");

const result = await build({
  entryPoints: [path.join(root, "apps/api/src/vercel-entry.ts")],
  outfile,
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  // pg tries to load its optional native addon and falls back cleanly when it is absent.
  external: ["pg-native"],
  legalComments: "none",
  logLevel: "warning",
  metafile: true,
});

const kb = Math.round(Object.values(result.metafile.outputs)[0].bytes / 1024);
console.log(`[build-api] wrote ${path.relative(root, outfile)} (${kb} KB)`);
