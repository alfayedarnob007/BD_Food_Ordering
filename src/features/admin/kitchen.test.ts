import { describe, expect, it } from "vitest";
import { isLate, kitchenHealth, stageMinutes } from "./kitchen";
import type { Order } from "../food/api";

const now = Date.parse("2026-10-05T12:00:00Z");
const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
const order = (status: Order["status"], extra: Partial<Order> = {}) => ({ ItemId: "x", customerId: "c", deliveryFee: 0, restaurantId: "r", status, subtotal: 0, total: 0, ...extra }) as Order;

describe("stage timers", () => {
  it("uses the clock of the current stage", () => {
    expect(stageMinutes(order("placed", { placedAt: ago(7) }), now)).toBe(7);
    expect(stageMinutes(order("preparing", { acceptedAt: ago(10), placedAt: ago(30) }), now)).toBe(10);
  });
  it("treats missing timestamps as unknown, never zero", () => {
    expect(stageMinutes(order("placed"), now)).toBeUndefined();
    expect(isLate(order("placed"), now)).toBe(false);
  });
  it("flags tickets at the stage target and never flags finished orders", () => {
    expect(isLate(order("placed", { placedAt: ago(5) }), now)).toBe(true);
    expect(isLate(order("placed", { placedAt: ago(4) }), now)).toBe(false);
    expect(isLate(order("delivered", { placedAt: ago(999) }), now)).toBe(false);
  });
});

describe("kitchen health", () => {
  it("is healthy when empty or on time", () => {
    expect(kitchenHealth([], now).level).toBe("healthy");
    expect(kitchenHealth([order("placed", { placedAt: ago(1) })], now).level).toBe("healthy");
  });
  it("escalates with overdue share and queue depth", () => {
    expect(kitchenHealth([order("placed", { placedAt: ago(9) }), order("placed", { placedAt: ago(1) })], now).level).toBe("overloaded");
    expect(kitchenHealth([order("placed", { placedAt: ago(9) }), order("placed", { placedAt: ago(1) }), order("placed", { placedAt: ago(1) })], now).level).toBe("busy");
    expect(kitchenHealth(Array.from({ length: 3 }, () => order("placed", { placedAt: ago(30) })), now).level).toBe("overloaded");
  });
  it("averages prep time only over orders with both stamps", () => {
    const health = kitchenHealth([
      order("ready", { acceptedAt: ago(30), readyAt: ago(10) }),
      order("delivered", { acceptedAt: ago(50), readyAt: ago(30) }),
      order("ready", { readyAt: ago(1) })
    ], now);
    expect(health.avgPrepMinutes).toBe(20);
  });
  it("reports the oldest waiting new ticket", () => {
    expect(kitchenHealth([order("placed", { placedAt: ago(12) })], now).oldestWaitingMinutes).toBe(12);
  });
});
