import { useEffect, useRef } from "react";
import { useCart } from "../../features/cart/CartProvider";
import { useCurrentUser } from "../../features/profile/useCurrentUser";
import { startPresence, updatePresence } from "../../features/food/api";
import type { PresenceBeat } from "../../features/food/api";

const BEAT_EVERY_MS = 30_000;
const RECORD_KEY = "bd-food:presence-record";

// Tells the operations portal this web-app customer is here. Renders nothing,
// never blocks the UI, and swallows failures: presence is a nice-to-have and
// must not break ordering.
export function PresenceBeacon({ path }: { path: string }) {
  const me = useCurrentUser();
  const { cart, count } = useCart();
  const latest = useRef<PresenceBeat | undefined>();
  const recordId = useRef<string | undefined>(readRecord());
  const inFlight = useRef(false);

  // Staff on the admin pages are not customers; the marketplace home has no
  // restaurant, so it is attributed to none until they open one.
  const viewing = path.startsWith("/restaurants/") ? decodeURIComponent(path.split("/")[2] ?? "") : path === "/cart" ? cart.restaurantId ?? "" : "";
  latest.current = path.startsWith("/admin") ? undefined : {
    branchId: cart.branchId ?? "",
    cartCount: count,
    channel: "webapp",
    page: path.split("/").slice(0, 2).join("/") || "/",
    restaurantId: viewing,
    userId: me.data?.data?.itemId ?? ""
  };

  useEffect(() => {
    async function beat() {
      const payload = latest.current;
      if (!payload || document.visibilityState !== "visible" || inFlight.current) return;
      inFlight.current = true;
      try {
        if (recordId.current) {
          // A thrown error (network blip) keeps the record and retries next beat;
          // only a confirmed "no such record" starts a fresh session, otherwise
          // one customer would be counted twice.
          if (await updatePresence(recordId.current, payload)) return;
          recordId.current = undefined;
        }
        const created = await startPresence(crypto.randomUUID(), payload);
        recordId.current = created;
        writeRecord(created);
      } catch (error) {
        console.warn("Presence beat failed", error);
      } finally {
        inFlight.current = false;
      }
    }
    void beat();
    const id = window.setInterval(() => void beat(), BEAT_EVERY_MS);
    document.addEventListener("visibilitychange", beat);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", beat);
    };
  }, []);

  return null;
}

function readRecord(): string | undefined {
  try { return sessionStorage.getItem(RECORD_KEY) ?? undefined; } catch { return undefined; }
}
function writeRecord(id?: string) {
  try { if (id) sessionStorage.setItem(RECORD_KEY, id); } catch { /* storage blocked: a new session starts on reload */ }
}
