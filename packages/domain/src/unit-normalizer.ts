import type { BaseUnit, DisplayUnit, Resource } from "@household/contracts";
import { formatQuantityDisplay } from "@household/db";

export interface NormalizedUnitResult {
  baseQuantity: number;
  baseUnit: BaseUnit;
  displayUnit: DisplayUnit;
}

const COUNT_UNITS = new Set([
  "", "pc", "pcs", "piece", "pieces", "count", "nos", "no", "no.", "ea", "each", "unit", "units", "x",
  "loaf", "loaves", "bottle", "bottles", "box", "boxes", "tin", "tins", "can", "cans", "bunch", "bunches",
]);
const PACK_UNITS = new Set(["pack", "packs", "pkt", "pkts", "packet", "packets"]);

/**
 * Converts a printed quantity + unit to the base unit. A bill line with no
 * unit, or a unit we don't recognise, is a count ("1" means one item) — never
 * grams.
 */
export function normalizeToBaseUnit(quantity: number, unitInput: string): NormalizedUnitResult {
  const u = unitInput.trim().toLowerCase();

  if (u === "kg" || u === "kgs" || u === "kilogram" || u === "kilograms" || u === "kilo" || u === "kilos") {
    return {
      baseQuantity: Math.round(quantity * 1000 * 100) / 100,
      baseUnit: "g",
      displayUnit: "kg",
    };
  }
  if (u === "g" || u === "gm" || u === "gms" || u === "gram" || u === "grams") {
    return {
      baseQuantity: Math.round(quantity * 100) / 100,
      baseUnit: "g",
      displayUnit: quantity >= 1000 ? "kg" : "g",
    };
  }
  if (u === "l" || u === "lt" || u === "ltr" || u === "ltrs" || u === "liter" || u === "liters" || u === "litre" || u === "litres") {
    return {
      baseQuantity: Math.round(quantity * 1000 * 100) / 100,
      baseUnit: "ml",
      displayUnit: "L",
    };
  }
  if (u === "ml" || u === "milliliter" || u === "milliliters" || u === "pouch") {
    return {
      baseQuantity: Math.round(quantity * 100) / 100,
      baseUnit: "ml",
      displayUnit: quantity >= 1000 ? "L" : "ml",
    };
  }
  if (u === "dozen" || u === "dz") {
    return { baseQuantity: Math.round(quantity * 12), baseUnit: "count", displayUnit: "pcs" };
  }
  if (PACK_UNITS.has(u)) {
    return { baseQuantity: Math.round(quantity), baseUnit: "count", displayUnit: "pack" };
  }
  if (COUNT_UNITS.has(u)) {
    return { baseQuantity: Math.round(quantity), baseUnit: "count", displayUnit: "pcs" };
  }

  // Unrecognised unit: keep the printed count rather than guessing a weight.
  return { baseQuantity: Math.round(quantity), baseUnit: "count", displayUnit: "pcs" };
}

export function matchCanonicalResource(
  rawQuery: string,
  resources: Resource[]
): Resource | undefined {
  const normalized = rawQuery.trim().toLowerCase();
  if (!normalized) return undefined;

  // 1. Exact ID or Canonical Name match
  const exact = resources.find(
    (r) =>
      r.id.toLowerCase() === normalized ||
      r.canonicalName.toLowerCase() === normalized
  );
  if (exact) return exact;

  // 2. Exact alias match
  const aliasMatch = resources.find((r) =>
    r.aliases.some((a) => a.toLowerCase() === normalized)
  );
  if (aliasMatch) return aliasMatch;

  // 3. Substring / token match
  return resources.find(
    (r) =>
      normalized.includes(r.canonicalName.toLowerCase()) ||
      r.canonicalName.toLowerCase().includes(normalized) ||
      r.aliases.some(
        (a) =>
          normalized.includes(a.toLowerCase()) ||
          a.toLowerCase().includes(normalized)
      )
  );
}

export { formatQuantityDisplay };
