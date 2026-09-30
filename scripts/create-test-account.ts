// Creates (or resets) a test login with a fully set-up, seeded household.
//
//   • A Clerk user with an email + password (a +clerk_test address: in a Clerk
//     development instance it needs no inbox; any email code is 424242).
//   • Its household: the full demo data (family, documents, vehicles, bills,
//     subscriptions, pantry, recipes, meal plans, obligations), every Setup step
//     complete, NOT marked as demo (so Ask, ordering and calls behave for real).
//   • Stores point at SNAPSERVE_DEMO_VENDOR_PHONE (a phone that plays the shop),
//     and the ordering phone is TEST_ORDERING_PHONE (yours; defaults to the
//     vendor phone), the number allowed to order by calling the Snapserve line.
//
// Usage (from apps/api): node_modules/.bin/tsx ../../scripts/create-test-account.ts [email]
// Prints the email and password. Re-running resets the household and password.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

for (const p of ["../../.env", ".env"]) {
  const full = path.resolve(process.cwd(), p);
  try {
    if (fs.existsSync(full)) {
      for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !m[1].startsWith("#") && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
      }
    }
  } catch {
    // ignore unreadable env files
  }
}

import { demoState } from "../apps/api/src/demo-state.js";
import { defaultStateBackend } from "../apps/api/src/state-backend.js";

const DEFAULT_EMAIL = "test.household+clerk_test@livora.app";

async function clerk<T>(method: string, pathname: string, body?: unknown): Promise<T> {
  const key = process.env.CLERK_SECRET_KEY?.trim();
  if (!key) throw new Error("CLERK_SECRET_KEY is not set.");
  const res = await fetch(`https://api.clerk.com/v1${pathname}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Clerk ${method} ${pathname} failed (${res.status}): ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

/** Readable but strong: e.g. "Livora-7k3q-9xw2-Tm4p!" */
const newPassword = () => {
  const b = crypto.randomBytes(9).toString("base64url").replace(/[-_]/g, "x");
  return `Livora-${b.slice(0, 4)}-${b.slice(4, 8)}-${b.slice(8, 12)}!`;
};

async function main() {
  if (!process.env.CLERK_SECRET_KEY?.startsWith("sk_test_")) {
    throw new Error("Refusing to run: this creates a test login and is meant for a Clerk development instance (sk_test_).");
  }
  const email = (process.argv[2] || DEFAULT_EMAIL).toLowerCase();
  const password = newPassword();

  const found = await clerk<Array<{ id: string }>>("GET", `/users?email_address=${encodeURIComponent(email)}&limit=1`);
  let userId = found[0]?.id;
  if (userId) {
    await clerk("PATCH", `/users/${userId}`, { password, skip_password_checks: true, sign_out_of_other_sessions: true });
  } else {
    userId = (
      await clerk<{ id: string }>("POST", "/users", {
        email_address: [email],
        first_name: "Test",
        last_name: "Household",
        password,
        skip_password_checks: true,
      })
    ).id;
  }
  const check = await clerk<{ verified: boolean }>("POST", `/users/${userId}/verify_password`, { password });
  if (!check.verified) throw new Error("Clerk did not accept the new password.");

  // The household: full demo data, treated as a real household.
  const state = demoState();
  state.isDemo = false;
  // Stores ring the vendor test phone; the ordering line accepts calls from your own phone.
  const phone = process.env.SNAPSERVE_DEMO_VENDOR_PHONE?.trim() || null;
  const orderingPhone = process.env.TEST_ORDERING_PHONE?.trim() || phone;
  if (phone) for (const v of state.vendors) v.phoneE164 = phone;
  const owner = state.members.find((m) => m.role === "OWNER") ?? state.members[0];
  if (owner && orderingPhone) {
    owner.phoneE164 = orderingPhone;
    owner.phone = orderingPhone;
  }
  if (state.profile) state.profile.startedAt ??= new Date().toISOString();

  const backend = defaultStateBackend();
  await backend.save(userId, state);
  const saved = await backend.load(userId);
  if (!saved) throw new Error("The household could not be read back after saving.");

  console.log("Test account ready");
  console.log(`  email:    ${email}`);
  console.log(`  password: ${password}`);
  console.log(`  user id:  ${userId}`);
  console.log(`  storage:  ${process.env.DATABASE_URL ? "Postgres (DATABASE_URL)" : "local files"}`);
  console.log(
    `  household: ${saved.members.length} people, ${saved.resources.length} pantry items, ${saved.vendors.length} stores, ` +
      `${saved.obligations.length} bills/reminders, ${saved.profile?.vehicles.length ?? 0} vehicles, ${saved.profile?.documents.length ?? 0} documents`,
  );
  console.log(`  store phone:    ${phone ?? "unchanged (SNAPSERVE_DEMO_VENDOR_PHONE not set)"}`);
  console.log(`  ordering phone: ${orderingPhone ?? "not set"}`);
  console.log("If Clerk asks for an email code on a new device, enter 424242.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
