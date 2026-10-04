import type { InventoryItem, OrderItem, Recipe } from "../food/api";

export type StockLevel = "ok" | "low" | "out";

export function stockLevel(item: Pick<InventoryItem, "onHand" | "reorderLevel">): StockLevel {
  if (item.onHand <= 0) return "out";
  return item.onHand <= item.reorderLevel ? "low" : "ok";
}

// Ingredient names are matched case-insensitively and ignoring stray spaces, so
// "Rice " in a recipe still finds "rice" in the stock list.
export const ingredientKey = (name: string) => name.trim().toLowerCase();

// What an order consumes: for every line, quantity x each recipe row for that menu item.
export function computeRequirements(lines: Array<Pick<OrderItem, "menuItemId" | "quantity">>, recipes: Recipe[]): Map<string, number> {
  const needed = new Map<string, number>();
  for (const line of lines) {
    for (const row of recipes) {
      if (row.menuItemId !== line.menuItemId) continue;
      const key = ingredientKey(row.ingredient);
      needed.set(key, (needed.get(key) ?? 0) + row.quantity * line.quantity);
    }
  }
  return needed;
}

// Rounds away float noise (0.1 + 0.2) so the UI never shows 0.30000000000000004.
export const roundQty = (value: number) => Math.round(value * 1000) / 1000;
