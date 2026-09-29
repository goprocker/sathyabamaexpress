// One-off diagnostic: fetch call details + DID registry from Snapserve.
import fs from "node:fs";
import path from "node:path";

for (const p of ["../../.env", ".env"]) {
  const full = path.resolve(process.cwd(), p);
  try {
    if (fs.existsSync(full)) {
      for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !m[1].startsWith("#") && !process.env[m[1]]) {
          process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
        }
      }
    }
  } catch {
    // ignore
  }
}

const key = process.env.SNAPSERVE_API_KEY;
const base = (process.env.SNAPSERVE_BASE_URL || "https://app.snapserve.ai/api").replace(/\/$/, "");
if (!key) {
  console.error("No SNAPSERVE_API_KEY");
  process.exit(1);
}

async function get(pathName: string) {
  const res = await fetch(`${base}${pathName}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  console.log(`\n── GET ${pathName} → ${res.status}`);
  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2).slice(0, 2500));
  } catch {
    console.log(text.slice(0, 800));
  }
}

const callId = process.argv[2];

async function main() {
  await get(`/calls/${callId}`);
  await get(`/phone-numbers`);
}

main().catch((err) => {
  console.error("diag failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
