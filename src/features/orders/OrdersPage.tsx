import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ReceiptText } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "../../shared/ui/EmptyState";
import { ErrorState } from "../../shared/ui/ErrorState";
import { PageHeader } from "../../shared/ui/PageHeader";
import { Skeleton } from "../../shared/ui/Skeleton";
import { StatusPill } from "../../shared/ui/StatusPill";
import { ActionButton } from "../../shared/ui/ActionButton";
import { useCurrentUser } from "../profile/useCurrentUser";
import { formatBdt, listMyOrders, listOrderItems, listRestaurants, seedSampleOrders } from "../food/api";
import type { Order, OrderStatus } from "../food/api";
import type { PageProps } from "../../app/router/routes";

const STATUS_LABELS: Record<OrderStatus, string> = {
  accepted: "Accepted",
  cancelled: "Cancelled",
  delivered: "Delivered",
  out_for_delivery: "Out for delivery",
  placed: "Placed",
  preparing: "Preparing"
};

function statusTone(status: OrderStatus): "good" | "neutral" | "warn" {
  if (status === "delivered") return "good";
  if (status === "cancelled") return "neutral";
  return "warn";
}

export function OrdersPage({ onNavigate }: PageProps) {
  const me = useCurrentUser();
  const customerId = me.data?.data?.itemId;
  const queryClient = useQueryClient();
  const orders = useQuery({
    enabled: Boolean(customerId),
    queryFn: () => listMyOrders(customerId as string),
    queryKey: ["orders", customerId]
  });
  const restaurants = useQuery({ queryFn: listRestaurants, queryKey: ["restaurants"] });
  const seed = useMutation({
    mutationFn: () => seedSampleOrders(customerId as string),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["orders"] })
  });
  const restaurantName = (id: string) => restaurants.data?.find((entry) => entry.ItemId === id)?.name ?? "Restaurant";

  return (
    <section>
      <PageHeader title="My orders" subtitle="Your order history." />

      {orders.isError ? <ErrorState message="Could not load your orders." onRetry={() => orders.refetch()} /> : null}
      {me.isLoading || orders.isLoading ? <div className="panel"><Skeleton className="skeleton-line-lg" /><Skeleton className="skeleton-line" /></div> : null}
      {orders.isSuccess && orders.data.length === 0 ? (
        <EmptyState
          icon={<ReceiptText size={32} />}
          title="No orders yet"
          description="Your placed orders will show up here."
          action={(
            <div className="page-actions">
              <ActionButton onClick={() => onNavigate("/")}>Browse restaurants</ActionButton>
              {restaurants.data?.length ? <ActionButton onClick={() => seed.mutate()} disabled={seed.isPending}>{seed.isPending ? "Adding..." : "Add sample orders (dev)"}</ActionButton> : null}
            </div>
          )}
        />
      ) : null}

      <div className="menu-list">
        {orders.data?.map((order) => <OrderCard key={order.ItemId} order={order} restaurantName={restaurantName(order.restaurantId)} />)}
      </div>
    </section>
  );
}

function OrderCard({ order, restaurantName }: { order: Order; restaurantName: string }) {
  const [open, setOpen] = useState(false);
  const items = useQuery({ enabled: open, queryFn: () => listOrderItems(order.ItemId), queryKey: ["orderItems", order.ItemId] });

  return (
    <div className="panel">
      <div className="order-head">
        <strong>{restaurantName}</strong>
        <StatusPill tone={statusTone(order.status)}>{STATUS_LABELS[order.status] ?? order.status}</StatusPill>
      </div>
      <p className="muted">{order.deliveryAddress}</p>
      <div className="order-head">
        <span className="muted">{order.paymentMethod?.toUpperCase()}</span>
        <strong className="mono">{formatBdt(order.total)}</strong>
      </div>
      <button className="link-button" onClick={() => setOpen((value) => !value)}>{open ? "Hide items" : "Show items"}</button>
      {open ? (
        items.isLoading ? <Skeleton className="skeleton-line" /> : (
          <ul className="order-items">
            {items.data?.map((line) => <li key={line.ItemId}>{line.quantity} &times; {line.name} <span className="muted">{formatBdt(line.unitPrice * line.quantity)}</span></li>)}
          </ul>
        )
      ) : null}
    </div>
  );
}
