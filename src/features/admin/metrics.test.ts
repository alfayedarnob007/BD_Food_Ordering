import { describe, expect, it } from "vitest";
import { UNASSIGNED, computeMetrics, filterOrders } from "./metrics";
import type { Branch, Order, OrderItem } from "../food/api";

const now = Date.parse("2026-10-05T12:00:00Z");
const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
const order = (id: string, extra: Partial<Order>) => ({ ItemId: id, customerId: "c", deliveryFee: 0, restaurantId: "r", status: "delivered", subtotal: 0, total: 100, ...extra }) as Order;
const line = (orderId: string, name: string, quantity: number, unitPrice = 50) => ({ ItemId: `${orderId}-${name}`, menuItemId: name, name, orderId, quantity, unitPrice }) as OrderItem;
const branches = [{ ItemId: "a", name: "Dhanmondi" }, { ItemId: "b", name: "Gulshan" }] as Branch[];

describe("filterOrders", () => {
  const orders = [order("1", { branchId: "a", placedAt: ago(30) }), order("2", { branchId: "b", placedAt: ago(60 * 24 * 3) }), order("3", { branchId: "a" })];
  it("applies the date range", () => {
    expect(filterOrders(orders, "today", undefined, now).map((entry) => entry.ItemId)).toEqual(["1"]);
    expect(filterOrders(orders, "7d", undefined, now).map((entry) => entry.ItemId)).toEqual(["1", "2"]);
  });
  it("shows orders with no placedAt only under all time", () => {
    expect(filterOrders(orders, "30d", undefined, now).map((entry) => entry.ItemId)).not.toContain("3");
    expect(filterOrders(orders, "all", undefined, now).map((entry) => entry.ItemId)).toContain("3");
  });
  it("filters by branch and by the unassigned bucket", () => {
    expect(filterOrders(orders, "all", "a", now).map((entry) => entry.ItemId)).toEqual(["1", "3"]);
    expect(filterOrders([order("9", {})], "all", UNASSIGNED, now)).toHaveLength(1);
    expect(filterOrders([order("9", { branchId: "a" })], "all", UNASSIGNED, now)).toHaveLength(0);
  });
});

describe("computeMetrics", () => {
  const orders = [
    order("1", { branchId: "a", channel: "kiosk", status: "delivered", total: 300 }),
    order("2", { branchId: "a", channel: "webapp", status: "preparing", total: 200 }),
    order("3", { branchId: "b", channel: "webapp", status: "cancelled", total: 999 }),
    order("4", { channel: "website", status: "placed", total: 100 })
  ];
  const lines = [line("1", "Biryani", 2), line("2", "Biryani", 1), line("2", "Borhani", 4), line("3", "Biryani", 50), line("zzz", "Ghost", 9)];
  const metrics = computeMetrics(orders, lines, branches);

  it("counts every order but only earns from non-cancelled ones", () => {
    expect(metrics.orders).toBe(4);
    expect(metrics.revenue).toBe(600);
    expect(metrics.averageOrderValue).toBe(200);
  });
  it("counts in-progress orders", () => {
    expect(metrics.active).toBe(2);
  });
  it("groups by branch, naming unassigned orders", () => {
    expect(metrics.branches.map((entry) => [entry.name, entry.orders, entry.revenue])).toEqual([["Dhanmondi", 2, 500], ["Gulshan", 1, 0], ["Unassigned", 1, 100]]);
  });
  it("lists the three channels even when empty and keeps unknown ones out", () => {
    expect(metrics.channels.map((entry) => entry.channel)).toEqual(["kiosk", "webapp", "website"]);
    expect(metrics.channels.find((entry) => entry.channel === "webapp")).toMatchObject({ active: 1, orders: 2, revenue: 200 });
  });
  it("ranks popular items, ignoring cancelled orders and lines from orders not in view", () => {
    expect(metrics.items.map((entry) => [entry.name, entry.quantity])).toEqual([["Borhani", 4], ["Biryani", 3]]);
  });
  it("handles an empty view", () => {
    expect(computeMetrics([], [], [])).toMatchObject({ averageOrderValue: 0, orders: 0, revenue: 0 });
  });
});
