import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Radio, RefreshCw, ShoppingCart, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ActionButton } from "../../shared/ui/ActionButton";
import { Alert } from "../../shared/ui/Alert";
import { EmptyState } from "../../shared/ui/EmptyState";
import { ErrorState } from "../../shared/ui/ErrorState";
import { PageHeader } from "../../shared/ui/PageHeader";
import { Skeleton } from "../../shared/ui/Skeleton";
import { CHANNELS, listBranches, listPresence, listRestaurantOrders, listRestaurants, startPresence, updatePresence } from "../food/api";
import type { Channel } from "../food/api";
import { AdminTabs } from "./AdminTabs";
import { pushSample, summarizeChannels, todayUtc } from "./presence";
import type { Sample } from "./presence";
import { useStaff } from "./useStaff";
import type { PageProps } from "../../app/router/routes";

const LABEL: Record<Channel, string> = { kiosk: "Kiosk", webapp: "Web app", website: "Website" };
// Fixed hue per channel, matching the dashboard, so colour always means the same channel.
const SERIES: Record<Channel, string> = { kiosk: "var(--viz-1)", webapp: "var(--viz-2)", website: "var(--viz-3)" };
const BEAT_EVERY_MS = 20_000;

export function ChannelsPage({ onNavigate }: PageProps) {
  const { assignment, isLoading } = useStaff();
  if (isLoading) return <section><PageHeader title="Channels" subtitle="Loading your access..." /><Skeleton className="skeleton-line-lg" /></section>;
  if (!assignment || assignment.role === "kitchen-staff") {
    return (
      <section>
        <PageHeader title="Channels" subtitle="Managers only" />
        <EmptyState title="No access" description="Channel activity is for restaurant admins and branch managers." action={<ActionButton onClick={() => onNavigate("/admin")}>Back to Operations</ActionButton>} />
      </section>
    );
  }
  return <Channels onNavigate={onNavigate} restaurantId={assignment.restaurantId} lockedBranch={assignment.role === "branch-manager" ? assignment.branchId || undefined : undefined} />;
}

