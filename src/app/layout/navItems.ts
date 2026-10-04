import { ReceiptText, Store, UserRound } from "lucide-react";

export const navItems = [
  { href: "/", labelKey: "nav.restaurants", icon: Store },
  { href: "/orders", labelKey: "nav.orders", icon: ReceiptText },
  { href: "/profile", labelKey: "nav.profile", icon: UserRound }
] as const;
