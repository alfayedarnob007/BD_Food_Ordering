import { CHANNELS } from "../food/channels";
import type { Branch, Channel, Order, OrderItem, OrderStatus } from "../food/api";

export type RangeKey = "today" | "7d" | "30d" | "all";
export const RANGES: Array<{ key: RangeKey; label: string }> = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "all", label: "All time" }
];

// Orders still moving through the kitchen or out for delivery.
export const ACTIVE_STATUSES: OrderStatus[] = ["placed", "accepted", "preparing", "ready", "out_for_delivery"];
export const isActive = (order: Order) => ACTIVE_STATUSES.includes(order.status);

export const UNASSIGNED = "__unassigned__";

function rangeStart(range: RangeKey, now: number): number | undefined {
  if (range === "all") return undefined;
  if (range === "today") return new Date(new Date(now).setHours(0, 0, 0, 0)).getTime();
  return now - (range === "7d" ? 7 : 30) * 86_400_000;
}

// An order with no placedAt (created before timestamps existed) only shows up
// under "All time" -- guessing a date for it would put it in the wrong bucket.
export function filterOrders(orders: Order[], range: RangeKey, branchId: string | undefined, now = Date.now()): Order[] {
  const start = rangeStart(range, now);
  return orders.filter((order) => {
    if (branchId && (order.branchId || UNASSIGNED) !== branchId) return false;
    if (start === undefined) return true;
    const placed = order.placedAt ? Date.parse(order.placedAt) : Number.NaN;
    return Number.isFinite(placed) && placed >= start;
  });
}

export type BranchRow = { active: number; id: string; name: string; orders: number; revenue: number };
export type ChannelRow = { active: number; channel: Channel | "unknown"; orders: number; revenue: number };
export type ItemRow = { name: string; quantity: number; revenue: number };

export type Metrics = {
  active: number;
  averageOrderValue: number;
  branches: BranchRow[];
  channels: ChannelRow[];
  items: ItemRow[];
  orders: number;
  revenue: number;
};

export function computeMetrics(orders: Order[], lines: OrderItem[], branches: Branch[]): Metrics {
  // Cancelled orders count as orders but never as revenue.
  const earns = (order: Order) => (order.status === "cancelled" ? 0 : order.total || 0);

  const branchRows = new Map<string, BranchRow>();
  const branchName = (id: string) => (id === UNASSIGNED ? "Unassigned" : branches.find((entry) => entry.ItemId === id)?.name ?? "Unknown branch");
  const channelRows = new Map<string, ChannelRow>(CHANNELS.map((channel) => [channel, { active: 0, channel, orders: 0, revenue: 0 }]));

  for (const order of orders) {
    const branchId = order.branchId || UNASSIGNED;
    const branchRow = branchRows.get(branchId) ?? { active: 0, id: branchId, name: branchName(branchId), orders: 0, revenue: 0 };
    branchRow.orders += 1;
    branchRow.revenue += earns(order);
    if (isActive(order)) branchRow.active += 1;
    branchRows.set(branchId, branchRow);

    const channelKey = order.channel && channelRows.has(order.channel) ? order.channel : "unknown";
    const channelRow = channelRows.get(channelKey) ?? { active: 0, channel: "unknown" as const, orders: 0, revenue: 0 };
    channelRow.orders += 1;
    channelRow.revenue += earns(order);
    if (isActive(order)) channelRow.active += 1;
    channelRows.set(channelKey, channelRow);
  }

  // Popular items only count lines that belong to the orders in view and were
  // not cancelled -- otherwise a cancelled order would inflate demand.
  const live = new Set(orders.filter((order) => order.status !== "cancelled").map((order) => order.ItemId));
  const itemRows = new Map<string, ItemRow>();
  for (const line of lines) {
    if (!live.has(line.orderId)) continue;
    const row = itemRows.get(line.name) ?? { name: line.name, quantity: 0, revenue: 0 };
    row.quantity += line.quantity;
    row.revenue += line.quantity * line.unitPrice;
    itemRows.set(line.name, row);
  }

  const revenue = orders.reduce((sum, order) => sum + earns(order), 0);
  const paying = orders.filter((order) => order.status !== "cancelled").length;
  return {
    active: orders.filter(isActive).length,
    averageOrderValue: paying ? Math.round(revenue / paying) : 0,
    branches: [...branchRows.values()].sort((a, b) => b.orders - a.orders),
    channels: [...channelRows.values()].filter((row) => row.channel !== "unknown" || row.orders > 0),
    items: [...itemRows.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 8),
    orders: orders.length,
    revenue
  };
}