function Channels({ lockedBranch, onNavigate, restaurantId }: { lockedBranch?: string; onNavigate: (path: string) => void; restaurantId: string }) {
  const queryClient = useQueryClient();
  const [branchChoice, setBranchChoice] = useState("");
  const [samples, setSamples] = useState<Sample[]>([]);
  const branchFilter = lockedBranch ?? (branchChoice || undefined);
  // Re-render every 10s so "active" ages out between fetches.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(id);
  }, []);

  const restaurants = useQuery({ queryFn: listRestaurants, queryKey: ["restaurants"] });
  const branches = useQuery({ queryFn: () => listBranches(restaurantId), queryKey: ["branches", restaurantId] });
  const orders = useQuery({ queryFn: () => listRestaurantOrders(restaurantId), queryKey: ["admin", "orders", restaurantId], refetchInterval: 15_000 });
  const day = todayUtc(now);
  const sessions = useQuery({ queryFn: () => listPresence(restaurantId, day), queryKey: ["presence", restaurantId, day], refetchInterval: 10_000 });

  const rows = summarizeChannels(sessions.data ?? [], orders.data ?? [], now, branchFilter);
  const totalActive = rows.reduce((sum, row) => sum + row.active, 0);
  const restaurantName = restaurants.data?.find((entry) => entry.ItemId === restaurantId)?.name ?? "Your restaurant";
  const branchName = (id: string) => branches.data?.find((entry) => entry.ItemId === id)?.name ?? "your branch";

  // One trend point per presence refresh, whatever branch filter is active.
  useEffect(() => {
    if (!sessions.data) return;
    const at = Date.now();
    setSamples((current) => pushSample(current, summarizeChannels(sessions.data ?? [], orders.data ?? [], at, branchFilter), at));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions.dataUpdatedAt, branchFilter]);

  return (
    <section className="viz-root">
      <PageHeader title="Channels" subtitle={restaurantName} actions={<ActionButton variant="icon" title="Refresh now" onClick={() => { void sessions.refetch(); void orders.refetch(); }} icon={<RefreshCw size={18} />} />} />
      <AdminTabs active="/admin/channels" onNavigate={onNavigate} />

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
        <span className="muted live-note"><Activity size={14} /> Live &middot; refreshes every 10s</span>
      </div>

      {sessions.isError ? <ErrorState message="Could not load customer activity." onRetry={() => sessions.refetch()} /> : null}
      <Alert tone="info">Web-app numbers are real customers using this app. Kiosk and website have no live apps yet, so their numbers come from the simulator below.</Alert>

      <div className="metrics channel-cards">
        {rows.map((row) => (
          <div key={row.channel} className="metric channel-card" style={{ borderTop: `3px solid ${SERIES[row.channel]}` }}>
            <span className="panel-title"><Radio size={16} />{LABEL[row.channel]}</span>
            {sessions.isLoading ? <Skeleton className="skeleton-line-lg" /> : <strong>{row.active}</strong>}
            <small>active customer{row.active === 1 ? "" : "s"} now</small>
            <ul className="channel-stats">
              <li><ShoppingCart size={13} /> {row.withCart} with items in cart</li>
              <li>{row.inProgress} order{row.inProgress === 1 ? "" : "s"} in progress</li>
              <li>{row.lastHourOrders} placed in the last hour</li>
            </ul>
          </div>
        ))}
      </div>

      <div className="panel">
        <div className="panel-title"><span>Active customers over time</span></div>
        <div className="legend" aria-label="Channel legend">
          {CHANNELS.map((channel) => <span key={channel}><i style={{ background: SERIES[channel] }} />{LABEL[channel]}</span>)}
        </div>
        <Trend samples={samples} />
        <p className="muted trend-note">{totalActive} active in total. History builds up while this page is open and is not stored.</p>
      </div>

      <details className="raw-details">
        <summary>View as table</summary>
        <div className="table-shell">
          <table>
            <thead><tr><th>Channel</th><th>Active now</th><th>With cart</th><th>In progress</th><th>Last hour</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.channel}><td>{LABEL[row.channel]}</td><td>{row.active}</td><td>{row.withCart}</td><td>{row.inProgress}</td><td>{row.lastHourOrders}</td></tr>)}</tbody>
          </table>
        </div>
      </details>

      <PresenceSimulator branchIds={(branches.data ?? []).map((entry) => entry.ItemId)} restaurantId={restaurantId} onBeat={() => void queryClient.invalidateQueries({ queryKey: ["presence", restaurantId] })} />
    </section>
  );
}

