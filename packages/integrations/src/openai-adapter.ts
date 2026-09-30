import {
  ParsedObligationSchema,
  StructuredVoiceIntentSchema,
  type ParsedObligation,
  type StructuredVoiceIntent,
} from "@household/contracts";

export interface RawExtractedReceiptLine {
  rawName: string;
  quantity: number;
  unit: string;
  priceInr?: number;
  expiryDays?: number;
  confidence: number;
}

async function requestJson(
  messages: Array<{ role: "system" | "user"; content: string | unknown[] }>,
  model: string
): Promise<unknown> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for this operation.");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages,
      temperature: 0,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(`OpenAI request failed (${response.status}).`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned an empty result.");
  return JSON.parse(content) as unknown;
}

export async function extractReceiptWithVision(options: {
  imageBase64?: string;
  rawText?: string;
  vendorHint?: string;
  /**
   * When the scan cannot be read, fall back to the built-in sample receipt (demo mode).
   * Turn off for real households, where invented lines would pollute their inventory.
   */
  demoFallback?: boolean;
} = {}): Promise<{
  vendorName: string;
  items: RawExtractedReceiptLine[];
  usedProvider: "openai" | "deterministic-fallback";
}> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (apiKey && (options.imageBase64 || options.rawText?.trim())) {
    try {
      const userContent: unknown[] = [
        {
          type: "text",
          text:
            "Extract grocery receipt line items as JSON with vendorName and items. Each item must include rawName, numeric quantity, unit, optional priceInr, optional expiryDays only when printed, and confidence from 0 to 1. Do not infer missing quantities or prices. " +
            "quantity is the number in the bill's quantity (Qty) column for that line, read exactly. " +
            'unit is the unit printed next to that quantity, as one of kg, g, L, ml, pcs, pack. If the quantity has no unit next to it (e.g. "Bread 1"), use "pcs"; never assume grams. ' +
            'A pack size inside the item name (e.g. "Amul Butter 100g", "Milk 500ml") is part of rawName, not the unit: "Amul Butter 100g  1" is quantity 1, unit "pcs". ' +
            (options.rawText ? `Receipt text: ${options.rawText}` : ""),
        },
      ];
      if (options.imageBase64) {
        userContent.push({
          type: "image_url",
          image_url: {
            url: options.imageBase64.startsWith("data:")
              ? options.imageBase64
              : `data:image/jpeg;base64,${options.imageBase64}`,
          },
        });
      }

      const model = options.imageBase64
        ? process.env.OPENAI_VISION_MODEL || "gpt-4o"
        : process.env.OPENAI_MODEL || "gpt-4o-mini";
      const value = await requestJson(
        [
          {
            role: "system",
            content: "You extract receipt data. Return only valid JSON.",
          },
          { role: "user", content: userContent },
        ],
        model
      );
      if (typeof value === "object" && value !== null) {
        const parsed = value as { vendorName?: unknown; items?: unknown };
        if (Array.isArray(parsed.items) && parsed.items.length > 0) {
          const items = parsed.items.map(
            (item): RawExtractedReceiptLine => {
              const line = (item || {}) as Record<string, unknown>;
              return {
                rawName: String(line.rawName || "Item"),
                quantity: Number(line.quantity || 1),
                // No printed unit means a count, not grams.
                unit: typeof line.unit === "string" && line.unit.trim() ? line.unit.trim() : "pcs",
                ...(typeof line.priceInr === "number"
                  ? { priceInr: line.priceInr }
                  : {}),
                ...(typeof line.expiryDays === "number"
                  ? { expiryDays: line.expiryDays }
                  : {}),
                confidence:
                  typeof line.confidence === "number" ? line.confidence : 0.9,
              };
            }
          );

          return {
            vendorName:
              typeof parsed.vendorName === "string" && parsed.vendorName.trim()
                ? parsed.vendorName.trim()
                : options.vendorHint?.trim() || "Kaveri Fresh Mart & Meats",
            items,
            usedProvider: "openai",
          };
        }
      }
    } catch {
      // Fall through to the sample receipt in demo mode; real households get an error below.
    }
  }

  if (options.demoFallback === false) {
    throw new Error(
      apiKey
        ? "Couldn't read that receipt. Try a clearer photo of the whole bill."
        : "Receipt scanning needs an OpenAI key on the server.",
    );
  }

  return {
    vendorName: options.vendorHint || "Kaveri Fresh Mart & Meats",
    usedProvider: "deterministic-fallback",
    items: [
      {
        rawName: "India Gate Basmati Rice",
        quantity: 5,
        unit: "kg",
        priceInr: 620,
        expiryDays: 180,
        confidence: 0.98,
      },
      {
        rawName: "Fresh Country Chicken (Skinless)",
        quantity: 700,
        unit: "g",
        priceInr: 210,
        expiryDays: 2,
        confidence: 0.95,
      },
      {
        rawName: "Bellary Red Onion",
        quantity: 2,
        unit: "kg",
        priceInr: 90,
        expiryDays: 12,
        confidence: 0.94,
      },
      {
        rawName: "Aavin Thick Curd Pouch",
        quantity: 200,
        unit: "ml",
        priceInr: 30,
        expiryDays: 4,
        confidence: 0.74, // < 0.85 -> flagged with '?' for user review
      },
    ],
  };
}

