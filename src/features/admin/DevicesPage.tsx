import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, MonitorSmartphone, Plus, RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ActionButton } from "../../shared/ui/ActionButton";
import { Alert } from "../../shared/ui/Alert";
import { EmptyState } from "../../shared/ui/EmptyState";
import { ErrorState } from "../../shared/ui/ErrorState";
import { Modal } from "../../shared/ui/Modal";
import { PageHeader } from "../../shared/ui/PageHeader";
import { Skeleton } from "../../shared/ui/Skeleton";
import { StatusPill } from "../../shared/ui/StatusPill";
import { createDevice, listBranches, listDevices, listRestaurants, sendHeartbeat } from "../food/api";
import type { Device, Heartbeat } from "../food/api";
import { AdminTabs } from "./AdminTabs";
import { deviceIssues, deviceState, lastSeenLabel, latestVersion, summarizeFleet } from "./devices";
import type { DeviceState } from "./devices";
import { useStaff } from "./useStaff";
import type { PageProps } from "../../app/router/routes";

const STATE_LABEL: Record<DeviceState, string> = { delayed: "Delayed", never: "Never connected", offline: "Offline", online: "Online" };
const STATE_TONE: Record<DeviceState, "good" | "neutral" | "warn"> = { delayed: "warn", never: "neutral", offline: "warn", online: "good" };
const PRINTER_LABEL = { error: "Error", ok: "OK", paper_low: "Paper low" } as const;

type SimMode = "normal" | "offline" | "printer" | "slow";
const SIM_LABEL: Record<SimMode, string> = { normal: "Healthy", offline: "Go offline", printer: "Printer fault", slow: "Slow network" };
const BEAT_EVERY_MS = 20_000;

export function DevicesPage({ onNavigate }: PageProps) {
  const { assignment, isLoading } = useStaff();
  if (isLoading) return <section><PageHeader title="Devices" subtitle="Loading your access..." /><Skeleton className="skeleton-line-lg" /></section>;
  if (!assignment || assignment.role === "kitchen-staff") {
    return (
      <section>
        <PageHeader title="Devices" subtitle="Managers only" />
        <EmptyState title="No access" description="Device health is for restaurant admins and branch managers." action={<ActionButton onClick={() => onNavigate("/admin")}>Back to Operations</ActionButton>} />
      </section>
    );
  }
  return <Fleet onNavigate={onNavigate} restaurantId={assignment.restaurantId} lockedBranch={assignment.role === "branch-manager" ? assignment.branchId || undefined : undefined} />;
}