function Trend({ samples }: { samples: Sample[] }) {
  const width = 640;
  const height = 150;
  const pad = { bottom: 22, left: 30, right: 14, top: 10 };
  const max = Math.max(1, ...samples.flatMap((sample) => CHANNELS.map((channel) => sample.counts[channel])));
  const top = Math.ceil(max / 2) * 2;
  const first = samples[0]?.at ?? 0;
  const span = Math.max(60_000, (samples.at(-1)?.at ?? 0) - first);
  const x = (at: number) => pad.left + ((at - first) / span) * (width - pad.left - pad.right);
  const y = (value: number) => pad.top + (1 - value / top) * (height - pad.top - pad.bottom);
  const minutes = Math.round(span / 60_000);
  const latest = samples.at(-1);

  if (samples.length < 2) return <p className="muted">Collecting data... the trend appears after the second refresh.</p>;
  return (
    <svg className="trend" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Active customers over the last ${minutes} minutes. Now: ${CHANNELS.map((channel) => `${LABEL[channel]} ${latest?.counts[channel] ?? 0}`).join(", ")}.`}>
      {[0, top / 2, top].map((tick) => (
        <g key={tick}>
          <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} className="trend-grid" />
          <text x={pad.left - 6} y={y(tick) + 4} textAnchor="end" className="trend-axis">{tick}</text>
        </g>
      ))}
      <text x={pad.left} y={height - 4} className="trend-axis">{minutes} min ago</text>
      <text x={width - pad.right} y={height - 4} textAnchor="end" className="trend-axis">now</text>
      {CHANNELS.map((channel) => (
        <g key={channel}>
          <polyline fill="none" stroke={SERIES[channel]} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} points={samples.map((sample) => `${x(sample.at)},${y(sample.counts[channel])}`).join(" ")} />
          {latest ? <circle cx={x(latest.at)} cy={y(latest.counts[channel])} r={4} fill={SERIES[channel]} className="trend-dot" /> : null}
        </g>
      ))}
    </svg>
  );
}

// Dev tool: stands in for kiosk and website customers by writing real presence
// records and refreshing them while this page is open. Stop (or close the tab)
// and they age out of "active" within two minutes.
function PresenceSimulator({ branchIds, onBeat, restaurantId }: { branchIds: string[]; onBeat: () => void; restaurantId: string }) {
  const [running, setRunning] = useState(false);
  const [counts, setCounts] = useState<Record<Channel, number>>({ kiosk: 4, webapp: 0, website: 6 });
  const [error, setError] = useState<string | undefined>();
  const countsRef = useRef(counts);
  const records = useRef<Record<Channel, string[]>>({ kiosk: [], webapp: [], website: [] });
  countsRef.current = counts;

  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    async function beatAll() {
      try {
        for (const channel of CHANNELS) {
          const wanted = countsRef.current[channel];
          const ids = records.current[channel];
          for (let index = 0; index < wanted && !cancelled; index += 1) {
            const beat = {
              branchId: branchIds.length ? (branchIds[index % branchIds.length] as string) : "",
              cartCount: (index + Math.floor(Math.random() * 3)) % 4,
              channel,
              page: index % 2 ? "/menu" : "/browse",
              restaurantId,
              userId: ""
            };
            const existing = ids[index];
            if (existing) await updatePresence(existing, beat);
            else {
              const created = await startPresence(`sim-${channel}-${index}-${Date.now()}`, beat);
              if (!created) throw new Error("A simulated session was created but its id could not be read back.");
              ids[index] = created;
            }
          }
        }
        if (!cancelled) { setError(undefined); onBeat(); }
      } catch (caught) {
        if (!cancelled) setError((caught as Error).message);
      }
    }
    void beatAll();
    const id = window.setInterval(() => void beatAll(), BEAT_EVERY_MS);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [running, restaurantId, branchIds, onBeat]);

  return (
    <details className="raw-details" open>
      <summary>Customer simulator (dev)</summary>
      <div className="panel">
        <p className="muted">Creates real presence records for simulated customers and refreshes them every {BEAT_EVERY_MS / 1000}s while this page is open. Set how many customers each channel should have.</p>
        <div className="sim-grid">
          {CHANNELS.map((channel) => (
            <label key={channel} className="form-field">
              <span>{LABEL[channel]} customers</span>
              <input type="number" min={0} max={20} value={counts[channel]} onChange={(event) => setCounts((current) => ({ ...current, [channel]: Math.max(0, Math.min(20, Number(event.target.value) || 0)) }))} />
            </label>
          ))}
        </div>
        <div className="toolbar">
          <ActionButton onClick={() => setRunning((value) => !value)} icon={<Sparkles size={16} />}>{running ? "Stop simulating" : "Start simulating"}</ActionButton>
          {running ? <span className="muted"><Activity size={14} /> Sending presence</span> : <span className="muted">Stopped &middot; customers drop out within 2 minutes</span>}
        </div>
        {error ? <Alert tone="error">{error}</Alert> : null}
      </div>
    </details>
  );
}
