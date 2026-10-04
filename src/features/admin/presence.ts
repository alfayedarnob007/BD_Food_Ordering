import { CHANNELS } from "../food/channels";
import type { Channel, Order, PresenceSession } from "../food/api";
import { isActive as orderInProgress } from "./metrics";

// Beats arrive every ~30s, so four missed beats means the customer has left.
export const ACTIVE_WITHIN_MS = 120_000;

const seenAt = (session: Pick<PresenceSession, "lastSeenAt">) => (session.lastSeenAt ? Date.parse(session.lastSeenAt) : Number.NaN);

export function isSessionActive(session: Pick<PresenceSession, "lastSeenAt">, now = Date.now()): boolean {
  const seen = seenAt(session);
  // A beat stamped in the future (a skewed device clock) is not evidence of presence.
  return Number.isFinite(seen) && seen <= now + 30_000 && now - seen <= ACTIVE_WITHIN_MS;
}

export type ChannelRow = { active: number; channel: Channel; inProgress: number; lastHourOrders: number; withCart: number };

export function summarizeChannels(sessions: PresenceSession[], orders: Order[], now = Date.now(), branchId?: string): ChannelRow[] {
  const inBranch = <T extends { branchId?: string }>(row: T) => !branchId || row.branchId === branchId;
  return CHANNELS.map((channel) => {
    const live = sessions.filter((session) => session.channel === channel && inBranch(session) && isSessionActive(session, now));
    const mine = orders.filter((order) => order.channel === channel && inBranch(order));
    return {
      active: live.length,
      channel,
      inProgress: mine.filter(orderInProgress).length,
      lastHourOrders: mine.filter((order) => {
        const placed = order.placedAt ? Date.parse(order.placedAt) : Number.NaN;
        return Number.isFinite(placed) && now - placed <= 3_600_000 && now - placed >= 0;
      }).length,
      withCart: live.filter((session) => (session.cartCount ?? 0) > 0).length
    };
  });
}

export type Sample = { at: number; counts: Record<Channel, number> };

// Rolling in-memory history for the trend line. It only exists while the page
// is open, which the UI says out loud -- nothing is stored.
export function pushSample(samples: Sample[], rows: ChannelRow[], now: number, max = 180): Sample[] {
  const counts = { kiosk: 0, webapp: 0, website: 0 } as Record<Channel, number>;
  for (const row of rows) counts[row.channel] = row.active;
  return [...samples, { at: now, counts }].slice(-max);
}

export const todayUtc = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
