import { describe, expect, it } from "vitest";
import { isSessionActive, pushSample, summarizeChannels, todayUtc } from "./presence";
import type { Order, PresenceSession } from "../food/api";

const now = Date.parse("2026-10-05T12:00:00Z");
const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();
const session = (channel: string, seconds: number, extra: Partial<PresenceSession> = {}) => ({ channel, lastSeenAt: ago(seconds), ...extra }) as PresenceSession;
const order = (extra: Partial<Order>) => ({ ItemId: "o", ...extra }) as Order;
const row = (rows: ReturnType<typeof summarizeChannels>, channel: string) => rows.find((entry) => entry.channel === channel)!;

describe("isSessionActive", () => {
  it("is active within two minutes, inclusive", () => {
    expect(isSessionActive({ lastSeenAt: ago(120) }, now)).toBe(true);
    expect(isSessionActive({ lastSeenAt: ago(121) }, now)).toBe(false);
  });
  it("ignores missing, malformed and clock-skewed beats", () => {
    expect(isSessionActive({}, now)).toBe(false);
    expect(isSessionActive({ lastSeenAt: "bad" }, now)).toBe(false);
    expect(isSessionActive({ lastSeenAt: ago(-600) }, now)).toBe(false);
    expect(isSessionActive({ lastSeenAt: ago(-10) }, now)).toBe(true);
  });
});

describe("summarizeChannels", () => {
  const sessions = [
    session("kiosk", 5, { branchId: "a", cartCount: 2 }), session("kiosk", 500, { branchId: "a" }),
    session("webapp", 10, { branchId: "a", cartCount: 0 }), session("webapp", 20, { branchId: "b", cartCount: 3 }),
    session("website", 30, { branchId: "b" }), session("mystery", 1, { branchId: "a" })
  ];
  const orders = [
    order({ branchId: "a", channel: "kiosk", placedAt: ago(600), status: "preparing" }),
    order({ branchId: "a", channel: "kiosk", placedAt: ago(1200), status: "delivered" }),
    order({ branchId: "a", channel: "kiosk", placedAt: ago(7200), status: "delivered" }),
    order({ branchId: "b", channel: "webapp", placedAt: ago(60), status: "placed" }),
    order({ branchId: "a", channel: "webapp", status: "ready" })
  ];

  it("counts active customers, carts, in-progress and last-hour orders per channel", () => {
    const rows = summarizeChannels(sessions, orders, now);
    expect(rows.map((entry) => entry.channel)).toEqual(["kiosk", "webapp", "website"]);
    expect(row(rows, "kiosk")).toMatchObject({ active: 1, inProgress: 1, lastHourOrders: 2, withCart: 1 });
    expect(row(rows, "webapp")).toMatchObject({ active: 2, inProgress: 2, lastHourOrders: 1, withCart: 1 });
  });
  it("filters by branch", () => {
    const rows = summarizeChannels(sessions, orders, now, "b");
    expect(row(rows, "kiosk").active).toBe(0);
    expect(row(rows, "webapp").active).toBe(1);
    expect(row(rows, "website").active).toBe(1);
  });
});

describe("samples", () => {
  it("caps history and records per-channel counts", () => {
    const rows = summarizeChannels([session("kiosk", 5)], [], now);
    let samples: ReturnType<typeof pushSample> = [];
    for (let index = 0; index < 5; index += 1) samples = pushSample(samples, rows, now + index, 3);
    expect(samples).toHaveLength(3);
    expect(samples[0]?.at).toBe(now + 2);
    expect(samples[0]?.counts).toEqual({ kiosk: 1, webapp: 0, website: 0 });
  });
  it("buckets by UTC day", () => {
    expect(todayUtc(Date.parse("2026-10-05T23:59:59Z"))).toBe("2026-10-05");
    expect(todayUtc(Date.parse("2026-10-06T00:00:00Z"))).toBe("2026-10-06");
  });
});
