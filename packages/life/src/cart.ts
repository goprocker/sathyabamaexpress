// Cart arithmetic. Pure functions over the stored cart so the API, the
// assistant and tests all share one implementation (no LLM maths).
import type { LifeCartItem } from "./types.js";

export interface CartChange {
  cart: LifeCartItem[];
  item: LifeCartItem | null;
  /** Quantity before the change; 0 when the item was not in the cart. */
  previousQuantity: number;
}

const key = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

const round = (n: number) => Math.round(n * 100) / 100;

/** Line total rescaled to a new quantity, keeping the item's unit price. */
function reprice(item: LifeCartItem, quantity: number): number {
  if (item.priceUnknown || item.quantity <= 0) return 0;
  return Math.round((item.estimatedPrice / item.quantity) * quantity);
}

export function findCartItem(cart: LifeCartItem[], name: string): LifeCartItem | undefined {
  const k = key(name);
  return cart.find((c) => key(c.name) === k);
}

/**
 * Adds an item, or raises the quantity when the same item (by name) is
 * already in the cart with the same unit.
 */
export function addToCart(
  cart: LifeCartItem[],
  input: { name: string; quantity: number; unit: string; source: LifeCartItem["source"] },
  ids: { id: string; now: string },
): CartChange {
  const existing = findCartItem(cart, input.name);
  if (existing && existing.unit === input.unit) {
    const quantity = round(existing.quantity + input.quantity);
    const item = { ...existing, quantity, estimatedPrice: reprice(existing, quantity) };
    return { cart: cart.map((c) => (c.id === existing.id ? item : c)), item, previousQuantity: existing.quantity };
  }
  const name = input.name.trim().replace(/\s+/g, " ");
  const item: LifeCartItem = {
    id: ids.id,
    itemId: `item_${key(name).replace(/[^a-z0-9]+/g, "_")}`,
    name: name.charAt(0).toUpperCase() + name.slice(1),
    quantity: round(input.quantity),
    unit: input.unit,
    estimatedPrice: 0,
    priceUnknown: true,
    source: input.source,
    reason: input.source === "assistant" ? "Added by the assistant" : "Added by you",
    platform: "manual",
  };
  return { cart: [...cart, item], item, previousQuantity: 0 };
}

/** Sets an item's quantity; 0 removes it. Unknown ids leave the cart unchanged. */
export function setCartQuantity(cart: LifeCartItem[], id: string, quantity: number): CartChange {
  const existing = cart.find((c) => c.id === id);
  if (!existing) return { cart, item: null, previousQuantity: 0 };
  if (quantity <= 0) return { cart: cart.filter((c) => c.id !== id), item: null, previousQuantity: existing.quantity };
  const item = { ...existing, quantity: round(quantity), estimatedPrice: reprice(existing, quantity) };
  return { cart: cart.map((c) => (c.id === id ? item : c)), item, previousQuantity: existing.quantity };
}

export function cartTotals(cart: LifeCartItem[]) {
  return {
    count: cart.length,
    total: cart.reduce((s, c) => s + c.estimatedPrice, 0),
    unpriced: cart.filter((c) => c.priceUnknown).length,
  };
}

const WORD_NUMBERS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  half: 0.5, dozen: 12,
};

const UNIT_ALIASES: Record<string, string> = {
  kg: "kg", kgs: "kg", kilo: "kg", kilos: "kg", kilogram: "kg", kilograms: "kg",
  g: "g", gm: "g", gms: "g", gram: "g", grams: "g",
  l: "L", litre: "L", litres: "L", liter: "L", liters: "L",
  ml: "ml",
  pc: "pc", pcs: "pc", piece: "pc", pieces: "pc",
  pack: "pack", packs: "pack", packet: "pack", packets: "pack",
  loaf: "loaf", loaves: "loaf",
  dozen: "dozen", bottle: "bottle", bottles: "bottle", box: "box", boxes: "box",
};

export interface CartCommand {
  type: "cart_add" | "cart_remove";
  name: string;
  quantity: number;
  unit: string;
}

/**
 * Rule-based reading of simple cart commands, used when no language model is
 * available: "add bread to cart", "add cart bread", "add 2 kg rice to my cart",
 * "remove milk from cart".
 */
export function parseCartCommand(question: string): CartCommand | null {
  const q = question.toLowerCase().replace(/[.!?]+$/g, "").trim();
  if (!/\b(cart|basket|shopping list)\b/.test(q)) return null;
  const remove = /^(please\s+)?(remove|delete|drop|take)\b/.test(q);
  if (!remove && !/^(please\s+)?(add|put|buy|include)\b/.test(q)) return null;

  const rest = q
    .replace(/^(please\s+)?(add|put|buy|include|remove|delete|drop|take)\s+/, "")
    .replace(/\b(to|into|in|from|out of|on)?\s*(my|the)?\s*(cart|basket|shopping list)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!rest) return null;

  const tokens = rest.split(" ");
  let quantity = 1;
  let unit = "pc";
  const first = tokens[0] ?? "";
  if (/^\d+(\.\d+)?$/.test(first)) {
    quantity = Number(first);
    tokens.shift();
  } else if (first in WORD_NUMBERS) {
    quantity = WORD_NUMBERS[first] ?? 1;
    tokens.shift();
  }
  const maybeUnit = UNIT_ALIASES[tokens[0] ?? ""];
  if (maybeUnit && tokens.length > 1) {
    unit = maybeUnit === "dozen" ? "pc" : maybeUnit;
    if (maybeUnit === "dozen") quantity *= 12;
    tokens.shift();
    if (tokens[0] === "of") tokens.shift();
  }
  const name = tokens.join(" ").trim();
  if (!name) return null;
  return { type: remove ? "cart_remove" : "cart_add", name, quantity, unit };
}
