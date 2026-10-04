import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, ChefHat, Clock, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { ActionButton } from "../../shared/ui/ActionButton";
import { Alert } from "../../shared/ui/Alert";
import { EmptyState } from "../../shared/ui/EmptyState";
import { ErrorState } from "../../shared/ui/ErrorState";
import { PageHeader } from "../../shared/ui/PageHeader";
import { Skeleton } from "../../shared/ui/Skeleton";
import { StatusPill } from "../../shared/ui/StatusPill";
import { listAllOrderItems, listBranches, listRestaurantOrders, listRestaurants, updateOrderStatus } from "../food/api";
import type { Order, OrderItem, OrderStatus } from "../food/api";
import { AdminTabs } from "./AdminTabs";
import { CANCELLABLE, COLUMNS, NEXT_STEP, isLate, kitchenHealth, stageMinutes } from "./kitchen";
import { DemoOrdersButton } from "./DemoOrdersButton";
import { useStaff } from "./useStaff";
import type { PageProps } from "../../app/router/routes";

const CHANNEL_LABELS = { kiosk: "Kiosk", webapp: "Web app", website: "Website" } as const;
const HEALTH_TONE = { busy: "warn", healthy: "good", overloaded: "warn" } as const;
const HEALTH_LABEL = { busy: "Busy", healthy: "Healthy", overloaded: "Overloaded" } as const;

export function KitchenPage({ onNavigate }: PageProps) {
  const { assignment, isLoading } = useStaff();
  if (isLoading) return <section><PageHeader title="Kitchen" subtitle="Loading your access..." /><Skeleton className="skeleton-line-lg" /></section>;
  if (!assignment) {
    return (
      <section>
        <PageHeader title="Kitchen" subtitle="Staff only" />
        <EmptyState title="No staff access" description="Set up your admin access from the Operations page first." action={<ActionButton onClick={() => onNavigate("/admin")}>Go to Operations</ActionButton>} />
      </section>
    );
  }
  return <Board onNavigate={onNavigate} restaurantId={assignment.restaurantId} lockedBranch={assignment.role === "restaurant-admin" ? undefined : assignment.branchId || undefined} canViewDashboard={assignment.role !== "kitchen-staff"} />;
}

