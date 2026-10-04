import { describe, expect, it } from "vitest";
import { computeRequirements, ingredientKey, roundQty, stockLevel } from "./stock";
import type { Recipe } from "../food/api";

describe("stockLevel", () => {
  it("classifies out, low and ok", () => {
    expect(stockLevel({ onHand: 0, reorderLevel: 5 })).toBe("out");
    expect(stockLevel({ onHand: -2, reorderLevel: 5 })).toBe("out");
    expect(stockLevel({ onHand: 5, reorderLevel: 5 })).toBe("low");
    expect(stockLevel({ onHand: 5.01, reorderLevel: 5 })).toBe("ok");
    expect(stockLevel({ onHand: 3, reorderLevel: 0 })).toBe("ok");
  });
});

describe("computeRequirements", () => {
  const recipes = [
    { ingredient: "Rice", menuItemId: "m1", quantity: 0.25 },
    { ingredient: "Chicken ", menuItemId: "m1", quantity: 0.15 },
    { ingredient: " rice", menuItemId: "m2", quantity: 0.1 }
  ] as Recipe[];

  it("multiplies recipe rows by line quantity and merges names across case and spaces", () => {
    const needed = computeRequirements([{ menuItemId: "m1", quantity: 2 }, { menuItemId: "m2", quantity: 3 }, { menuItemId: "unknown", quantity: 9 }], recipes);
    expect(roundQty(needed.get("rice") as number)).toBe(0.8);
    expect(roundQty(needed.get("chicken") as number)).toBe(0.3);
    expect(needed.size).toBe(2);
  });
  it("consumes nothing for menu items without a recipe or an empty order", () => {
    expect(computeRequirements([], recipes).size).toBe(0);
    expect(computeRequirements([{ menuItemId: "none", quantity: 4 }], recipes).size).toBe(0);
  });
  it("normalises ingredient keys and float noise", () => {
    expect(ingredientKey("  Cooking Oil ")).toBe("cooking oil");
    expect(roundQty(0.1 + 0.2)).toBe(0.3);
  });
});
