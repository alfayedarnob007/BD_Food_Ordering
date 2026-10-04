import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { useCart } from "./CartProvider";
import { Alert } from "../../shared/ui/Alert";
import { ActionButton } from "../../shared/ui/ActionButton";
import { EmptyState } from "../../shared/ui/EmptyState";
import { PageHeader } from "../../shared/ui/PageHeader";
import { useCurrentUser } from "../profile/useCurrentUser";
import { DELIVERY_FEE_BDT, PAYMENT_METHODS, formatBdt, placeOrder } from "../food/api";
import type { PaymentMethod } from "../food/api";
import type { PageProps } from "../../app/router/routes";

const PAYMENT_LABELS: Record<PaymentMethod, string> = { bkash: "bKash", cod: "Cash on delivery", nagad: "Nagad" };

export function CartPage({ onNavigate }: PageProps) {
  const { cart, clear, setQuantity, subtotal } = useCart();
  const me = useCurrentUser();
  const queryClient = useQueryClient();
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cod");
  const [notes, setNotes] = useState("");
  const customerId = me.data?.data?.itemId;
  const total = subtotal + DELIVERY_FEE_BDT;

  const order = useMutation({
    mutationFn: () => {
      if (!customerId || !cart.restaurantId) throw new Error("Your profile is still loading. Try again in a moment.");
      return placeOrder(
        { customerId, deliveryAddress: address.trim(), deliveryFee: DELIVERY_FEE_BDT, notes: notes.trim(), paymentMethod, phone: phone.trim(), restaurantId: cart.restaurantId, status: "placed", subtotal, total },
        cart.lines.map((line) => ({ menuItemId: line.menuItemId, name: line.name, quantity: line.quantity, unitPrice: line.price }))
      );
    },
    onSuccess: () => {
      clear();
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      onNavigate("/orders");
    }
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    order.mutate();
  }

  if (cart.lines.length === 0) {
    return (
      <section>
        <PageHeader title="Your cart" subtitle="Nothing here yet." />
        <EmptyState
          icon={<ShoppingCart size={32} />}
          title="Your cart is empty"
          description="Pick a restaurant and add something tasty."
          action={<ActionButton onClick={() => onNavigate("/")}>Browse restaurants</ActionButton>}
        />
      </section>
    );
  }

  return (
    <section>
      <PageHeader title="Your cart" subtitle={`From ${cart.restaurantName ?? "your restaurant"}`} />

      <div className="panel cart-lines">
        {cart.lines.map((line) => (
          <div key={line.menuItemId} className="cart-line">
            <div><strong>{line.name}</strong><p className="muted">{formatBdt(line.price)} each</p></div>
            <div className="qty">
              <ActionButton variant="icon" aria-label={`Remove one ${line.name}`} onClick={() => setQuantity(line.menuItemId, line.quantity - 1)} icon={line.quantity === 1 ? <Trash2 size={16} /> : <Minus size={16} />} />
              <span>{line.quantity}</span>
              <ActionButton variant="icon" aria-label={`Add one ${line.name}`} onClick={() => setQuantity(line.menuItemId, line.quantity + 1)} icon={<Plus size={16} />} />
            </div>
            <strong className="mono">{formatBdt(line.price * line.quantity)}</strong>
          </div>
        ))}
        <div className="cart-totals">
          <span>Subtotal</span><span>{formatBdt(subtotal)}</span>
          <span>Delivery</span><span>{formatBdt(DELIVERY_FEE_BDT)}</span>
          <strong>Total</strong><strong>{formatBdt(total)}</strong>
        </div>
      </div>

      <form className="panel form-grid" onSubmit={submit}>
        <label className="form-field" style={{ gridColumn: "1 / -1" }}>
          <span>Delivery address</span>
          <input required value={address} onChange={(event) => setAddress(event.target.value)} placeholder="House, road, area, city" />
        </label>
        <label className="form-field">
          <span>Phone</span>
          <input required type="tel" pattern="01[3-9][0-9]{8}" title="Bangladeshi mobile number, e.g. 01712345678" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="01XXXXXXXXX" />
        </label>
        <label className="form-field">
          <span>Payment</span>
          <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}>
            {PAYMENT_METHODS.map((method) => <option key={method} value={method}>{PAYMENT_LABELS[method]}</option>)}
          </select>
        </label>
        <label className="form-field" style={{ gridColumn: "1 / -1" }}>
          <span>Notes (optional)</span>
          <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Less spicy, call on arrival..." />
        </label>
        {paymentMethod !== "cod" ? <div style={{ gridColumn: "1 / -1" }}><Alert tone="info">Online payment is not connected yet. This order is recorded with {PAYMENT_LABELS[paymentMethod]} selected and nothing is charged.</Alert></div> : null}
        {order.isError ? <div style={{ gridColumn: "1 / -1" }}><Alert tone="error">{(order.error as Error).message}</Alert></div> : null}
        <div className="form-actions">
          <ActionButton type="submit" disabled={order.isPending || !customerId}>{order.isPending ? "Placing order..." : `Place order · ${formatBdt(total)}`}</ActionButton>
        </div>
      </form>
    </section>
  );
}
