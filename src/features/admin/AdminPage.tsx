import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Banknote, RefreshCw, ShieldCheck, ShoppingBag, Wallet } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { ActionButton } from "../../shared/ui/ActionButton";
import { Alert } from "../../shared/ui/Alert";
import { EmptyState } from "../../shared/ui/EmptyState";
import { ErrorState } from "../../shared/ui/ErrorState";
import { PageHeader } from "../../shared/ui/PageHeader";
import { Skeleton } from "../../shared/ui/Skeleton";
import { StatusPill } from "../../shared/ui/StatusPill";
import { useCurrentUser } from "../profile/useCurrentUser";
import { createAssignment, formatBdt, listAllOrderItems, listBranches, listRestaurantOrders, listRestaurants } from "../food/api";
import type { Channel, Order, StaffAssignment } from "../food/api";
import { ACTIVE_STATUSES, RANGES, UNASSIGNED, computeMetrics, filterOrders, isActive } from "./metrics";
import type { RangeKey } from "./metrics";
import { AdminTabs } from "./AdminTabs";
import { DemoOrdersButton } from "./DemoOrdersButton";
import { useStaff } from "./useStaff";
import type { PageProps } from "../../app/router/routes";

const CHANNEL_LABELS: Record<Channel | "unknown", string> = { kiosk: "Kiosk", unknown: "Unknown", webapp: "Web app", website: "Website" };
// Fixed hue per channel (never by rank), so a filter never repaints survivors.
const CHANNEL_SERIES: Record<Channel | "unknown", string> = { kiosk: "var(--viz-1)", unknown: "var(--viz-muted)", webapp: "var(--viz-2)", website: "var(--viz-3)" };
const STATUS_LABELS: Record<string, string> = { accepted: "Accepted", out_for_delivery: "Out for delivery", placed: "Placed", preparing: "Preparing", ready: "Ready" };

export function AdminPage({ onNavigate }: PageProps) {
  const { assignment, isLoading, userId } = useStaff();

  if (isLoading) return <section><PageHeader title="Operations" subtitle="Loading your access..." /><Skeleton className="skeleton-line-lg" /></section>;
  if (!assignment) return <StaffSetup userId={userId} />;
  if (assignment.role === "kitchen-staff") {
    return (
      <section>
        <PageHeader title="Operations" subtitle="Kitchen staff" />
        <EmptyState icon={<ShieldCheck size={32} />} title="Your role is the kitchen board" description="Kitchen staff work from the live board, not the management dashboard." action={<ActionButton onClick={() => onNavigate("/admin/kitchen")}>Open kitchen board</ActionButton>} />
      </section>
    );
  }
  return <Dashboard assignment={assignment} onNavigate={onNavigate} />;
}

// Dev bootstrap: nothing can grant the first admin role from inside the app, so
// let the signed-in user claim it for a restaurant. Remove before real use.
function StaffSetup({ userId }: { userId?: string }) {
  const me = useCurrentUser();
  const queryClient = useQueryClient();
  const restaurants = useQuery({ queryFn: listRestaurants, queryKey: ["restaurants"] });
  const [restaurantId, setRestaurantId] = useState("");
  const chosen = restaurantId || restaurants.data?.[0]?.ItemId || "";
  const claim = useMutation({
    mutationFn: () => createAssignment({ branchId: "", email: me.data?.data?.email, restaurantId: chosen, role: "restaurant-admin", userId: userId as string }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["staff"] })
  });

  return (
    <section>
      <PageHeader title="Operations" subtitle="Restaurant admin portal" />
      <div className="panel">
        <div className="panel-title"><ShieldCheck size={16} /><span>No staff access yet</span></div>
        <p className="muted">Your account is not assigned to a restaurant. Choose one to continue as its admin.</p>
        <Alert tone="info">Development shortcut: this lets any signed-in user make themselves an admin. It is not safe for real use.</Alert>
        {restaurants.data?.length === 0 ? <p className="muted">No restaurants exist yet. Add the sample data from the Restaurants page first.</p> : (
          <div className="toolbar">
            <label className="form-field">
              <span>Restaurant</span>
              <select value={chosen} onChange={(event) => setRestaurantId(event.target.value)}>
                {restaurants.data?.map((entry) => <option key={entry.ItemId} value={entry.ItemId}>{entry.name}</option>)}
              </select>
            </label>
            <ActionButton onClick={() => claim.mutate()} disabled={claim.isPending || !chosen || !userId}>{claim.isPending ? "Saving..." : "Continue as restaurant admin"}</ActionButton>
          </div>
        )}
        {claim.isError ? <Alert tone="error">{(claim.error as Error).message}</Alert> : null}
      </div>
    </section>
  );
}

