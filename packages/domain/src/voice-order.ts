// Phone ordering (deterministic): turns the order a household member spoke to
// the Snapserve ordering agent into per-store order lines. The agent layer then
// places one outbound call per store.
import type { Resource, Vendor } from "@household/contracts";
import { pickVendorForCategory } from "./reorder-engine.js";
import { estimateOrderCostForDeficit } from "./ripple-engine.js";
import { formatQuantityDisplay } from "./unit-normalizer.js";

/** "98400 00000", "098400-00000", "919840000000", "+91 98400 00000" → "+919840000000". Null if unusable. */
export function normalizePhoneE164(raw: string, defaultCountryCode = "91"): string | null {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) return digits.length >= 10 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+${defaultCountryCode}${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+${defaultCountryCode}${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith(defaultCountryCode)) return `+${digits}`;
  return null;
}

/** Same subscriber regardless of formatting (compares the last 10 digits). */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const tail = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "").slice(-10);
  return tail(a).length === 10 && tail(a) === tail(b);
}

export interface SpokenOrderItem {
  name: string;
  quantity: number;
  /** Base unit the quantity is expressed in. */
  baseUnit: Resource["baseUnit"];
}

const UNIT_TABLE: Array<{ pattern: RegExp; baseUnit: Resource["baseUnit"]; factor: number }> = [
  { pattern: /^(kg|kgs|kilo|kilos|kilogram|kilograms)$/, baseUnit: "g", factor: 1000 },
  { pattern: /^(g|gm|gms|gram|grams)$/, baseUnit: "g", factor: 1 },
  { pattern: /^(l|ltr|ltrs|litre|litres|liter|liters)$/, baseUnit: "ml", factor: 1000 },
  { pattern: /^(ml|millilitre|millilitres|milliliter|milliliters)$/, baseUnit: "ml", factor: 1 },
  { pattern: /^(dozen|dozens)$/, baseUnit: "count", factor: 12 },
  { pattern: /^(pc|pcs|piece|pieces|packet|packets|pack|packs|bottle|bottles|nos|no|unit|units|bunch|bunches)$/, baseUnit: "count", factor: 1 },
];

const WORD_NUMBERS: Record<string, number> = {
  half: 0.5, a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12,
};

/**
 * Parses "2 kg rice; 1 litre milk; half kg onions, 6 eggs and a packet of bread"
 * into items. Lines without a quantity default to 1 piece.
 */
export function parseSpokenOrder(text: string): SpokenOrderItem[] {
  const parts = text
    .replace(/\band\b/gi, ";")
    .split(/[;,\n]+/)
    .map((p) => p.trim().toLowerCase().replace(/[.!?]+$/, ""))
    .filter(Boolean);

  const items: SpokenOrderItem[] = [];
  for (const part of parts) {
    const tokens = part.split(/\s+/);
    let quantity = 1;
    let i = 0;
    const first = tokens[0] ?? "";
    const numeric = /^(\d+(?:\.\d+)?)([a-z]+)?$/.exec(first);
    let glued: string | undefined;
    if (numeric) {
      quantity = Number(numeric[1]);
      glued = numeric[2];
      i = 1;
    } else if (first in WORD_NUMBERS) {
      quantity = WORD_NUMBERS[first] ?? 1;
      i = 1;
    }
    let baseUnit: Resource["baseUnit"] = "count";
    let factor = 1;
    const unitWord = glued ?? tokens[i];
    const unit = unitWord ? UNIT_TABLE.find((u) => u.pattern.test(unitWord)) : undefined;
    if (unit) {
      baseUnit = unit.baseUnit;
      factor = unit.factor;
      if (!glued) i += 1;
    }
    if (tokens[i] === "of") i += 1;
    const name = tokens.slice(i).join(" ").trim();
    if (!name || !(quantity > 0)) continue;
    items.push({ name, quantity: Math.round(quantity * factor * 100) / 100, baseUnit });
  }
  return items;
}