function Fleet({ lockedBranch, onNavigate, restaurantId }: { lockedBranch?: string; onNavigate: (path: string) => void; restaurantId: string }) {
  const queryClient = useQueryClient();
  const [branchChoice, setBranchChoice] = useState("");
  const [adding, setAdding] = useState(false);
  // Re-render every 10s so "last seen" and online/offline move between fetches.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(id);
  }, []);

  const restaurants = useQuery({ queryFn: listRestaurants, queryKey: ["restaurants"] });
  const branches = useQuery({ queryFn: () => listBranches(restaurantId), queryKey: ["branches", restaurantId] });
  const fleet = useQuery({ queryFn: () => listDevices(restaurantId), queryKey: ["devices", restaurantId], refetchInterval: 10_000 });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["devices", restaurantId] });

  const branchFilter = lockedBranch ?? (branchChoice || undefined);
  const devices = (fleet.data ?? []).filter((device) => !branchFilter || device.branchId === branchFilter);
  const newest = latestVersion(fleet.data ?? []);
  const summary = summarizeFleet(devices, now);
  const restaurantName = restaurants.data?.find((entry) => entry.ItemId === restaurantId)?.name ?? "Your restaurant";
  const branchName = (id: string) => branches.data?.find((entry) => entry.ItemId === id)?.name ?? "Unknown branch";
  const grouped = [...new Set(devices.map((device) => device.branchId))].map((id) => ({ devices: devices.filter((device) => device.branchId === id), id }));

  return (
    <section className="viz-root">
      <PageHeader title="Devices" subtitle={restaurantName} actions={<ActionButton variant="icon" title="Refresh now" onClick={() => void refresh()} icon={<RefreshCw size={18} />} />} />
      <AdminTabs active="/admin/devices" onNavigate={onNavigate} />

      <div className="toolbar">
        {lockedBranch ? <span className="chip">{branchName(lockedBranch)}</span> : (
          <label className="form-field inline-field">
            <span>Branch</span>
            <select value={branchChoice} onChange={(event) => setBranchChoice(event.target.value)}>
              <option value="">All branches</option>
              {branches.data?.map((entry) => <option key={entry.ItemId} value={entry.ItemId}>{entry.name}</option>)}
            </select>
          </label>
        )}
        <ActionButton onClick={() => setAdding(true)} icon={<Plus size={16} />} disabled={!branches.data?.length}>Add device</ActionButton>
        <span className="muted live-note"><Activity size={14} /> Live &middot; refreshes every 10s</span>
      </div>

      {fleet.isError ? <ErrorState message="Could not load devices." onRetry={() => fleet.refetch()} /> : null}
      {branches.isSuccess && branches.data.length === 0 ? <Alert tone="warn">This restaurant has no branches yet. Add demo orders on the Kitchen page to create some.</Alert> : null}

      <div className="metrics">
        <div className="metric"><span className="panel-title"><MonitorSmartphone size={16} />Online</span><strong>{summary.online} / {summary.total}</strong><small>reporting in the last 90s</small></div>
        <div className="metric"><span className="panel-title">Delayed</span><strong>{summary.delayed}</strong><small>quiet for 90s to 5 min</small></div>
        <div className="metric"><span className="panel-title">Offline</span><strong>{summary.offline}</strong><small>quiet for over 5 min</small></div>
        <div className="metric"><span className="panel-title">Need attention</span><strong>{summary.withIssues}</strong><small>offline, faults or outdated</small></div>
      </div>

      {fleet.isLoading ? <div className="panel"><Skeleton className="skeleton-line-lg" /><Skeleton className="skeleton-line" /></div> : null}
      {fleet.isSuccess && devices.length === 0 ? (
        <EmptyState icon={<MonitorSmartphone size={32} />} title="No devices registered" description="Register a kiosk, or load a demo fleet." action={<DemoFleetButton restaurantId={restaurantId} onDone={refresh} />} />
      ) : null}

      {grouped.map((group) => (
        <div key={group.id} className="panel">
          <div className="panel-title"><span>{branchName(group.id)}</span></div>
          <div className="table-shell">
            <table>
              <thead><tr><th>Device</th><th>Status</th><th>Last seen</th><th>App</th><th>Printer</th><th>Latency</th><th>Issues</th></tr></thead>
              <tbody>
                {group.devices.map((device) => {
                  const state = deviceState(device, now);
                  const issues = deviceIssues(device, state, newest);
                  const reporting = state === "online" || state === "delayed";
                  return (
                    <tr key={device.ItemId}>
                      <td><strong>{device.name}</strong></td>
                      <td><StatusPill tone={STATE_TONE[state]}>{STATE_LABEL[state]}</StatusPill></td>
                      <td className="mono">{lastSeenLabel(device, now)}</td>
                      <td className="mono">{device.appVersion ?? "—"}</td>
                      <td>{reporting && device.printerStatus ? PRINTER_LABEL[device.printerStatus] : "—"}</td>
                      <td className="mono">{reporting && device.latencyMs !== undefined ? `${device.latencyMs} ms` : "—"}</td>
                      <td>{issues.length === 0 ? <span className="muted">None</span> : <div className="chips">{issues.map((issue) => <span key={issue.label} className={`chip issue-${issue.severity}`}>{issue.label}</span>)}</div>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {devices.length > 0 ? <Simulator devices={devices} onBeat={refresh} /> : null}
      {adding ? <AddDeviceDialog branches={branches.data ?? []} defaultBranch={branchFilter} restaurantId={restaurantId} onClose={() => setAdding(false)} onDone={() => { setAdding(false); void refresh(); }} /> : null}
    </section>
  );
}

// Dev tool: stands in for real kiosks by sending heartbeats from this page.
// It only runs while this page is open -- closing the tab is the same as every
// kiosk going dark, so don't read a quiet fleet as a bug.
function Simulator({ devices, onBeat }: { devices: Device[]; onBeat: () => void }) {
  const [running, setRunning] = useState(false);
  const [modes, setModes] = useState<Record<string, SimMode>>({});
  const [error, setError] = useState<string | undefined>();
  const modesRef = useRef(modes);
  const devicesRef = useRef(devices);
  const uptime = useRef<Record<string, number>>({});
  modesRef.current = modes;
  devicesRef.current = devices;

  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    async function beatAll() {
      try {
        for (const device of devicesRef.current) {
          const mode = modesRef.current[device.ItemId] ?? "normal";
          if (mode === "offline" || cancelled) continue;
          uptime.current[device.ItemId] = (uptime.current[device.ItemId] ?? device.uptimeMinutes ?? 600) + BEAT_EVERY_MS / 60_000;
          const beat: Heartbeat = {
            appVersion: device.appVersion ?? "2.4.1",
            lastError: mode === "printer" ? "Receipt printer not responding" : "",
            latencyMs: mode === "slow" ? 900 + Math.round(Math.random() * 600) : 60 + Math.round(Math.random() * 140),
            printerStatus: mode === "printer" ? "error" : "ok",
            uptimeMinutes: Math.round(uptime.current[device.ItemId] as number)
          };
          await sendHeartbeat(device.ItemId, beat);
        }
        if (!cancelled) { setError(undefined); onBeat(); }
      } catch (caught) {
        if (!cancelled) setError((caught as Error).message);
      }
    }
    void beatAll();
    const id = window.setInterval(() => void beatAll(), BEAT_EVERY_MS);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [running, onBeat]);

  return (
    <details className="raw-details" open>
      <summary>Device simulator (dev)</summary>
      <div className="panel">
        <p className="muted">No real kiosks are connected, so this page can send their heartbeats for you every {BEAT_EVERY_MS / 1000}s while it stays open. Pick a behaviour per device, then watch the table react.</p>
        <div className="toolbar">
          <ActionButton onClick={() => setRunning((value) => !value)} icon={<Sparkles size={16} />}>{running ? "Stop simulating" : "Start simulating"}</ActionButton>
          {running ? <span className="muted"><Activity size={14} /> Sending heartbeats</span> : <span className="muted">Stopped &middot; devices will drift to offline</span>}
        </div>
        <div className="sim-grid">
          {devices.map((device) => (
            <label key={device.ItemId} className="form-field">
              <span>{device.name}</span>
              <select value={modes[device.ItemId] ?? "normal"} onChange={(event) => setModes((current) => ({ ...current, [device.ItemId]: event.target.value as SimMode }))}>
                {(Object.keys(SIM_LABEL) as SimMode[]).map((mode) => <option key={mode} value={mode}>{SIM_LABEL[mode]}</option>)}
              </select>
            </label>
          ))}
        </div>
        {error ? <Alert tone="error">{error}</Alert> : null}
      </div>
    </details>
  );
}

function AddDeviceDialog({ branches, defaultBranch, onClose, onDone, restaurantId }: { branches: Array<{ ItemId: string; name: string }>; defaultBranch?: string; onClose: () => void; onDone: () => void; restaurantId: string }) {
  const [name, setName] = useState("");
  const [branchId, setBranchId] = useState(defaultBranch ?? branches[0]?.ItemId ?? "");
  const save = useMutation({
    mutationFn: () => createDevice({ appVersion: "2.4.1", branchId, isActive: true, name: name.trim(), restaurantId, type: "kiosk" }),
    onSuccess: onDone
  });
  const valid = name.trim() !== "" && branchId !== "";

  function submit(event: FormEvent) {
    event.preventDefault();
    if (valid) save.mutate();
  }

  return (
    <Modal title="Add kiosk" onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <label className="form-field" style={{ gridColumn: "1 / -1" }}><span>Name</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Front counter kiosk" /></label>
        <label className="form-field" style={{ gridColumn: "1 / -1" }}><span>Branch</span>
          <select value={branchId} onChange={(event) => setBranchId(event.target.value)}>{branches.map((entry) => <option key={entry.ItemId} value={entry.ItemId}>{entry.name}</option>)}</select>
        </label>
        {save.isError ? <div style={{ gridColumn: "1 / -1" }}><Alert tone="error">{(save.error as Error).message}</Alert></div> : null}
        <div className="form-actions">
          <button type="button" className="icon-button" onClick={onClose}>Cancel</button>
          <ActionButton type="submit" disabled={!valid || save.isPending}>{save.isPending ? "Saving..." : "Add kiosk"}</ActionButton>
        </div>
      </form>
    </Modal>
  );
}

// Dev tool: two kiosks per branch, one running an older app version so the
// "outdated" flag has something to show. Additive only.
function DemoFleetButton({ onDone, restaurantId }: { onDone: () => void; restaurantId: string }) {
  const seed = useMutation({
    mutationFn: async () => {
      const branches = await listBranches(restaurantId);
      if (branches.length === 0) throw new Error("Add branches first (use Add demo orders on the Kitchen page).");
      for (const branch of branches) {
        await createDevice({ appVersion: "2.4.1", branchId: branch.ItemId, isActive: true, name: `${branch.name} - Front kiosk`, restaurantId, type: "kiosk" });
        await createDevice({ appVersion: "2.3.0", branchId: branch.ItemId, isActive: true, name: `${branch.name} - Drive-thru kiosk`, restaurantId, type: "kiosk" });
      }
    },
    onSuccess: onDone
  });
  return (
    <div className="demo-tools">
      <ActionButton onClick={() => seed.mutate()} disabled={seed.isPending} icon={<Sparkles size={16} />}>{seed.isPending ? "Adding demo kiosks..." : "Add demo kiosks (dev)"}</ActionButton>
      {seed.isError ? <Alert tone="error">{(seed.error as Error).message}</Alert> : null}
    </div>
  );
}
