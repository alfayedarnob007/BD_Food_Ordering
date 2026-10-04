import { describe, expect, it } from "vitest";
import { compareVersions, deviceIssues, deviceState, lastSeenLabel, latestVersion, summarizeFleet } from "./devices";
import type { Device } from "../food/api";

const now = Date.parse("2026-10-05T12:00:00Z");
const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();
const device = (extra: Partial<Device> = {}) => ({ ItemId: "d", branchId: "b", name: "K1", restaurantId: "r", ...extra }) as Device;

describe("deviceState", () => {
  it("derives status from the last heartbeat with inclusive boundaries", () => {
    expect(deviceState(device(), now)).toBe("never");
    expect(deviceState(device({ lastSeenAt: "garbage" }), now)).toBe("never");
    expect(deviceState(device({ lastSeenAt: ago(90) }), now)).toBe("online");
    expect(deviceState(device({ lastSeenAt: ago(91) }), now)).toBe("delayed");
    expect(deviceState(device({ lastSeenAt: ago(300) }), now)).toBe("delayed");
    expect(deviceState(device({ lastSeenAt: ago(301) }), now)).toBe("offline");
  });
});

describe("versions", () => {
  it("compares numerically, not as strings", () => {
    expect(compareVersions("2.4.1", "2.4.10")).toBe(-1);
    expect(compareVersions("2.10.0", "2.9.9")).toBe(1);
    expect(compareVersions("2.4", "2.4.0")).toBe(0);
    expect(compareVersions(undefined, "1.0.0")).toBe(-1);
    expect(latestVersion([device({ appVersion: "2.4.1" }), device({ appVersion: "2.10.0" }), device()])).toBe("2.10.0");
  });
});

describe("deviceIssues", () => {
  it("shows only 'Not reporting' for an offline device, hiding stale readings", () => {
    expect(deviceIssues(device({ lastSeenAt: ago(900), printerStatus: "error" }), "offline").map((issue) => issue.label)).toEqual(["Not reporting"]);
  });
  it("has no issues for a healthy, current device", () => {
    expect(deviceIssues(device({ appVersion: "2.4.1", latencyMs: 120, printerStatus: "ok" }), "online", "2.4.1")).toEqual([]);
  });
  it("collects every problem on a reporting device", () => {
    const labels = deviceIssues(device({ appVersion: "2.3.0", lastError: "jam", latencyMs: 900, printerStatus: "paper_low" }), "online", "2.4.1").map((issue) => issue.label);
    expect(labels).toHaveLength(4);
    expect(labels).toContain("Paper low");
    expect(labels.some((label) => label.startsWith("Slow network"))).toBe(true);
    expect(labels.some((label) => label.startsWith("Outdated"))).toBe(true);
  });
});

describe("fleet and labels", () => {
  it("summarises states and counts devices needing attention", () => {
    const fleet = summarizeFleet([
      device({ appVersion: "2.4.1", lastSeenAt: ago(10), printerStatus: "ok" }),
      device({ appVersion: "2.4.1", lastSeenAt: ago(10), printerStatus: "error" }),
      device({ appVersion: "2.4.1", lastSeenAt: ago(120) }),
      device({ appVersion: "2.4.1", lastSeenAt: ago(9999) }),
      device()
    ], now);
    expect(fleet).toEqual({ delayed: 1, neverSeen: 1, offline: 1, online: 2, total: 5, withIssues: 4 });
  });
  it("formats last seen", () => {
    expect(lastSeenLabel(device(), now)).toBe("never");
    expect(lastSeenLabel(device({ lastSeenAt: ago(45) }), now)).toBe("45s ago");
    expect(lastSeenLabel(device({ lastSeenAt: ago(125) }), now)).toBe("2 min ago");
    expect(lastSeenLabel(device({ lastSeenAt: ago(3725) }), now)).toBe("1h 2m ago");
  });
});
