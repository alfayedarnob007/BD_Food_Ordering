import type { Order, OrderStatus } from "../food/api";

export type ColumnKey = "new" | "preparing" | "ready" | "out";

export const COLUMNS: Array<{ key: ColumnKey; label: string; statuses: OrderStatus[] }> = [
  { key: "new", label: "New", statuses: ["placed"] },
  { key: "preparing", label: "Preparing", statuses: ["accepted", "preparing"] },
  { key: "ready", label: "Ready", statuses: ["ready"] },
  { key: "out", label: "Out for delivery", statuses: ["out_for_delivery"] }
];

// What a kitchen user does next with a ticket in each status.
export const NEXT_STEP: Partial<Record<OrderStatus, { label: string; status: OrderStatus }>> = {
  accepted: { label: "Start preparing", status: "preparing" },
  out_for_delivery: { label: "Delivered", status: "delivered" },
  placed: { label: "Accept", status: "accepted" },
  preparing: { label: "Mark ready", status: "ready" },
  ready: { label: "Out for delivery", status: "out_for_delivery" }
};
export const CANCELLABLE: OrderStatus[] = ["placed", "accepted"];

// Minutes a ticket may sit in a stage before it counts as late. These are
// service targets, not measurements -- tune them per restaurant.
export const LATE_AFTER_MIN: Record<OrderStatus, number> = {
  accepted: 20,
  cancelled: Infinity,
  delivered: Infinity,
  out_for_delivery: 40,
  placed: 5,
  preparing: 20,
  ready: 10
};

// The clock that matters is the one for the current stage, not the whole order.
function stageStart(order: Order): number {
  const iso =
    order.status === "ready" || order.status === "out_for_delivery" ? order.readyAt ?? order.placedAt
    : order.status === "accepted" || order.status === "preparing" ? order.acceptedAt ?? order.placedAt
    : order.placedAt;
  const parsed = iso ? Date.parse(iso) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

// NaN-safe: an order with no timestamps has an unknown age, never "0 minutes".
export function stageMinutes(order: Order, now = Date.now()): number | undefined {
  const start = stageStart(order);
  return Number.isFinite(start) ? Math.max(0, Math.floor((now - start) / 60_000)) : undefined;
}

export const isLate = (order: Order, now = Date.now()): boolean => {
  const minutes = stageMinutes(order, now);
  return minutes !== undefined && minutes >= LATE_AFTER_MIN[order.status];
};

export type KitchenHealth = {
  avgPrepMinutes?: number;
  late: number;
  level: "healthy" | "busy" | "overloaded";
  oldestWaitingMinutes?: number;
  queue: number;
  reason: string;
};

// Deliberately a rule of thumb with its reason shown, not a made-up score.
// Queue = tickets the kitchen still has to cook (New + Preparing).
export function kitchenHealth(orders: Order[], now = Date.now()): KitchenHealth {
  const cooking = orders.filter((order) => order.status === "placed" || order.status === "accepted" || order.status === "preparing");
  const late = orders.filter((order) => isLate(order, now)).length;
  const waits = orders.filter((order) => order.status === "placed").map((order) => stageMinutes(order, now)).filter((m): m is number => m !== undefined);

  const prep = orders
    .filter((order) => order.acceptedAt && order.readyAt)
    .map((order) => (Date.parse(order.readyAt as string) - Date.parse(order.acceptedAt as string)) / 60_000)
    .filter((minutes) => Number.isFinite(minutes) && minutes >= 0);

  const lateShare = cooking.length ? late / cooking.length : 0;
  let level: KitchenHealth["level"] = "healthy";
  let reason = "Queue is moving and nothing is overdue.";
  if (late >= 3 || lateShare >= 0.5 || cooking.length >= 15) {
    level = "overloaded";
    reason = late >= 3 || lateShare >= 0.5 ? `${late} ticket${late === 1 ? " is" : "s are"} overdue.` : `${cooking.length} tickets in the queue.`;
  } else if (late > 0 || cooking.length >= 8) {
    level = "busy";
    reason = late > 0 ? `${late} ticket${late === 1 ? " is" : "s are"} overdue.` : `${cooking.length} tickets in the queue.`;
  }

  return {
    avgPrepMinutes: prep.length ? Math.round(prep.reduce((sum, minutes) => sum + minutes, 0) / prep.length) : undefined,
    late,
    level,
    oldestWaitingMinutes: waits.length ? Math.max(...waits) : undefined,
    queue: cooking.length,
    reason
  };
}
