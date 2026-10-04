import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Boxes, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { ActionButton } from "../../shared/ui/ActionButton";
import { Alert } from "../../shared/ui/Alert";
import { EmptyState } from "../../shared/ui/EmptyState";
import { ErrorState } from "../../shared/ui/ErrorState";
import { Modal } from "../../shared/ui/Modal";
import { PageHeader } from "../../shared/ui/PageHeader";
import { Skeleton } from "../../shared/ui/Skeleton";
import { StatusPill } from "../../shared/ui/StatusPill";
import {
  adjustStock, createInventoryItem, deleteRecipeLine, listBranches, listInventory, listMenuItems, listMovements, listRecipes,
  listRestaurants, saveRecipeLine, seedInventoryDemo
} from "../food/api";
import type { InventoryItem, MovementType } from "../food/api";
import { AdminTabs } from "./AdminTabs";
import { ingredientKey, roundQty, stockLevel } from "./stock";
import { useStaff } from "./useStaff";
import type { PageProps } from "../../app/router/routes";

const LEVEL_LABEL = { low: "Low", ok: "OK", out: "Out of stock" } as const;
const LEVEL_TONE = { low: "warn", ok: "good", out: "warn" } as const;
const MOVEMENT_LABEL: Record<MovementType, string> = { adjustment: "Adjustment", restock: "Restock", usage: "Used in order", usage_reversal: "Order cancelled", waste: "Waste" };

export function InventoryPage({ onNavigate }: PageProps) {
  const { assignment, isLoading } = useStaff();
  if (isLoading) return <section><PageHeader title="Inventory" subtitle="Loading your access..." /><Skeleton className="skeleton-line-lg" /></section>;
  if (!assignment || assignment.role === "kitchen-staff") {
    return (
      <section>
        <PageHeader title="Inventory" subtitle="Managers only" />
        <EmptyState title="No access" description="Inventory is for restaurant admins and branch managers." action={<ActionButton onClick={() => onNavigate("/admin")}>Back to Operations</ActionButton>} />
      </section>
    );
  }
  return <Inventory onNavigate={onNavigate} restaurantId={assignment.restaurantId} lockedBranch={assignment.role === "branch-manager" ? assignment.branchId || undefined : undefined} />;
}