export const extractReceiptWithVisionOrFallback = extractReceiptWithVision;

export async function parseVoiceOrTextIntent(
  rawUtterance: string
): Promise<StructuredVoiceIntent> {
  const text = (rawUtterance || "Naalaikku 6 perukku biryani pannanum.").trim();
  const lower = text.toLowerCase();
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const deterministicMealSlot: "breakfast" | "lunch" | "dinner" =
    lower.includes("morning") ||
    lower.includes("breakfast") ||
    lower.includes("kaalai")
      ? "breakfast"
      : lower.includes("lunch") || lower.includes("madhiyam")
        ? "lunch"
        : "dinner";

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (apiKey) {
    try {
      const result = await requestJson(
        [
          {
            role: "system",
            content:
              `Extract a household meal intent from the user input (Tamil, Tanglish, or English). Today is ${today}; tomorrow is ${tomorrow}. ` +
              `Return ONLY valid JSON matching: {"intent":"MEAL_PLANNED","dish":string,"recipeId":"rcp_chicken_biryani"|"rcp_chicken_curry"|"rcp_sambar_rice","servings":number,"plannedDate":"${tomorrow}","dateLabel":"Tomorrow","mealSlot":"breakfast"|"lunch"|"dinner","detectedLanguage":string,"confidence":number,"summaryText":string}. ` +
              `Rules: if input mentions morning/breakfast/kaalai, mealSlot MUST be "breakfast". If lunch/madhiyam, "lunch". Otherwise "dinner". If no numeric digit is controllable, default servings to 6.`,
          },
          { role: "user", content: text },
        ],
        process.env.OPENAI_MODEL || "gpt-4o-mini"
      );
      if (typeof result === "object" && result !== null) {
        const candidate = {
          ...(result as Record<string, unknown>),
          mealSlot:
            lower.includes("morning") ||
            lower.includes("breakfast") ||
            lower.includes("kaalai") ||
            lower.includes("lunch")
              ? deterministicMealSlot
              : (result as Record<string, unknown>).mealSlot || deterministicMealSlot,
        };
        const parsed = StructuredVoiceIntentSchema.safeParse(candidate);
        if (parsed.success) return parsed.data;
      }
    } catch {
      // Fall through to deterministic Tanglish parser
    }
  }

  const numMatch = lower.match(/\b(\d+)\b/);
  const servings = numMatch ? Math.max(1, Number(numMatch[1])) : 6;

  let dish = "Chicken Biryani";
  let recipeId = "rcp_chicken_biryani";
  if (lower.includes("curry") || lower.includes("kulambu")) {
    dish = "Chicken Curry";
    recipeId = "rcp_chicken_curry";
  } else if (lower.includes("sambar") || lower.includes("dosa")) {
    dish = "Sambar Rice";
    recipeId = "rcp_sambar_rice";
  }

  return {
    intent: "MEAL_PLANNED",
    dish,
    recipeId,
    servings,
    plannedDate: tomorrow,
    dateLabel: "Tomorrow",
    mealSlot: deterministicMealSlot,
    detectedLanguage: "ta-IN (Tanglish)",
    confidence: 0.96,
    summaryText: `Plan ${dish} for ${servings} people tomorrow`,
  };
}

export const parseVoiceOrTextIntentWithLLMOrFallback = parseVoiceOrTextIntent;

