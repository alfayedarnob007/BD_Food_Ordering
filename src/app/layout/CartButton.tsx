import { ShoppingCart } from "lucide-react";
import { useCart } from "../../features/cart/CartProvider";

export function CartButton({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { count } = useCart();

  return (
    <button className="icon-button cart-button" aria-label={`Cart, ${count} item${count === 1 ? "" : "s"}`} onClick={() => onNavigate("/cart")}>
      <ShoppingCart size={18} />
      {count > 0 ? <span className="cart-badge">{count}</span> : null}
    </button>
  );
}
