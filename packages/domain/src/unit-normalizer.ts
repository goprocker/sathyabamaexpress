import type { BaseUnit, DisplayUnit, Resource } from "@household/contracts";
import { formatQuantityDisplay } from "@household/db";

export interface NormalizedUnitResult {
  baseQuantity: number;
  baseUnit: BaseUnit;
  displayUnit: DisplayUnit;
}

export function normalizeToBaseUnit(
  quantity: number,
  unitInput: string,
  fallbackBaseUnit: BaseUnit = "g"
): NormalizedUnitResult {
  const u = unitInput.trim().toLowerCase();

  if (u === "kg" || u === "kilogram" || u === "kilograms" || u === "kilo") {
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
  if (u === "l" || u === "ltr" || u === "liter" || u === "liters" || u === "litre") {
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
  if (u === "pcs" || u === "pc" || u === "piece" || u === "pieces" || u === "count" || u === "pack") {
    return {
      baseQuantity: Math.round(quantity),
      baseUnit: "count",
      displayUnit: u === "pack" ? "pack" : "pcs",
    };
  }

  return {
    baseQuantity: Math.round(quantity * 100) / 100,
    baseUnit: fallbackBaseUnit,
    displayUnit: fallbackBaseUnit === "g" ? "g" : fallbackBaseUnit === "ml" ? "ml" : "pcs",
  };
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
