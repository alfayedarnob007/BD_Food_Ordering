import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Clock, MapPin, Phone, Plus, ShoppingCart } from "lucide-react";
import { useCart } from "../cart/CartProvider";
import { ActionButton } from "../../shared/ui/ActionButton";
import { EmptyState } from "../../shared/ui/EmptyState";
import { ErrorState } from "../../shared/ui/ErrorState";
import { PageHeader } from "../../shared/ui/PageHeader";
import { Skeleton } from "../../shared/ui/Skeleton";
import { formatBdt, listMenuItems, listRestaurants } from "../food/api";
import type { MenuItem } from "../food/api";
import type { PageProps } from "../../app/router/routes";

export function RestaurantMenuPage({ onNavigate, path }: PageProps) {
  const restaurantId = decodeURIComponent(path.split("/")[2] ?? "");
  const { add, cart, count, subtotal } = useCart();
  // The restaurant list is already cached from the previous page, so the
  // detail lookup reuses it instead of a second per-record query.
  const restaurants = useQuery({ queryFn: listRestaurants, queryKey: ["restaurants"] });
  const menu = useQuery({ queryFn: () => listMenuItems(restaurantId), queryKey: ["menu", restaurantId] });
  const restaurant = restaurants.data?.find((entry) => entry.ItemId === restaurantId);

  const available = (menu.data ?? []).filter((item) => item.isAvailable !== false);
  const byCategory = available.reduce<Record<string, MenuItem[]>>((groups, item) => {
    const key = item.category || "Menu";
    (groups[key] ??= []).push(item);
    return groups;
  }, {});

  return (
    <section>
      <PageHeader
        title={restaurant?.name ?? "Menu"}
        subtitle={restaurant?.description ?? ""}
        actions={<ActionButton variant="icon" onClick={() => onNavigate("/")} title="Back to restaurants" icon={<ArrowLeft size={18} />} />}
      />

      {restaurant ? (
        <div className="chips restaurant-meta">
          {restaurant.address ? <span className="chip"><MapPin size={12} /> {restaurant.address}</span> : null}
          {restaurant.openingHours ? <span className="chip"><Clock size={12} /> {restaurant.openingHours}</span> : null}
          {restaurant.phone ? <span className="chip"><Phone size={12} /> {restaurant.phone}</span> : null}
        </div>
      ) : null}

      {menu.isError ? <ErrorState message="Could not load the menu." onRetry={() => menu.refetch()} /> : null}
      {menu.isLoading ? <div className="panel"><Skeleton className="skeleton-line-lg" /><Skeleton className="skeleton-line" /></div> : null}
      {menu.isSuccess && available.length === 0 ? <EmptyState title="Menu is empty" description="This restaurant has no available items right now." /> : null}

      {Object.entries(byCategory).map(([category, items]) => (
        <div key={category} className="menu-category">
          <h3>{category}</h3>
          <div className="menu-list">
            {items.map((item) => (
              <div key={item.ItemId} className="panel menu-row">
                <div>
                  <strong>{item.name}</strong>
                  {item.description ? <p className="muted">{item.description}</p> : null}
                </div>
                <div className="menu-row-actions">
                  <strong className="mono">{formatBdt(item.price)}</strong>
                  <ActionButton
                    onClick={() => add({ id: restaurantId, name: restaurant?.name ?? "Restaurant" }, { menuItemId: item.ItemId, name: item.name, price: item.price })}
                    icon={<Plus size={16} />}
                  >
                    Add
                  </ActionButton>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {count > 0 && cart.restaurantId === restaurantId ? (
        <div className="cart-bar">
          <span>{count} item{count === 1 ? "" : "s"} &middot; {formatBdt(subtotal)}</span>
          <ActionButton onClick={() => onNavigate("/cart")} icon={<ShoppingCart size={16} />}>View cart</ActionButton>
        </div>
      ) : null}
    </section>
  );
}
