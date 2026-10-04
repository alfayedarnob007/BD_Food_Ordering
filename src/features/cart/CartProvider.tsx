import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type CartLine = { menuItemId: string; name: string; price: number; quantity: number };
export type Cart = { lines: CartLine[]; restaurantId?: string; restaurantName?: string };

type CartContextValue = {
  add: (restaurant: { id: string; name: string }, line: Omit<CartLine, "quantity">) => void;
  cart: Cart;
  clear: () => void;
  count: number;
  setQuantity: (menuItemId: string, quantity: number) => void;
  subtotal: number;
};

const CART_KEY = "bd-food:cart";
const EMPTY: Cart = { lines: [] };
const CartContext = createContext<CartContextValue | undefined>(undefined);

function readStored(): Cart {
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? (JSON.parse(raw) as Cart) : EMPTY;
  } catch {
    return EMPTY;
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<Cart>(readStored);

  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch {
      // Storage can be blocked (private mode); the cart just won't survive a reload.
    }
  }, [cart]);

  // A cart holds one restaurant's items: adding from a different restaurant
  // starts a fresh cart rather than mixing two kitchens into one order.
  const add = useCallback<CartContextValue["add"]>((restaurant, line) => {
    setCart((current) => {
      const base: Cart = current.restaurantId === restaurant.id ? current : { lines: [], restaurantId: restaurant.id, restaurantName: restaurant.name };
      const existing = base.lines.find((entry) => entry.menuItemId === line.menuItemId);
      const lines = existing
        ? base.lines.map((entry) => (entry.menuItemId === line.menuItemId ? { ...entry, quantity: entry.quantity + 1 } : entry))
        : [...base.lines, { ...line, quantity: 1 }];
      return { ...base, lines };
    });
  }, []);

  const setQuantity = useCallback((menuItemId: string, quantity: number) => {
    setCart((current) => {
      const lines = current.lines.flatMap((entry) => (entry.menuItemId === menuItemId ? (quantity > 0 ? [{ ...entry, quantity }] : []) : [entry]));
      return lines.length ? { ...current, lines } : EMPTY;
    });
  }, []);

  const clear = useCallback(() => setCart(EMPTY), []);

  const value = useMemo<CartContextValue>(() => ({
    add,
    cart,
    clear,
    count: cart.lines.reduce((sum, line) => sum + line.quantity, 0),
    setQuantity,
    subtotal: cart.lines.reduce((sum, line) => sum + line.price * line.quantity, 0)
  }), [add, cart, clear, setQuantity]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within CartProvider");
  return context;
}