function Board({ canViewDashboard, lockedBranch, onNavigate, restaurantId }: { canViewDashboard: boolean; lockedBranch?: string; onNavigate: (path: string) => void; restaurantId: string }) {
  const queryClient = useQueryClient();
  const [branchChoice, setBranchChoice] = useState("");
  const branchFilter = lockedBranch ?? (branchChoice || undefined);
  // Re-render every 30s so ticket timers advance even between data refreshes.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const restaurants = useQuery({ queryFn: listRestaurants, queryKey: ["restaurants"] });
  const branches = useQuery({ queryFn: () => listBranches(restaurantId), queryKey: ["branches", restaurantId] });
  const orders = useQuery({ queryFn: () => listRestaurantOrders(restaurantId), queryKey: ["admin", "orders", restaurantId], refetchInterval: 8_000 });
  const lines = useQuery({ queryFn: listAllOrderItems, queryKey: ["admin", "lines"], refetchInterval: 30_000 });
  const advance = useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: OrderStatus }) => updateOrderStatus(orderId, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "orders", restaurantId] })
  });

  const visible = (orders.data ?? []).filter((order) => !branchFilter || order.branchId === branchFilter);
  const board = visible.filter((order) => COLUMNS.some((column) => column.statuses.includes(order.status)));
  // Prep-time stats use today's finished work too, not just what is on the board.
  const health = kitchenHealth(visible, now);
  const linesByOrder = new Map<string, OrderItem[]>();
  for (const line of lines.data ?? []) linesByOrder.set(line.orderId, [...(linesByOrder.get(line.orderId) ?? []), line]);
  const restaurantName = restaurants.data?.find((entry) => entry.ItemId === restaurantId)?.name ?? "Your restaurant";
  const branchName = (order: Order) => branches.data?.find((entry) => entry.ItemId === order.branchId)?.name;

  return (
    <section className="viz-root">
      <PageHeader
        title="Kitchen"
        subtitle={restaurantName}
        actions={<ActionButton variant="icon" title="Refresh now" onClick={() => { void orders.refetch(); void lines.refetch(); }} icon={<RefreshCw size={18} />} />}
      />
      {canViewDashboard ? <AdminTabs active="/admin/kitchen" onNavigate={onNavigate} /> : null}

      <div className="toolbar">
        {lockedBranch ? <span className="chip">{branches.data?.find((entry) => entry.ItemId === lockedBranch)?.name ?? "Your branch"}</span> : (
          <label className="form-field inline-field">
            <span>Branch</span>
            <select value={branchChoice} onChange={(event) => setBranchChoice(event.target.value)}>
              <option value="">All branches</option>
              {branches.data?.map((entry) => <option key={entry.ItemId} value={entry.ItemId}>{entry.name}</option>)}
            </select>
          </label>
        )}
        <span className="muted live-note"><Activity size={14} /> Live &middot; refreshes every 8s</span>
      </div>

      {orders.isError ? <ErrorState message="Could not load orders." onRetry={() => orders.refetch()} /> : null}
      {advance.isError ? <Alert tone="error">{(advance.error as Error).message}</Alert> : null}

      <div className="metrics">
        <div className="metric">
          <span className="panel-title"><ChefHat size={16} />Kitchen health</span>
          <strong><StatusPill tone={HEALTH_TONE[health.level]}>{HEALTH_LABEL[health.level]}</StatusPill></strong>
          <small>{health.reason}</small>
        </div>
        <div className="metric"><span className="panel-title"><Activity size={16} />In the queue</span><strong>{health.queue}</strong><small>new + preparing</small></div>
        <div className="metric"><span className="panel-title"><Clock size={16} />Overdue</span><strong>{health.late}</strong><small>past the stage target</small></div>
        <div className="metric">
          <span className="panel-title"><Clock size={16} />Avg prep time</span>
          <strong>{health.avgPrepMinutes === undefined ? "—" : `${health.avgPrepMinutes} min`}</strong>
          <small>{health.oldestWaitingMinutes === undefined ? "accepted to ready" : `oldest new ticket ${health.oldestWaitingMinutes} min`}</small>
        </div>
      </div>

      {orders.isSuccess && board.length === 0 ? (
        <EmptyState icon={<ChefHat size={32} />} title="No tickets right now" description="New orders appear here as they come in." action={<DemoOrdersButton restaurantId={restaurantId} />} />
      ) : null}

      <div className="kanban">
        {COLUMNS.map((column) => {
          const tickets = board.filter((order) => column.statuses.includes(order.status)).sort((a, b) => (stageMinutes(b, now) ?? -1) - (stageMinutes(a, now) ?? -1));
          return (
            <div key={column.key} className="kanban-col">
              <h3>{column.label} <span className="count">{tickets.length}</span></h3>
              <div className="kanban-list">
                {tickets.map((order) => {
                  const next = NEXT_STEP[order.status];
                  const late = isLate(order, now);
                  const minutes = stageMinutes(order, now);
                  const items = linesByOrder.get(order.ItemId) ?? [];
                  const busy = advance.isPending && advance.variables?.orderId === order.ItemId;
                  return (
                    <article key={order.ItemId} className={`ticket${late ? " late" : ""}`}>
                      <header>
                        <strong>#{order.ItemId.slice(-4).toUpperCase()}</strong>
                        <span className={late ? "timer late" : "timer"}>{minutes === undefined ? "time unknown" : `${minutes} min`}{late ? " · late" : ""}</span>
                      </header>
                      <p className="muted">{order.channel ? CHANNEL_LABELS[order.channel] : "Unknown channel"}{!branchFilter && branchName(order) ? ` · ${branchName(order)}` : ""}</p>
                      <ul>
                        {items.length === 0 ? <li className="muted">Items loading...</li> : items.map((line) => <li key={line.ItemId}>{line.quantity} &times; {line.name}</li>)}
                      </ul>
                      {order.notes ? <p className="ticket-note">Note: {order.notes}</p> : null}
                      <footer>
                        {next ? <ActionButton disabled={busy} onClick={() => advance.mutate({ orderId: order.ItemId, status: next.status })}>{busy ? "Saving..." : next.label}</ActionButton> : null}
                        {CANCELLABLE.includes(order.status) ? <button className="link-button" disabled={busy} onClick={() => advance.mutate({ orderId: order.ItemId, status: "cancelled" })}>Cancel</button> : null}
                      </footer>
                    </article>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
