import { LayoutDashboard, ReceiptText, Store, UserRound } from "lucide-react";

export const navItems = [
  { href: "/", labelKey: "nav.restaurants", icon: Store, staffOnly: false },
  { href: "/orders", labelKey: "nav.orders", icon: ReceiptText, staffOnly: false },
  { href: "/admin", labelKey: "nav.admin", icon: LayoutDashboard, staffOnly: true },
  { href: "/profile", labelKey: "nav.profile", icon: UserRound, staffOnly: false }
] as const;