const CATEGORY_KEYWORDS: Array<{ category: string; words: RegExp }> = [
  { category: "dairy", words: /\b(milk|curd|yogurt|yoghurt|paneer|butter|ghee|cheese|cream|buttermilk)\b/ },
  { category: "protein", words: /\b(chicken|mutton|fish|prawn|prawns|egg|eggs|meat|keema)\b/ },
  { category: "grain", words: /\b(rice|atta|flour|wheat|dal|daal|rava|sooji|oats|poha|bread|maida|millet|ragi)\b/ },
  { category: "produce", words: /\b(onion|onions|tomato|tomatoes|potato|potatoes|carrot|carrots|beans|brinjal|banana|bananas|apple|apples|mint|coriander|curry leaves|ginger|garlic|chilli|chillies|lemon|lemons|spinach|vegetables?|fruits?)\b/ },
  { category: "spice", words: /\b(masala|turmeric|cumin|jeera|pepper|mustard|chilli powder|salt|spice|spices)\b/ },
];

function guessCategory(name: string): string {
  // Longest keyword wins, so "chilli powder" is a spice and "chilli" produce.
  let best: { category: string; length: number } | null = null;
  for (const { category, words } of CATEGORY_KEYWORDS) {
    const m = words.exec(name);
    if (m && (!best || m[0].length > best.length)) best = { category, length: m[0].length };
  }
  return best?.category ?? "pantry";
}

function matchResource(name: string, resources: Resource[]): Resource | undefined {
  const n = name.toLowerCase();
  return resources.find((r) =>
    [r.canonicalName, ...r.aliases].some((alias) => {
      const a = alias.toLowerCase();
      return a === n || n.includes(a) || a.includes(n);
    }),
  );
}

export interface VoiceOrderLine {
  resourceId: string;
  name: string;
  orderQuantity: number;
  baseUnit: Resource["baseUnit"];
  orderDisplay: string;
  estimatedCostInr: number;
  /** False when the item isn't tracked in inventory (the order still goes out). */
  tracked: boolean;
}

export interface VoiceOrderGroup {
  vendor: Vendor;
  lines: VoiceOrderLine[];
  estimatedTotalCostInr: number;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);

/** Routes each spoken item to a store: the one the caller named, else the store that sells its category. */
export function planVoiceOrder(input: {
  householdId: string;
  items: SpokenOrderItem[];
  resources: Resource[];
  vendors: Vendor[];
  preferredStore?: string | null;
}): { groups: VoiceOrderGroup[]; unassigned: string[] } {
  const vendors = input.vendors.filter((v) => v.householdId === input.householdId && v.phoneE164);
  const resources = input.resources.filter((r) => r.householdId === input.householdId);
  const wanted = input.preferredStore?.trim().toLowerCase();
  const named = wanted
    ? vendors.find((v) => v.name.toLowerCase().includes(wanted) || wanted.includes(v.name.toLowerCase()))
    : undefined;

  const groups = new Map<string, VoiceOrderGroup>();
  const unassigned: string[] = [];
  for (const item of input.items) {
    const resource = matchResource(item.name, resources);
    const category = resource?.category ?? guessCategory(item.name);
    const vendor = named ?? pickVendorForCategory(category, vendors);
    if (!vendor) {
      unassigned.push(item.name);
      continue;
    }
    // A tracked item keeps its own unit; "1 kg" of something tracked in ml stays as said.
    const baseUnit = resource && resource.baseUnit === item.baseUnit ? resource.baseUnit : item.baseUnit;
    const displayUnit = resource && resource.baseUnit === baseUnit ? resource.displayUnit : undefined;
    const resourceId = resource && resource.baseUnit === baseUnit ? resource.id : `adhoc_${slug(item.name)}`;
    const line: VoiceOrderLine = {
      resourceId,
      name: resource?.canonicalName ?? item.name.replace(/\b\w/g, (c) => c.toUpperCase()),
      orderQuantity: item.quantity,
      baseUnit,
      orderDisplay: formatQuantityDisplay(item.quantity, baseUnit, displayUnit),
      estimatedCostInr: estimateOrderCostForDeficit(resourceId, item.quantity).costInr,
      tracked: resourceId === resource?.id,
    };
    const group = groups.get(vendor.id) ?? { vendor, lines: [], estimatedTotalCostInr: 0 };
    group.lines.push(line);
    group.estimatedTotalCostInr += line.estimatedCostInr;
    groups.set(vendor.id, group);
  }
  return { groups: [...groups.values()], unassigned };
}
