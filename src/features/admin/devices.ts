import type { Device } from "../food/api";

export type DeviceState = "online" | "delayed" | "offline" | "never";

// A kiosk beats every ~20-30s: three missed beats is "delayed", ten is "offline".
export const ONLINE_WITHIN_MS = 90_000;
export const DELAYED_WITHIN_MS = 5 * 60_000;
export const HIGH_LATENCY_MS = 800;

// Derived at read time. Storing a status field would go stale the moment a
// device died silently, because nothing would be left running to update it.
export function deviceState(device: Pick<Device, "lastSeenAt">, now = Date.now()): DeviceState {
  const seen = device.lastSeenAt ? Date.parse(device.lastSeenAt) : Number.NaN;
  if (!Number.isFinite(seen)) return "never";
  const age = now - seen;
  if (age <= ONLINE_WITHIN_MS) return "online";
  return age <= DELAYED_WITHIN_MS ? "delayed" : "offline";
}

function parseVersion(version?: string): number[] {
  return (version ?? "").split(".").map((part) => Number.parseInt(part, 10)).map((part) => (Number.isFinite(part) ? part : 0));
}

export function compareVersions(a?: string, b?: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

export function latestVersion(devices: Array<Pick<Device, "appVersion">>): string | undefined {
  return devices.map((device) => device.appVersion).filter((v): v is string => Boolean(v)).sort(compareVersions).at(-1);
}

export type DeviceIssue = { label: string; severity: "problem" | "warning" };

// Issues are only meaningful while the device is reporting: a silent device's
// last printer reading is stale, so its offline state is the issue.
export function deviceIssues(device: Device, state: DeviceState, newest?: string): DeviceIssue[] {
  if (state === "offline") return [{ label: "Not reporting", severity: "problem" }];
  if (state === "never") return [{ label: "Never connected", severity: "warning" }];
  const issues: DeviceIssue[] = [];
  if (device.printerStatus === "error") issues.push({ label: "Printer error", severity: "problem" });
  else if (device.printerStatus === "paper_low") issues.push({ label: "Paper low", severity: "warning" });
  if ((device.latencyMs ?? 0) >= HIGH_LATENCY_MS) issues.push({ label: `Slow network (${device.latencyMs} ms)`, severity: "warning" });
  if (newest && device.appVersion && compareVersions(device.appVersion, newest) < 0) issues.push({ label: `Outdated app (${device.appVersion})`, severity: "warning" });
  if (device.lastError) issues.push({ label: `Error: ${device.lastError}`, severity: "problem" });
  if (state === "delayed") issues.push({ label: "Heartbeat delayed", severity: "warning" });
  return issues;
}

export type FleetSummary = { delayed: number; neverSeen: number; offline: number; online: number; total: number; withIssues: number };

export function summarizeFleet(devices: Device[], now = Date.now()): FleetSummary {
  const newest = latestVersion(devices);
  const summary: FleetSummary = { delayed: 0, neverSeen: 0, offline: 0, online: 0, total: devices.length, withIssues: 0 };
  for (const device of devices) {
    const state = deviceState(device, now);
    if (state === "online") summary.online += 1;
    else if (state === "delayed") summary.delayed += 1;
    else if (state === "offline") summary.offline += 1;
    else summary.neverSeen += 1;
    if (deviceIssues(device, state, newest).length > 0) summary.withIssues += 1;
  }
  return summary;
}

export function lastSeenLabel(device: Pick<Device, "lastSeenAt">, now = Date.now()): string {
  const seen = device.lastSeenAt ? Date.parse(device.lastSeenAt) : Number.NaN;
  if (!Number.isFinite(seen)) return "never";
  const seconds = Math.max(0, Math.round((now - seen) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes} min ago` : `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
}
