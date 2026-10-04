import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Search, Store, Utensils } from "lucide-react";
import { useState } from "react";
import { useT } from "../../lib/i18n/LocalizationProvider";
import { ActionButton } from "../../shared/ui/ActionButton";
import { Alert } from "../../shared/ui/Alert";
import { EmptyState } from "../../shared/ui/EmptyState";
import { ErrorState } from "../../shared/ui/ErrorState";
import { PageHeader } from "../../shared/ui/PageHeader";
import { Skeleton } from "../../shared/ui/Skeleton";
import { useCurrentUser } from "../profile/useCurrentUser";
import { listRestaurants, seedSampleData } from "../food/api";
import type { PageProps } from "../../app/router/routes";

export function RestaurantsPage({ onNavigate }: PageProps) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const me = useCurrentUser();
  const customerId = me.data?.data?.itemId;
  const [search, setSearch] = useState("");
  const restaurants = useQuery({ queryFn: listRestaurants, queryKey: ["restaurants"] });
  const seed = useMutation({
    mutationFn: () => seedSampleData(customerId),
    onSuccess: () => Promise.all([queryClient.invalidateQueries({ queryKey: ["restaurants"] }), queryClient.invalidateQueries({ queryKey: ["orders"] })])
  });

  const term = search.trim().toLowerCase();
  const visible = (restaurants.data ?? []).filter((restaurant) =>
    !term || [restaurant.name, restaurant.area, restaurant.city, ...(restaurant.cuisines ?? [])].some((value) => value?.toLowerCase().includes(term))
  );

  return (
    <section>
      <PageHeader title={t("nav.restaurants")} subtitle="Order from restaurants near you." />

      <div className="toolbar">
        <label className="search-box">
          <Search size={16} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, area or cuisine" />
        </label>
      </div>

      {restaurants.isError ? <ErrorState message="Could not load restaurants." onRetry={() => restaurants.refetch()} /> : null}
      {seed.isError ? <Alert tone="error">{(seed.error as Error).message}</Alert> : null}

      {restaurants.isLoading ? (
        <div className="grid">{[0, 1, 2].map((key) => <div key={key} className="panel"><Skeleton className="skeleton-line-lg" /><Skeleton className="skeleton-line" /></div>)}</div>
      ) : null}

      {restaurants.isSuccess && visible.length === 0 ? (
        <EmptyState
          icon={<Store size={32} />}
          title={term ? "No matches" : "No restaurants yet"}
          description={term ? "Try a different search." : "Nothing has been added to the menu yet."}
          action={term ? undefined : (
            <ActionButton onClick={() => seed.mutate()} disabled={seed.isPending || !customerId} icon={<Utensils size={16} />}>
              {seed.isPending ? "Adding sample data..." : "Add sample data (dev)"}
            </ActionButton>
          )}
        />
      ) : null}

      <div className="grid">
        {visible.map((restaurant) => (
          <button key={restaurant.ItemId} className="panel restaurant-card" onClick={() => onNavigate(`/restaurants/${encodeURIComponent(restaurant.ItemId)}`)}>
            <strong>{restaurant.name}</strong>
            {restaurant.description ? <span className="muted">{restaurant.description}</span> : null}
            <span className="muted"><MapPin size={14} /> {[restaurant.area, restaurant.city].filter(Boolean).join(", ") || "Location not set"}</span>
            {restaurant.cuisines?.length ? (
              <span className="chips">{restaurant.cuisines.map((cuisine) => <span key={cuisine} className="chip">{cuisine}</span>)}</span>
            ) : null}
          </button>
        ))}
      </div>
    </section>
  );
}
