// One-off: place a real Snapserve outbound call for the pending purchase
// action, with the vendor phone overridden from the CLI arg.
// Usage: pnpm exec tsx scripts/place-call.ts +91963285979
import fs from "node:fs";
import path from "node:path";

// Minimal .env loader (dotenv isn't resolvable from the root scripts dir)
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
    // ignore unreadable env files
  }
}

import { db } from "@household/db";
import { runActionApprovalAndExecutionWorkflow } from "@household/agents";

async function main() {
  const toNumber = process.argv[2];
  if (!toNumber || !/^\+\d{10,15}$/.test(toNumber)) {
    console.error("Usage: pnpm exec tsx scripts/place-call.ts +91XXXXXXXXXX");
    process.exit(1);
  }

  const state = db.getState();
  let pending = state.actions.find((a) => a.status === "PENDING_APPROVAL");
  if (!pending) {
    // A previous dial attempt may have left the action FAILED — restore it.
    const retryable = state.actions.find(
      (a) => a.status === "FAILED" || a.status === "CONFIRMED"
    );
    if (retryable) {
      console.log(`Restoring action ${retryable.id} from ${retryable.status} for redial…`);
      db.mutate((draft) => {
        const act = draft.actions.find((a) => a.id === retryable.id)!;
        act.status = "PENDING_APPROVAL";
        act.externalCallId = null;
        act.externalCallStatus = null;
        act.callSteps = [];
        act.outcome = null;
      });
      pending = db.getState().actions.find((a) => a.id === retryable.id);
    }
  }
  if (!pending) {
    console.error("No retryable action found. Plan a meal first.");
    process.exit(1);
  }

  console.log(`Action:  ${pending.id} — ${pending.title}`);
  console.log(`Order:   ${pending.items.map((i) => `${i.orderDisplay} ${i.name}`).join(" + ")}`);
  console.log(`Calling: ${toNumber} (real Snapserve agent line)\n`);

  // Override the vendor phone so the agent dials the requested number,
  // and drop the stale vendor agent id so the ACTIVE account agent is used.
  pending.targetVendor = {
    ...pending.targetVendor!,
    phoneE164: toNumber,
    snapserveAgentId: undefined,
  };

  const result = await runActionApprovalAndExecutionWorkflow(db, {
    actionId: pending.id,
    userId: "usr_sai_001",
    stepDelayMs: 0,
    onBroadcast: (type, payload) => {
      if (type === "SNAPSERVE_CALL_PROGRESS") {
        console.log(`  [call] ${payload.status} — ${payload.label}`);
      }
    },
  });

  console.log("\n── Outcome ────────────────────────────────────────");
  console.log(`Call ID:   ${result.action.externalCallId}`);
  console.log(`Status:    ${result.action.externalCallStatus}`);
  console.log(`Summary:   ${result.outcome.vendorResponseSummary}`);
  console.log(`Delivery:  ${result.outcome.deliveryEta}`);
  console.log("\n── Transcript ─────────────────────────────────────");
  console.log(result.outcome.transcript);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Call failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
