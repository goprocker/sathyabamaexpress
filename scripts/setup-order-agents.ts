// One-off (re-runnable) Snapserve setup for phone ordering.
//
//   • "Household Orders"       answers the household's number, takes the order,
//                               reads it back and gets a yes (inbound).
//   • "Household Store Caller" calls stores from the same number to buy it
//                               (outbound; the API fills {{order_script}} etc.).
//
// Snapserve allows one agent per number (both directions), so the number moves
// to "Household Orders"; the store caller dials out on Snapserve's shared caller
// ID. Existing agents with these names are updated in place, so running it
// twice is safe. (Snapserve ignores dispositionSchema/status on create, so they
// are always applied with a PATCH.)
//
// Usage (from apps/api): node_modules/.bin/tsx ../../scripts/setup-order-agents.ts +918071581642
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

import {
  assignSnapservePhoneNumber,
  createSnapserveAgent,
  getSnapserveAgent,
  listSnapserveAgents,
  listSnapservePhoneNumbers,
  updateSnapserveAgent,
} from "@household/integrations";

const ORDER_AGENT = "Household Orders";
const STORE_AGENT = "Household Store Caller";

const ORDER_PROMPT = `# ROLE
You are the household's grocery ordering assistant. The person calling is a member of the household. They call you to order groceries and household items; after the call, the system phones the right local store and places the order for them.

# HOW TO TAKE THE ORDER
1. Ask what they need. They may speak English, Tamil or a mix (Tanglish) — reply in the language they use.
2. For every item get a quantity and unit (kg, g, litre, ml, packet, dozen, pieces). If a quantity is missing, ask ("How much rice — 1 kg or 5 kg?").
3. If they name a particular store, or a delivery time, note it. Do not ask for either if they don't mention it.
4. Read the whole list back in one sentence: "So that's 2 kg rice, 1 litre milk and 6 eggs. Shall I place the order?"
5. If they say yes: say "Done. I'll call the store now — you'll see it in your app." Then end the call.
6. If they change something, update the list and read it back again. If they say no or cancel, say "Okay, I won't order anything." and end the call.

# RULES
- Never make up prices, stock or delivery times; the store call will confirm those.
- Never say the order is placed before they say yes.
- Keep every reply short: one or two sentences.`;

const STORE_PROMPT = `# ROLE
You are calling a local store on behalf of a household to order groceries for home delivery. You are polite, brief and clear. You speak Tamil-English (Tanglish) naturally and switch to whatever language the shopkeeper uses.

# THIS ORDER
Store: {{vendor_name}}
Items: {{order_summary}}
Opening line to use: {{order_script}}

# HOW TO RUN THE CALL
1. Greet and place the order using the opening line.
2. Confirm each item is available. If something isn't, note it and continue; do not agree to a substitute unless it is clearly the same thing in a different pack size.
3. Ask for the total bill amount and the delivery time, and repeat both back.
4. If asked for the address or name, say the family orders from them regularly and they have the details; if the shop still needs them, say the family will call back with them.
5. Thank them and end the call.

# RULES
- Only order the items listed above, in those quantities.
- Never share payment details. Payment is cash or UPI on delivery.
- Keep replies short.`;

const ORDER_DISPOSITION = [
  {
    key: "order_items",
    label: "Items ordered, exactly as confirmed, formatted 'quantity unit item' separated by semicolons (e.g. 2 kg rice; 1 litre milk; 6 eggs). Empty if nothing was ordered.",
    type: "text",
  },
  { key: "order_confirmed", label: "Caller clearly said yes to placing the order after it was read back", type: "boolean" },
  { key: "preferred_store", label: "Store name the caller asked to order from, or empty", type: "text" },
  { key: "delivery_note", label: "Delivery time or instruction the caller gave, or empty", type: "text" },
];

const STORE_DISPOSITION = [
  { key: "order_accepted", label: "Store agreed to deliver the order", type: "boolean" },
  { key: "total_amount", label: "Total bill amount the store quoted, in rupees, or empty", type: "text" },
  { key: "delivery_time", label: "Delivery time the store promised, or empty", type: "text" },
  { key: "unavailable_items", label: "Items the store said are not available, or empty", type: "text" },
];

async function upsert(name: string, template: Record<string, unknown>, config: Record<string, unknown>) {
  const existing = (await listSnapserveAgents()).find((a) => a.name === name);
  if (existing) {
    await updateSnapserveAgent(existing.id, config);
    console.log(`Updated agent ${existing.id} "${name}"`);
    return existing.id;
  }
  const pick = (k: string) => (template[k] !== undefined && template[k] !== null ? { [k]: template[k] } : {});
  const created = await createSnapserveAgent({
    name,
    ...["asrProvider", "asrModel", "asrLanguage", "llmProvider", "llmModel", "ttsProvider", "ttsVoice", "ttsModel", "telephonyProvider"]
      .reduce((acc, k) => ({ ...acc, ...pick(k) }), {}),
    ...config,
  });
  await updateSnapserveAgent(created.id, config);
  console.log(`Created agent ${created.id} "${name}"`);
  return created.id;
}

async function main() {
  const number = process.argv[2];
  if (!number || !/^\+\d{10,15}$/.test(number)) {
    console.error("Usage: tsx scripts/setup-order-agents.ts +91XXXXXXXXXX  (the Snapserve number to order on)");
    process.exit(1);
  }
  const phone = (await listSnapservePhoneNumbers()).find((p) => p.number === number);
  if (!phone) throw new Error(`${number} is not a number on this Snapserve account.`);

  // Voice/model settings are copied from an existing working agent.
  const agents = await listSnapserveAgents();
  const templateId = agents.find((a) => a.name === "Botty")?.id ?? agents[0]?.id;
  if (!templateId) throw new Error("No agent on the account to copy voice settings from.");
  const template = await getSnapserveAgent(templateId);

  const common = { language: "en-IN", status: "active", tools: [{ type: "end_call", name: "end_call", description: "End the call when the conversation is complete." }] };

  const orderId = await upsert(ORDER_AGENT, template, {
    ...common,
    description: "Takes the household's grocery order by phone; the app then calls the store.",
    systemPrompt: ORDER_PROMPT,
    greetingMessage: "Hi! What would you like to order today?",
    firstSpeaker: "assistant",
    maxDuration: 300,
    dispositionSchema: ORDER_DISPOSITION,
  });
  const storeId = await upsert(STORE_AGENT, template, {
    ...common,
    description: "Calls a store to buy the household's order.",
    systemPrompt: STORE_PROMPT,
    greetingMessage: "Vanakkam! I'd like to place a home delivery order, please.",
    firstSpeaker: "assistant",
    maxDuration: 300,
    dispositionSchema: STORE_DISPOSITION,
  });

  if (phone.agentId !== orderId) {
    const previous = phone.agentId ? agents.find((a) => a.id === phone.agentId)?.name ?? phone.agentId : "no agent";
    await assignSnapservePhoneNumber(phone.id, orderId);
    console.log(`${number} moved from ${previous} to "${ORDER_AGENT}"`);
  }
  const numbers = await listSnapservePhoneNumbers();
  console.log(`\n${number} → agent ${numbers.find((p) => p.id === phone.id)?.agentId}`);
  console.log("\nAdd to .env:");
  console.log(`SNAPSERVE_ORDER_AGENT_ID=${orderId}`);
  console.log(`SNAPSERVE_ORDER_NUMBER=${number}`);
  console.log(`SNAPSERVE_AGENT_ID=${storeId}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
