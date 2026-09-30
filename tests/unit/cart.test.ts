import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addToCart, cartTotals, parseCartCommand, setCartQuantity, type LifeCartItem } from "@household/life";

const ids = (id: string) => ({ id, now: "2026-09-30T00:00:00.000Z" });
const chicken: LifeCartItem = {
  id: "cart_001", itemId: "ing_chicken", name: "Chicken", quantity: 1.5, unit: "kg",
  estimatedPrice: 390, source: "auto", platform: "zepto",
};

describe("cart", () => {
  it("adds a new item with no invented price", () => {
    const out = addToCart([], { name: "bread", quantity: 1, unit: "pc", source: "assistant" }, ids("c1"));
    assert.equal(out.previousQuantity, 0);
    assert.equal(out.item?.name, "Bread");
    assert.equal(out.item?.estimatedPrice, 0);
    assert.equal(out.item?.priceUnknown, true);
    assert.equal(out.cart.length, 1);
  });

  it("merges the same item and keeps the unit price", () => {
    const out = addToCart([chicken], { name: " chicken ", quantity: 1.5, unit: "kg", source: "manual" }, ids("c2"));
    assert.equal(out.cart.length, 1);
    assert.equal(out.item?.quantity, 3);
    assert.equal(out.item?.estimatedPrice, 780);
    assert.equal(out.previousQuantity, 1.5);
  });

  it("sets quantity, removes at zero, and totals line prices", () => {
    const withBread = addToCart([chicken], { name: "Bread", quantity: 2, unit: "pc", source: "manual" }, ids("c3")).cart;
    assert.deepEqual(cartTotals(withBread), { count: 2, total: 390, unpriced: 1 });
    const halved = setCartQuantity(withBread, "cart_001", 0.75);
    assert.equal(halved.item?.estimatedPrice, 195);
    assert.equal(setCartQuantity(withBread, "cart_001", 0).cart.length, 1);
  });

  it("parses simple cart commands", () => {
    assert.deepEqual(parseCartCommand("add cart bread"), { type: "cart_add", name: "bread", quantity: 1, unit: "pc" });
    assert.deepEqual(parseCartCommand("Add 2 kg rice to my cart."), { type: "cart_add", name: "rice", quantity: 2, unit: "kg" });
    assert.deepEqual(parseCartCommand("add a dozen eggs to cart"), { type: "cart_add", name: "eggs", quantity: 12, unit: "pc" });
    assert.deepEqual(parseCartCommand("remove milk from the cart"), { type: "cart_remove", name: "milk", quantity: 1, unit: "pc" });
    assert.equal(parseCartCommand("is bread in my cart?"), null);
    assert.equal(parseCartCommand("add bread"), null);
  });
});