function Dashboard({ assignment, onNavigate }: { assignment: StaffAssignment; onNavigate: (path: string) => void }) {
  const { restaurantId } = assignment;
  const lockedBranch = assignment.role === "branch-manager" && assignment.branchId ? assignment.branchId : undefined;
  const [range, setRange] = useState<RangeKey>("7d");
  const [branchChoice, setBranchChoice] = useState("");
  const branchFilter = lockedBranch ?? (branchChoice || undefined);

  const restaurants = useQuery({ queryFn: listRestaurants, queryKey: ["restaurants"] });
  const branches = useQuery({ queryFn: () => listBranches(restaurantId), queryKey: ["branches", restaurantId] });
  // Orders are the live number: poll often. Line items only feed "popular items".
  const orders = useQuery({ queryFn: () => listRestaurantOrders(restaurantId), queryKey: ["admin", "orders", restaurantId], refetchInterval: 15_000 });
  const lines = useQuery({ queryFn: listAllOrderItems, queryKey: ["admin", "lines"], refetchInterval: 60_000 });

  const restaurantName = restaurants.data?.find((entry) => entry.ItemId === restaurantId)?.name ?? "Your restaurant";
  const scoped = filterOrders(orders.data ?? [], range, branchFilter);
  const metrics = computeMetrics(scoped, lines.data ?? [], branches.data ?? []);
  const hasUnassigned = (orders.data ?? []).some((order) => !order.branchId);
  const maxBranch = Math.max(1, ...metrics.branches.map((row) => row.orders));
  const maxChannel = Math.max(1, ...metrics.channels.map((row) => row.orders));
  const maxItem = Math.max(1, ...metrics.items.map((row) => row.quantity));
  const liveOrders = scoped.filter(isActive).slice(0, 8);
  const branchLabel = (order: Order) => branches.data?.find((entry) => entry.ItemId === order.branchId)?.name ?? "Unassigned";

  return (
    <section className="viz-root">
      <PageHeader
        title="Operations"
        subtitle={`${restaurantName}${lockedBranch ? ` · ${branches.data?.find((entry) => entry.ItemId === lockedBranch)?.name ?? "your branch"}` : ""}`}
        actions={<ActionButton variant="icon" title="Refresh now" onClick={() => { void orders.refetch(); void lines.refetch(); }} icon={<RefreshCw size={18} />} />}
      />

      <AdminTabs active="/admin" onNavigate={onNavigate} />

      <div className="toolbar">
        <div className="segmented" role="group" aria-label="Date range">
          {RANGES.map((entry) => (
            <button key={entry.key} className={range === entry.key ? "active" : ""} aria-pressed={range === entry.key} onClick={() => setRange(entry.key)}>{entry.label}</button>
          ))}
        </div>
        {lockedBranch ? null : (
          <label className="form-field inline-field">
            <span>Branch</span>
            <select value={branchChoice} onChange={(event) => setBranchChoice(event.target.value)}>
              <option value="">All branches</option>
              {branches.data?.map((entry) => <option key={entry.ItemId} value={entry.ItemId}>{entry.name}</option>)}
              {hasUnassigned ? <option value={UNASSIGNED}>Unassigned</option> : null}
            </select>
          </label>
        )}
        <span className="muted live-note"><Activity size={14} /> Live &middot; refreshes every 15s</span>
      </div>

      {orders.isError ? <ErrorState message="Could not load orders." onRetry={() => orders.refetch()} /> : null}

      <div className="metrics">
        <Kpi icon={<ShoppingBag size={16} />} label="Orders" loading={orders.isLoading} value={metrics.orders.toLocaleString("en-US")} />
        <Kpi icon={<Banknote size={16} />} label="Revenue" loading={orders.isLoading} value={formatBdt(metrics.revenue)} note="excludes cancelled" />
        <Kpi icon={<Wallet size={16} />} label="Average order" loading={orders.isLoading} value={formatBdt(metrics.averageOrderValue)} />
        <Kpi icon={<Activity size={16} />} label="Active now" loading={orders.isLoading} value={String(metrics.active)} note={`${ACTIVE_STATUSES.length} live statuses`} />
      </div>

      {orders.isSuccess && scoped.length === 0 ? (
        <EmptyState title="No orders in this view" description={range === "all" ? "Nothing has been ordered yet." : "Try a wider date range or another branch."} action={range === "all" ? <DemoOrdersButton restaurantId={restaurantId} /> : undefined} />
      ) : null}

      <div className="viz-grid">
        <div className="panel">
          <div className="panel-title"><span>Orders by branch</span></div>
          <div className="bars">
            {metrics.branches.map((row) => (
              <BarRow key={row.id} label={row.name} fill="var(--viz-1)" max={maxBranch} value={row.orders} detail={`${formatBdt(row.revenue)}${row.active ? ` · ${row.active} live` : ""}`} />
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-title"><span>Channels</span></div>
          <div className="legend" aria-label="Channel legend">
            {metrics.channels.map((row) => <span key={row.channel}><i style={{ background: CHANNEL_SERIES[row.channel] }} />{CHANNEL_LABELS[row.channel]}</span>)}
          </div>
          <div className="bars">
            {metrics.channels.map((row) => (
              <BarRow key={row.channel} label={CHANNEL_LABELS[row.channel]} fill={CHANNEL_SERIES[row.channel]} max={maxChannel} value={row.orders} detail={`${row.active} in progress · ${formatBdt(row.revenue)}`} />
            ))}
          </div>
        </div>
      </div>

      <div className="viz-grid">
        <div className="panel">
          <div className="panel-title"><span>Most popular items</span></div>
          {lines.isLoading ? <Skeleton className="skeleton-line-lg" /> : metrics.items.length === 0 ? <p className="muted">No items sold in this view.</p> : (
            <div className="bars">
              {metrics.items.map((row) => <BarRow key={row.name} label={row.name} fill="var(--viz-1)" max={maxItem} value={row.quantity} detail={formatBdt(row.revenue)} />)}
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-title"><span>Orders in progress</span></div>
          {liveOrders.length === 0 ? <p className="muted">Nothing in progress right now.</p> : (
            <ul className="live-list">
              {liveOrders.map((order) => (
                <li key={order.ItemId}>
                  <div>
                    <strong>{branchLabel(order)}</strong>
                    <span className="muted">{CHANNEL_LABELS[order.channel ?? "unknown"]} &middot; {minutesAgo(order.placedAt)}</span>
                  </div>
                  <StatusPill tone={order.status === "ready" || order.status === "out_for_delivery" ? "good" : "warn"}>{STATUS_LABELS[order.status] ?? order.status}</StatusPill>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <details className="raw-details">
        <summary>Dev tools</summary>
        <DemoOrdersButton restaurantId={restaurantId} />
      </details>

      <details className="raw-details">
        <summary>View as table</summary>
        <div className="table-shell">
          <table>
            <thead><tr><th>Branch</th><th>Orders</th><th>Live</th><th>Revenue</th></tr></thead>
            <tbody>{metrics.branches.map((row) => <tr key={row.id}><td>{row.name}</td><td>{row.orders}</td><td>{row.active}</td><td>{formatBdt(row.revenue)}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="table-shell">
          <table>
            <thead><tr><th>Channel</th><th>Orders</th><th>In progress</th><th>Revenue</th></tr></thead>
            <tbody>{metrics.channels.map((row) => <tr key={row.channel}><td>{CHANNEL_LABELS[row.channel]}</td><td>{row.orders}</td><td>{row.active}</td><td>{formatBdt(row.revenue)}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="table-shell">
          <table>
            <thead><tr><th>Item</th><th>Sold</th><th>Revenue</th></tr></thead>
            <tbody>{metrics.items.map((row) => <tr key={row.name}><td>{row.name}</td><td>{row.quantity}</td><td>{formatBdt(row.revenue)}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

function Kpi({ icon, label, loading, note, value }: { icon: ReactNode; label: string; loading?: boolean; note?: string; value: string }) {
  return (
    <div className="metric">
      <span className="panel-title">{icon}{label}</span>
      {loading ? <Skeleton className="skeleton-line-lg" /> : <strong>{value}</strong>}
      {note ? <small>{note}</small> : null}
    </div>
  );
}

function BarRow({ detail, fill, label, max, value }: { detail?: string; fill: string; label: string; max: number; value: number }) {
  return (
    <div className="bar-row" title={`${label}: ${value}${detail ? ` · ${detail}` : ""}`}>
      <span className="bar-label">{label}</span>
      <span className="bar-track"><span className="bar-fill" style={{ background: fill, width: `${value > 0 ? Math.max(3, (value / max) * 100) : 0}%` }} /></span>
      <span className="bar-value">{value}</span>
      {detail ? <span className="bar-detail muted">{detail}</span> : null}
    </div>
  );
}

function minutesAgo(iso?: string): string {
  const placed = iso ? Date.parse(iso) : Number.NaN;
  if (!Number.isFinite(placed)) return "time unknown";
  const minutes = Math.max(0, Math.round((Date.now() - placed) / 60_000));
  if (minutes < 1) return "just now";
  return minutes < 60 ? `${minutes} min ago` : `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
}