export async function verifyVendorTranscript(
  transcript: string,
  expectedItemsSummary: string
): Promise<{
  status: "SUCCESS" | "PARTIAL" | "FAILED" | "UNKNOWN";
  vendorResponseSummary: string;
  deliveryEta: string;
}> {
  if (!transcript.trim()) {
    return {
      status: "UNKNOWN",
      vendorResponseSummary: "SnapServe returned no transcript for verification.",
      deliveryEta: "Unknown",
    };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (apiKey) {
    try {
      const value = await requestJson(
        [
          {
            role: "system",
            content:
              "Verify vendor call outcomes using only explicit statements in the transcript. Return JSON with status SUCCESS, PARTIAL, FAILED, or UNKNOWN; vendorResponseSummary; deliveryEta.",
          },
          {
            role: "user",
            content: JSON.stringify({ transcript, expectedItemsSummary }),
          },
        ],
        process.env.OPENAI_MODEL || "gpt-4o-mini"
      );
      if (typeof value === "object" && value !== null) {
        const parsed = value as Record<string, unknown>;
        const validStatus = ["SUCCESS", "PARTIAL", "FAILED", "UNKNOWN"].includes(
          String(parsed.status)
        );
        if (
          validStatus &&
          typeof parsed.vendorResponseSummary === "string" &&
          typeof parsed.deliveryEta === "string"
        ) {
          return {
            status: parsed.status as "SUCCESS" | "PARTIAL" | "FAILED" | "UNKNOWN",
            vendorResponseSummary: parsed.vendorResponseSummary,
            deliveryEta: parsed.deliveryEta,
          };
        }
      }
    } catch {
      // Fall through to deterministic transcript verifier
    }
  }

  const lower = transcript.toLowerCase();
  if (
    lower.includes("available") ||
    lower.includes("confirm") ||
    lower.includes("deliver")
  ) {
    return {
      status: "SUCCESS",
      vendorResponseSummary: `Vendor confirmed full order (${expectedItemsSummary}) for morning delivery.`,
      deliveryEta: "Tomorrow, 9:30 AM",
    };
  }

  return {
    status: "UNKNOWN",
    vendorResponseSummary: "Vendor response requires manual confirmation.",
    deliveryEta: "Pending",
  };
}

export const verifyVendorTranscriptWithLLMOrFallback = verifyVendorTranscript;

export function parseObligationDeterministic(rawText: string): ParsedObligation {
  const text = rawText.trim();
  const lower = text.toLowerCase();

  let kind: ParsedObligation["kind"] = "document";
  if (lower.includes("bill") || lower.includes("electricity") || lower.includes("tangedco")) {
    kind = "bill";
  } else if (lower.includes("vehicle") || lower.includes("car") || lower.includes("service") || lower.includes("scooter")) {
    kind = "vehicle_service";
  } else if (lower.includes("appointment") || lower.includes("doctor") || lower.includes("dentist")) {
    kind = "appointment";
  } else if (lower.includes("subscription") || lower.includes("renewal") || lower.includes("netflix")) {
    kind = "subscription";
  }

  const amountMatch = text.match(/(?:₹|rs\.?|inr)\s*([\d,]+)/i);
  const amountInr = amountMatch
    ? Number(amountMatch[1].replace(/,/g, ""))
    : undefined;

  const isoDateMatch = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  const dueDate = isoDateMatch
    ? isoDateMatch[1]
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  return {
    kind,
    title: text.slice(0, 80) || "Household obligation",
    dueDate,
    ...(amountInr !== undefined ? { amountInr } : {}),
    recurrence: kind === "bill" || kind === "subscription" ? "MONTHLY" : "NONE",
    confidence: 0.88,
    needsReview: false,
    usedProvider: "deterministic",
  };
}

export async function parseObligationWithOpenAI(
  rawText: string
): Promise<ParsedObligation> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return parseObligationDeterministic(rawText);
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    const result = await requestJson(
      [
        {
          role: "system",
          content:
            `Extract a structured household obligation from free text. Today is ${today}. ` +
            `Return JSON with kind ("document"|"bill"|"appointment"|"vehicle_service"|"subscription"), title, optional provider, optional detail, optional dueDate (YYYY-MM-DD), optional amountInr (number), recurrence ("NONE"|"DAILY"|"WEEKLY"|"MONTHLY"|"YEARLY"), confidence (0..1), needsReview (boolean), and usedProvider: "openai".`,
        },
        { role: "user", content: rawText },
      ],
      process.env.OPENAI_MODEL || "gpt-4o-mini"
    );
    if (typeof result === "object" && result !== null) {
      const parsed = ParsedObligationSchema.safeParse({
        ...(result as Record<string, unknown>),
        usedProvider: "openai",
      });
      if (parsed.success) return parsed.data;
    }
  } catch {
    // Fall through to deterministic obligation parser
  }

  return parseObligationDeterministic(rawText);
}



/** A cart change the user asked for. The API validates and applies it; the model never edits state. */
export interface RequestedCartAction {
  type: "cart_add" | "cart_remove";
  name: string;
  quantity: number;
  unit: string;
}

export interface ContextualAnswer {
  text: string;
  bullets: string[];
  modules: string[];
  actions: RequestedCartAction[];
}