function Inventory({ lockedBranch, onNavigate, restaurantId }: { lockedBranch?: string; onNavigate: (path: string) => void; restaurantId: string }) {
  const queryClient = useQueryClient();
  const [branchChoice, setBranchChoice] = useState("");
  const [adjusting, setAdjusting] = useState<InventoryItem | undefined>();
  const [adding, setAdding] = useState(false);

  const restaurants = useQuery({ queryFn: listRestaurants, queryKey: ["restaurants"] });
  const branches = useQuery({ queryFn: () => listBranches(restaurantId), queryKey: ["branches", restaurantId] });
  const branchId = lockedBranch ?? (branchChoice || branches.data?.[0]?.ItemId || "");
  const stock = useQuery({ queryFn: () => listInventory(restaurantId), queryKey: ["inventory", restaurantId], refetchInterval: 30_000 });
  const movements = useQuery({ enabled: Boolean(branchId), queryFn: () => listMovements(restaurantId, branchId), queryKey: ["inventory", "movements", restaurantId, branchId], refetchInterval: 30_000 });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["inventory"] });

  const items = (stock.data ?? []).filter((item) => item.branchId === branchId).sort((a, b) => a.name.localeCompare(b.name));
  const attention = items.filter((item) => stockLevel(item) !== "ok");
  const restaurantName = restaurants.data?.find((entry) => entry.ItemId === restaurantId)?.name ?? "Your restaurant";
  const seed = useMutation({ mutationFn: () => seedInventoryDemo(restaurantId), onSuccess: refresh });

  return (
    <section className="viz-root">
      <PageHeader title="Inventory" subtitle={restaurantName} actions={<ActionButton variant="icon" title="Refresh now" onClick={() => void refresh()} icon={<RefreshCw size={18} />} />} />
      <AdminTabs active="/admin/inventory" onNavigate={onNavigate} />

      <div className="toolbar">
        {lockedBranch ? <span className="chip">{branches.data?.find((entry) => entry.ItemId === lockedBranch)?.name ?? "Your branch"}</span> : (
          <label className="form-field inline-field">
            <span>Branch</span>
            <select value={branchId} onChange={(event) => setBranchChoice(event.target.value)}>
              {branches.data?.map((entry) => <option key={entry.ItemId} value={entry.ItemId}>{entry.name}</option>)}
            </select>
          </label>
        )}
        <ActionButton onClick={() => setAdding(true)} icon={<Plus size={16} />} disabled={!branchId}>Add item</ActionButton>
      </div>

      {stock.isError ? <ErrorState message="Could not load inventory." onRetry={() => stock.refetch()} /> : null}
      {branches.isSuccess && branches.data.length === 0 ? <Alert tone="warn">This restaurant has no branches yet. Add demo orders on the Kitchen page to create some.</Alert> : null}
      {attention.length > 0 ? (
        <Alert tone="warn"><AlertTriangle size={14} /> {attention.length} item{attention.length === 1 ? "" : "s"} need attention: {attention.map((item) => `${item.name} (${LEVEL_LABEL[stockLevel(item)].toLowerCase()})`).join(", ")}.</Alert>
      ) : null}

      {stock.isLoading ? <div className="panel"><Skeleton className="skeleton-line-lg" /><Skeleton className="skeleton-line" /></div> : null}
      {stock.isSuccess && branchId && items.length === 0 ? (
        <EmptyState
          icon={<Boxes size={32} />}
          title="No stock items for this branch"
          description="Add ingredients you track, or load a demo set."
          action={(
            <div className="demo-tools">
              <ActionButton onClick={() => seed.mutate()} disabled={seed.isPending} icon={<Sparkles size={16} />}>{seed.isPending ? "Adding demo inventory..." : "Add demo inventory (dev)"}</ActionButton>
              {seed.isError ? <Alert tone="error">{(seed.error as Error).message}</Alert> : null}
            </div>
          )}
        />
      ) : null}

      {items.length > 0 ? (
        <div className="table-shell">
          <table>
            <thead><tr><th>Item</th><th>On hand</th><th>Reorder at</th><th>Level</th><th>Status</th><th /></tr></thead>
            <tbody>
              {items.map((item) => {
                const level = stockLevel(item);
                const fill = Math.min(100, item.reorderLevel > 0 ? (item.onHand / (item.reorderLevel * 3)) * 100 : item.onHand > 0 ? 100 : 0);
                return (
                  <tr key={item.ItemId}>
                    <td><strong>{item.name}</strong></td>
                    <td className="mono">{roundQty(item.onHand)} {item.unit}</td>
                    <td className="mono">{roundQty(item.reorderLevel)} {item.unit}</td>
                    <td style={{ width: 160 }}><span className="bar-track"><span className="bar-fill" style={{ background: level === "ok" ? "var(--viz-1)" : "hsl(var(--destructive))", width: `${Math.max(level === "out" ? 0 : 3, fill)}%` }} /></span></td>
                    <td><StatusPill tone={LEVEL_TONE[level]}>{LEVEL_LABEL[level]}</StatusPill></td>
                    <td><div className="row-actions"><ActionButton onClick={() => setAdjusting(item)}>Adjust</ActionButton></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {branchId ? <Recipes restaurantId={restaurantId} stockNames={items.map((item) => item.name)} /> : null}

      {movements.data && movements.data.length > 0 ? (
        <div className="panel">
          <div className="panel-title"><span>Recent stock movements</span></div>
          <ul className="live-list">
            {movements.data.slice(0, 12).map((entry) => (
              <li key={entry.ItemId}>
                <div>
                  <strong>{stock.data?.find((item) => item.ItemId === entry.inventoryItemId)?.name ?? "Item"} <span className="mono">{entry.quantity > 0 ? "+" : ""}{roundQty(entry.quantity)}</span></strong>
                  <span className="muted">{MOVEMENT_LABEL[entry.type] ?? entry.type}{entry.note ? ` · ${entry.note}` : ""}</span>
                </div>
                <span className="muted">{entry.movedAt ? new Date(entry.movedAt).toLocaleString() : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {adjusting ? <AdjustDialog item={adjusting} onClose={() => setAdjusting(undefined)} onDone={() => { setAdjusting(undefined); void refresh(); }} /> : null}
      {adding ? <AddDialog branchId={branchId} restaurantId={restaurantId} onClose={() => setAdding(false)} onDone={() => { setAdding(false); void refresh(); }} /> : null}
    </section>
  );
}

function AdjustDialog({ item, onClose, onDone }: { item: InventoryItem; onClose: () => void; onDone: () => void }) {
  const [type, setType] = useState<"restock" | "waste" | "adjustment">("restock");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const quantity = Number(amount);
  const save = useMutation({
    mutationFn: () => {
      // Restock adds, waste removes, and "set to" turns the target into a signed difference.
      const change = type === "restock" ? quantity : type === "waste" ? -quantity : quantity - item.onHand;
      return adjustStock(item, change, type, note.trim());
    },
    onSuccess: onDone
  });
  const valid = amount !== "" && Number.isFinite(quantity) && quantity >= 0 && (type === "adjustment" || quantity > 0);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (valid) save.mutate();
  }

  return (
    <Modal title={`Adjust ${item.name}`} onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <p className="muted" style={{ gridColumn: "1 / -1" }}>On hand now: {roundQty(item.onHand)} {item.unit}</p>
        <label className="form-field"><span>Action</span>
          <select value={type} onChange={(event) => setType(event.target.value as typeof type)}>
            <option value="restock">Restock (add)</option>
            <option value="waste">Waste (remove)</option>
            <option value="adjustment">Set to count</option>
          </select>
        </label>
        <label className="form-field"><span>{type === "adjustment" ? `New count (${item.unit})` : `Quantity (${item.unit})`}</span>
          <input autoFocus inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </label>
        <label className="form-field" style={{ gridColumn: "1 / -1" }}><span>Note (optional)</span><input value={note} onChange={(event) => setNote(event.target.value)} /></label>
        {save.isError ? <div style={{ gridColumn: "1 / -1" }}><Alert tone="error">{(save.error as Error).message}</Alert></div> : null}
        <div className="form-actions">
          <button type="button" className="icon-button" onClick={onClose}>Cancel</button>
          <ActionButton type="submit" disabled={!valid || save.isPending}>{save.isPending ? "Saving..." : "Save"}</ActionButton>
        </div>
      </form>
    </Modal>
  );
}

function AddDialog({ branchId, onClose, onDone, restaurantId }: { branchId: string; onClose: () => void; onDone: () => void; restaurantId: string }) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("kg");
  const [onHand, setOnHand] = useState("0");
  const [reorderLevel, setReorderLevel] = useState("0");
  const save = useMutation({
    mutationFn: () => createInventoryItem({ branchId, isActive: true, name: name.trim(), onHand: Number(onHand), reorderLevel: Number(reorderLevel), restaurantId, unit }),
    onSuccess: onDone
  });
  const valid = name.trim() !== "" && Number.isFinite(Number(onHand)) && Number(onHand) >= 0 && Number.isFinite(Number(reorderLevel)) && Number(reorderLevel) >= 0;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (valid) save.mutate();
  }

  return (
    <Modal title="Add stock item" onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <label className="form-field" style={{ gridColumn: "1 / -1" }}><span>Name</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Basmati rice" /></label>
        <label className="form-field"><span>Unit</span>
          <select value={unit} onChange={(event) => setUnit(event.target.value)}><option value="kg">kg</option><option value="l">litres</option><option value="pcs">pieces</option></select>
        </label>
        <label className="form-field"><span>On hand</span><input inputMode="decimal" value={onHand} onChange={(event) => setOnHand(event.target.value)} /></label>
        <label className="form-field"><span>Reorder at</span><input inputMode="decimal" value={reorderLevel} onChange={(event) => setReorderLevel(event.target.value)} /></label>
        {save.isError ? <div style={{ gridColumn: "1 / -1" }}><Alert tone="error">{(save.error as Error).message}</Alert></div> : null}
        <div className="form-actions">
          <button type="button" className="icon-button" onClick={onClose}>Cancel</button>
          <ActionButton type="submit" disabled={!valid || save.isPending}>{save.isPending ? "Saving..." : "Add item"}</ActionButton>
        </div>
      </form>
    </Modal>
  );
}

// Recipes decide what an order consumes: without a row here a menu item uses no stock.
function Recipes({ restaurantId, stockNames }: { restaurantId: string; stockNames: string[] }) {
  const queryClient = useQueryClient();
  const menu = useQuery({ queryFn: () => listMenuItems(restaurantId), queryKey: ["menu", restaurantId] });
  const recipes = useQuery({ queryFn: () => listRecipes(restaurantId), queryKey: ["inventory", "recipes", restaurantId] });
  const [menuItemId, setMenuItemId] = useState("");
  const [ingredient, setIngredient] = useState("");
  const [quantity, setQuantity] = useState("");
  const chosen = menuItemId || menu.data?.[0]?.ItemId || "";
  const rows = (recipes.data ?? []).filter((row) => row.menuItemId === chosen);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["inventory", "recipes", restaurantId] });
  const add = useMutation({
    mutationFn: () => saveRecipeLine({ ingredient: ingredient.trim(), menuItemId: chosen, quantity: Number(quantity), restaurantId }),
    onSuccess: () => { setIngredient(""); setQuantity(""); void refresh(); }
  });
  const remove = useMutation({ mutationFn: (id: string) => deleteRecipeLine(id), onSuccess: refresh });
  const valid = chosen !== "" && ingredient.trim() !== "" && Number(quantity) > 0;
  const unknown = ingredient.trim() !== "" && !stockNames.some((name) => ingredientKey(name) === ingredientKey(ingredient));

  if (!menu.data?.length) return null;
  return (
    <div className="panel">
      <div className="panel-title"><span>Recipes (stock used per serving)</span></div>
      <label className="form-field inline-field">
        <span>Menu item</span>
        <select value={chosen} onChange={(event) => setMenuItemId(event.target.value)}>
          {menu.data.map((entry) => <option key={entry.ItemId} value={entry.ItemId}>{entry.name}</option>)}
        </select>
      </label>
      <ul className="live-list">
        {rows.length === 0 ? <li><span className="muted">No ingredients yet, so this item uses no stock.</span></li> : rows.map((row) => (
          <li key={row.ItemId}>
            <strong>{row.ingredient}</strong>
            <span className="muted">{roundQty(row.quantity)} per serving</span>
            <ActionButton variant="icon" aria-label={`Remove ${row.ingredient}`} onClick={() => remove.mutate(row.ItemId)} icon={<Trash2 size={16} />} />
          </li>
        ))}
      </ul>
      <div className="toolbar">
        <label className="form-field inline-field"><span>Ingredient</span><input list="stock-names" value={ingredient} onChange={(event) => setIngredient(event.target.value)} placeholder="Rice" /></label>
        <datalist id="stock-names">{stockNames.map((name) => <option key={name} value={name} />)}</datalist>
        <label className="form-field inline-field"><span>Qty</span><input style={{ width: 90 }} inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
        <ActionButton onClick={() => add.mutate()} disabled={!valid || add.isPending} icon={<Plus size={16} />}>Add</ActionButton>
      </div>
      {unknown ? <Alert tone="warn">"{ingredient.trim()}" is not in this branch's stock list, so orders will not deduct it until an item with that name exists.</Alert> : null}
      {add.isError ? <Alert tone="error">{(add.error as Error).message}</Alert> : null}
    </div>
  );
}
