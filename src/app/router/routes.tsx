import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import { AppShell } from "../layout/AppShell";
import { RedirectIfAuthenticated, RequireAuth } from "./guards";
import { CallbackPage } from "../../features/auth/CallbackPage";
import { ErrorPage } from "../../features/auth/ErrorPage";
import { LoginPage } from "../../features/auth/LoginPage";
import { NotFoundPage } from "../../features/auth/NotFoundPage";
import { AdminPage } from "../../features/admin/AdminPage";
import { KitchenPage } from "../../features/admin/KitchenPage";
import { CartPage } from "../../features/cart/CartPage";
import { OrdersPage } from "../../features/orders/OrdersPage";
import { ProfilePage } from "../../features/profile/ProfilePage";
import { RestaurantMenuPage } from "../../features/restaurants/RestaurantMenuPage";
import { RestaurantsPage } from "../../features/restaurants/RestaurantsPage";

export type PageProps = { onNavigate: (path: string) => void; path: string };

const protectedRoutes: Record<string, ComponentType<PageProps>> = {
  "/admin": AdminPage,
  "/admin/kitchen": KitchenPage,
  "/": RestaurantsPage,
  "/cart": CartPage,
  "/error": ErrorPage,
  "/orders": OrdersPage,
  "/profile": ProfilePage
};

export function AppRouter() {
  const [path, setPath] = useState(() => window.location.pathname);
  const [search, setSearch] = useState(() => window.location.search);

  useEffect(() => {
    const onPopState = () => {
      setPath(window.location.pathname);
      setSearch(window.location.search);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function navigate(nextPath: string) {
    const [nextPathname = "/", queryString = ""] = nextPath.split("?");
    window.history.pushState({}, "", nextPath);
    setPath(nextPathname);
    setSearch(queryString ? `?${queryString}` : "");
  }

  if (path === "/login/callback") {
    return <CallbackPage onNavigate={navigate} />;
  }

  if (path === "/login") {
    const returnTo = new URLSearchParams(search).get("returnTo") || undefined;
    return (
      <RedirectIfAuthenticated onNavigate={navigate}>
        <LoginPage returnTo={returnTo} />
      </RedirectIfAuthenticated>
    );
  }

  const Page = path.startsWith("/restaurants/") ? RestaurantMenuPage : protectedRoutes[path];
  if (!Page) {
    return <NotFoundPage onNavigate={navigate} />;
  }

  return (
    <RequireAuth currentPath={path} onNavigate={navigate}>
      <AppShell activePath={path.startsWith("/restaurants/") ? "/" : path.startsWith("/admin") ? "/admin" : path} onNavigate={navigate}>
        <Page onNavigate={navigate} path={path} />
      </AppShell>
    </RequireAuth>
  );
}