const ASSISTANT_SYSTEM_PROMPT = `You are Livora, a household assistant. You are given a JSON snapshot of ONE household (timeline, pantry, smart cart, bills and obligations, forecasts, commute and EV, wardrobe). That snapshot is your only source of facts.
Rules:
- Answer every question in the context of this household. Never reply with a menu of example questions.
- Greetings or "who are you": introduce yourself as Livora in one sentence, then give the 2-3 most relevant things from the snapshot right now (what is due soon, what is running low).
- For household spending questions use spendNext7Days and list each component.
- If an image is attached, say briefly what it shows, then relate it to this household: a receipt or grocery photo against pantry and cart, a bill against obligations, clothing against the wardrobe and upcoming occasions, a vehicle or route against mobility. Read text in the image exactly; if it is unclear, say so instead of guessing.
- Use only numbers, dates, names and amounts present in the snapshot. Do not calculate new totals unless every input is in the snapshot; then show the sum as bullets, one per component (e.g. groceries, bills, commute). If the snapshot lacks the answer, say exactly what is missing.
- Questions unrelated to the household: answer briefly and helpfully, then tie back to the household only if natural.
- Reply in the language the user wrote in (English, Tamil, or Tanglish). Keep "text" to 1-2 short sentences; put specifics in "bullets" (max 6, each under 120 characters). Amounts in rupees as ₹.
- "modules" lists which snapshot areas you used, from: timeline, pantry, cart, admin, mobility, circular.
- The snapshot's "smartCart" array is the user's current cart, including items they added. Answer questions about the cart (what is in it, is X in it, how much) directly from it. Items with price "not known yet" have no price; never estimate one.
- Cart requests: when the user asks to add something to (or remove something from) the cart or shopping list, in any wording or language ("add bread to cart", "add cart bread", "cart-la 2 litre milk podu", "remove eggs from cart"), put one entry per item in "actions": {"type": "cart_add" | "cart_remove", "name": the item in English singular title case (e.g. "Bread", "Milk"), "quantity": number (default 1), "unit": one of pc, pack, loaf, kg, g, L, ml, dozen (default "pc")}. The app performs the change and confirms it, so keep "text" to a short acknowledgement and never claim a price. Only create actions when the user clearly asks; a question like "is bread in my cart?" is not a request.
Return JSON: {"text": string, "bullets": string[], "modules": string[], "actions": array}.`;

export async function answerWithHouseholdContext(options: {
  question: string;
  context: unknown;
  history?: Array<{ q: string; a: string }>;
  imageDataUrl?: string;
}): Promise<ContextualAnswer> {
  const messages: Array<{ role: "system" | "user"; content: string | unknown[] }> = [
    { role: "system", content: ASSISTANT_SYSTEM_PROMPT },
    { role: "user", content: `Household snapshot:\n${JSON.stringify(options.context)}` },
  ];
  for (const turn of (options.history ?? []).slice(-4)) {
    messages.push({ role: "user", content: `Earlier question: ${turn.q}\nEarlier answer: ${turn.a}` });
  }
  messages.push({
    role: "user",
    content: options.imageDataUrl
      ? [
          { type: "text", text: `Question: ${options.question}` },
          { type: "image_url", image_url: { url: options.imageDataUrl } },
        ]
      : `Question: ${options.question}`,
  });

  const model = options.imageDataUrl
    ? process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini"
    : process.env.OPENAI_MODEL || "gpt-4o-mini";
  const raw = (await requestJson(messages, model)) as Partial<ContextualAnswer>;
  const text = typeof raw.text === "string" ? raw.text.trim() : "";
  if (!text) throw new Error("OpenAI returned an empty answer.");
  return {
    text,
    bullets: Array.isArray(raw.bullets) ? raw.bullets.filter((b): b is string => typeof b === "string").slice(0, 6) : [],
    modules: Array.isArray(raw.modules) ? raw.modules.filter((m): m is string => typeof m === "string") : [],
    actions: Array.isArray(raw.actions) ? raw.actions.flatMap(readCartAction).slice(0, 10) : [],
  };
}

const CART_UNITS = new Set(["pc", "pack", "loaf", "kg", "g", "L", "ml", "dozen"]);

function readCartAction(value: unknown): RequestedCartAction[] {
  if (typeof value !== "object" || value === null) return [];
  const a = value as Record<string, unknown>;
  const type = a.type === "cart_add" || a.type === "cart_remove" ? a.type : null;
  const name = typeof a.name === "string" ? a.name.trim().slice(0, 80) : "";
  if (!type || !name) return [];
  const quantity = typeof a.quantity === "number" && a.quantity > 0 && a.quantity <= 1000 ? a.quantity : 1;
  let unit = typeof a.unit === "string" && CART_UNITS.has(a.unit) ? a.unit : "pc";
  // Dozens are stored as pieces so they merge with existing entries.
  const qty = unit === "dozen" ? quantity * 12 : quantity;
  if (unit === "dozen") unit = "pc";
  return [{ type, name, quantity: qty, unit }];
}
