import { blocksClient } from "../../lib/blocks/client";
import { computeRequirements, ingredientKey } from "../admin/stock";

// Schemas are defined in blocks/data/schemas. Relations are plain string ids
// (restaurantId, orderId, ...) -- there is no reference type, so joins happen here.
export type Restaurant = {
  ItemId: string;
  address?: string;
  area?: string;
  city?: string;
  cuisines?: string[];
  description?: string;
  imageUrl?: string;
  isActive?: boolean;
  name: string;
  openingHours?: string;
  phone?: string;
};

export type Branch = {
  ItemId: string;
  address?: string;
  area?: string;
  city?: string;
  isActive?: boolean;
  name: string;
  openingHours?: string;
  phone?: string;
  restaurantId: string;
  timezone?: string;
};

export const CHANNELS = ["kiosk", "webapp", "website"] as const;
export type Channel = (typeof CHANNELS)[number];

export type MenuItem = {
  ItemId: string;
  category?: string;
  description?: string;
  imageUrl?: string;
  isAvailable?: boolean;
  name: string;
  price: number;
  restaurantId: string;
};

export const ORDER_STATUSES = ["placed", "accepted", "preparing", "ready", "out_for_delivery", "delivered", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const PAYMENT_METHODS = ["cod", "bkash", "nagad"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type Order = {
  ItemId: string;
  acceptedAt?: string;
  branchId?: string;
  channel?: Channel;
  customerId: string;
  deliveredAt?: string;
  placedAt?: string;
  readyAt?: string;
  deliveryAddress?: string;
  deliveryFee: number;
  notes?: string;
  paymentMethod?: PaymentMethod;
  phone?: string;
  restaurantId: string;
  status: OrderStatus;
  subtotal: number;
  total: number;
};

export type OrderItem = {
  ItemId: string;
  menuItemId: string;
  name: string;
  orderId: string;
  quantity: number;
  unitPrice: number;
};

export type InventoryItem = {
  ItemId: string;
  branchId: string;
  costPerUnit?: number;
  isActive?: boolean;
  name: string;
  onHand: number;
  reorderLevel: number;
  restaurantId: string;
  unit: string;
};

export type Recipe = { ItemId: string; ingredient: string; menuItemId: string; quantity: number; restaurantId: string };

export const MOVEMENT_TYPES = ["restock", "usage", "usage_reversal", "waste", "adjustment"] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];
export type StockMovement = {
  ItemId: string;
  branchId: string;
  inventoryItemId: string;
  movedAt?: string;
  note?: string;
  orderId?: string;
  quantity: number;
  restaurantId: string;
  type: MovementType;
};

export type PrinterStatus = "ok" | "paper_low" | "error";
export type Device = {
  ItemId: string;
  appVersion?: string;
  branchId: string;
  isActive?: boolean;
  lastError?: string;
  lastSeenAt?: string;
  latencyMs?: number;
  name: string;
  printerStatus?: PrinterStatus;
  restaurantId: string;
  type?: string;
  uptimeMinutes?: number;
};
export type Heartbeat = Pick<Device, "appVersion" | "lastError" | "latencyMs" | "printerStatus" | "uptimeMinutes">;

export const STAFF_ROLES = ["restaurant-admin", "branch-manager", "kitchen-staff"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export type StaffAssignment = {
  ItemId: string;
  branchId?: string;
  email?: string;
  restaurantId: string;
  role: StaffRole;
  userId: string;
};

export type NewOrder = Omit<Order, "ItemId">;
export type NewOrderItem = Omit<OrderItem, "ItemId" | "orderId">;

export const DELIVERY_FEE_BDT = 60;

const restaurants = blocksClient.data.collection<Restaurant>("Restaurant", {
  fields: ["name", "description", "address", "area", "city", "phone", "cuisines", "imageUrl", "openingHours", "isActive"]
});
const branches = blocksClient.data.collection<Branch>("Branch", {
  fields: ["restaurantId", "name", "address", "area", "city", "phone", "timezone", "openingHours", "isActive"]
});
const inventory = blocksClient.data.collection<InventoryItem>("InventoryItem", {
  fields: ["restaurantId", "branchId", "name", "unit", "onHand", "reorderLevel", "costPerUnit", "isActive"]
});
const recipes = blocksClient.data.collection<Recipe>("MenuItemIngredient", {
  fields: ["restaurantId", "menuItemId", "ingredient", "quantity"]
});
const movements = blocksClient.data.collection<StockMovement>("StockMovement", {
  fields: ["restaurantId", "branchId", "inventoryItemId", "type", "quantity", "orderId", "note", "movedAt"]
});
const devices = blocksClient.data.collection<Device>("Device", {
  fields: ["restaurantId", "branchId", "name", "type", "appVersion", "printerStatus", "latencyMs", "uptimeMinutes", "lastError", "lastSeenAt", "isActive"]
});
const staff = blocksClient.data.collection<StaffAssignment>("StaffAssignment", {
  fields: ["userId", "email", "role", "restaurantId", "branchId"]
});
const menuItems = blocksClient.data.collection<MenuItem>("MenuItem", {
  fields: ["restaurantId", "name", "description", "price", "category", "imageUrl", "isAvailable"]
});
const orders = blocksClient.data.collection<Order>("Order", {
  fields: ["customerId", "restaurantId", "status", "subtotal", "deliveryFee", "total", "deliveryAddress", "phone", "paymentMethod", "notes", "branchId", "channel", "placedAt", "acceptedAt", "readyAt", "deliveredAt"]
});
const orderItems = blocksClient.data.collection<OrderItem>("OrderItem", {
  fields: ["orderId", "menuItemId", "name", "unitPrice", "quantity"]
});

// The gateway nests list results under the generated operation name
// (data.getRestaurants.items), so find the first `items` array rather than
// hard-coding each operation name.
function extractItems<T>(response: unknown): T[] {
  const data = (response as { data?: unknown } | undefined)?.data ?? response;
  if (data && typeof data === "object") {
    const direct = (data as { items?: unknown }).items;
    if (Array.isArray(direct)) return direct as T[];
    for (const value of Object.values(data)) {
      const items = (value as { items?: unknown } | null)?.items;
      if (Array.isArray(items)) return items as T[];
    }
  }
  return [];
}

// Insert responses are shaped by the generated mutation, so look for the new
// record's id wherever it landed instead of assuming a path.
function extractId(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  for (const [key, entry] of Object.entries(value)) {
    if ((key === "ItemId" || key === "itemId") && typeof entry === "string") return entry;
  }
  for (const entry of Object.values(value)) {
    const found = extractId(entry);
    if (found) return found;
  }
  return undefined;
}

export async function listRestaurants(): Promise<Restaurant[]> {
  const items = extractItems<Restaurant>(await restaurants.list({ pageNo: 1, pageSize: 100 }));
  return items.filter((restaurant) => restaurant.isActive !== false);
}

export async function listBranches(restaurantId: string): Promise<Branch[]> {
  const items = extractItems<Branch>(await branches.list({ filter: { restaurantId }, pageNo: 1, pageSize: 50 }));
  return items.filter((branch) => branch.isActive !== false);
}

// Pages through a collection so portal totals are not silently capped at one page.
async function listAll<T>(
  list: (options: { pageNo: number; pageSize: number; filter?: Record<string, unknown> }) => Promise<unknown>,
  filter?: Record<string, unknown>
): Promise<T[]> {
  const pageSize = 500;
  const all: T[] = [];
  for (let pageNo = 1; pageNo <= 20; pageNo += 1) {
    const page = extractItems<T>(await list({ filter, pageNo, pageSize }));
    all.push(...page);
    if (page.length < pageSize) break;
  }
  return all;
}

export function listRestaurantOrders(restaurantId: string): Promise<Order[]> {
  return listAll<Order>((options) => orders.list(options), { restaurantId });
}

export function listAllOrderItems(): Promise<OrderItem[]> {
  return listAll<OrderItem>((options) => orderItems.list(options));
}

export async function listMyAssignments(userId: string): Promise<StaffAssignment[]> {
  return extractItems<StaffAssignment>(await staff.list({ filter: { userId }, pageNo: 1, pageSize: 20 }));
}

export async function createAssignment(assignment: Omit<StaffAssignment, "ItemId">): Promise<void> {
  await staff.create(assignment);
}

export function listInventory(restaurantId: string): Promise<InventoryItem[]> {
  return listAll<InventoryItem>((options) => inventory.list(options), { restaurantId }).then((items) => items.filter((item) => item.isActive !== false));
}

export function listDevices(restaurantId: string): Promise<Device[]> {
  return listAll<Device>((options) => devices.list(options), { restaurantId }).then((items) => items.filter((device) => device.isActive !== false));
}

export async function createDevice(device: Omit<Device, "ItemId">): Promise<void> {
  await devices.create(device);
}

// What a kiosk sends every ~20-30s. lastSeenAt is stamped here, from the
// sender's clock -- a real ingest endpoint should stamp it server-side instead.
export async function sendHeartbeat(deviceId: string, beat: Heartbeat): Promise<void> {
  await devices.update(deviceId, { ...beat, lastSeenAt: new Date().toISOString() });
}

export function listRecipes(restaurantId: string): Promise<Recipe[]> {
  return listAll<Recipe>((options) => recipes.list(options), { restaurantId });
}

export async function listMovements(restaurantId: string, branchId: string): Promise<StockMovement[]> {
  const items = await listAll<StockMovement>((options) => movements.list(options), { branchId, restaurantId });
  return items.sort((a, b) => Date.parse(b.movedAt ?? "") - Date.parse(a.movedAt ?? "")).slice(0, 25);
}

export async function createInventoryItem(item: Omit<InventoryItem, "ItemId">): Promise<void> {
  await inventory.create(item);
}

// Stock changes always go through here so every change leaves a ledger row.
// NOTE: read-modify-write from the browser is not atomic; two people adjusting
// the same item in the same second can lose an update. A server-side workflow
// owning this write is the production fix.
export async function adjustStock(item: InventoryItem, change: number, type: MovementType, note?: string, orderId?: string): Promise<void> {
  const onHand = Math.max(0, Math.round((item.onHand + change) * 1000) / 1000);
  await inventory.update(item.ItemId, { onHand });
  await movements.create({
    branchId: item.branchId,
    inventoryItemId: item.ItemId,
    movedAt: new Date().toISOString(),
    note: note ?? "",
    orderId: orderId ?? "",
    quantity: onHand - item.onHand,
    restaurantId: item.restaurantId,
    type
  });
}

export async function saveRecipeLine(line: Omit<Recipe, "ItemId">): Promise<void> {
  await recipes.create(line);
}

export async function deleteRecipeLine(id: string): Promise<void> {
  await recipes.delete(id);
}

// direction -1 consumes stock for the order, +1 restores it. Skipped when the
// order has no branch (we cannot know whose stock to touch) and idempotent per
// order, so a double-click or a retry cannot deduct twice.
async function applyOrderStock(order: Order, direction: 1 | -1): Promise<void> {
  if (!order.branchId) return;
  const prior = extractItems<StockMovement>(await movements.list({ filter: { orderId: order.ItemId }, pageNo: 1, pageSize: 200 }));
  const consumed = prior.some((entry) => entry.type === "usage");
  const restored = prior.some((entry) => entry.type === "usage_reversal");
  if (direction === -1 && consumed) return;
  if (direction === 1 && (!consumed || restored)) return;

  const [lines, recipeRows, stock] = await Promise.all([listOrderItems(order.ItemId), listRecipes(order.restaurantId), listInventory(order.restaurantId)]);
  const needed = computeRequirements(lines, recipeRows);
  for (const item of stock) {
    if (item.branchId !== order.branchId) continue;
    const quantity = needed.get(ingredientKey(item.name));
    if (!quantity) continue;
    await adjustStock(item, direction * quantity, direction === -1 ? "usage" : "usage_reversal", `Order #${order.ItemId.slice(-4).toUpperCase()}`, order.ItemId);
  }
}

export async function listMenuItems(restaurantId: string): Promise<MenuItem[]> {
  return extractItems<MenuItem>(await menuItems.list({ filter: { restaurantId }, pageNo: 1, pageSize: 200 }));
}

export async function listMyOrders(customerId: string): Promise<Order[]> {
  const items = extractItems<Order>(await orders.list({ filter: { customerId }, pageNo: 1, pageSize: 100 }));
  // No sort key is selected, so assume insertion order and show newest first.
  return [...items].reverse();
}

export async function listOrderItems(orderId: string): Promise<OrderItem[]> {
  return extractItems<OrderItem>(await orderItems.list({ filter: { orderId }, pageNo: 1, pageSize: 100 }));
}

// Advances an order and stamps the matching timestamp, which is what the
// kitchen board uses to measure prep time. Accepting an order consumes stock;
// cancelling one that was already accepted gives it back.
export async function updateOrderStatus(order: Order, status: OrderStatus): Promise<void> {
  const now = new Date().toISOString();
  const stamp: Partial<Order> = status === "accepted" ? { acceptedAt: now } : status === "ready" ? { readyAt: now } : status === "delivered" ? { deliveredAt: now } : {};
  await orders.update(order.ItemId, { status, ...stamp });
  // The status change above is already saved. If stock then fails, say exactly
  // that instead of a bare error that makes it look like nothing happened.
  try {
    if (status === "accepted") await applyOrderStock(order, -1);
    if (status === "cancelled" && order.status === "accepted") await applyOrderStock(order, 1);
  } catch (error) {
    throw new Error(`The order was updated, but stock was not adjusted: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}

export async function placeOrder(order: NewOrder, lines: NewOrderItem[]): Promise<string> {
  const created = await orders.create(order);
  const orderId = extractId(created);
  if (!orderId) throw new Error("Order was created but its id could not be read back, so its items were not saved.");
  for (const line of lines) {
    await orderItems.create({ ...line, orderId });
  }
  return orderId;
}

type SeedRestaurant = { branches: ReadonlyArray<readonly [string, string, string, string]>; items: ReadonlyArray<readonly [string, string, number, string]>; restaurant: Omit<Restaurant, "ItemId"> };

const SEED: SeedRestaurant[] = [
  {
    branches: [
      ["Dhanmondi", "Road 27, Dhanmondi", "Dhanmondi", "Dhaka"],
      ["Gulshan", "Gulshan 1 Circle", "Gulshan", "Dhaka"],
      ["Chattogram - GEC", "GEC Circle", "GEC Circle", "Chattogram"]
    ],
    restaurant: { name: "Dhaka Biryani House", description: "Slow-cooked kacchi and tehari.", area: "Dhanmondi", city: "Dhaka", address: "Road 27, Dhanmondi, Dhaka", phone: "01700000001", cuisines: ["Bangladeshi", "Biryani"], openingHours: "11:00 - 23:00", isActive: true },
    items: [
      ["Kacchi Biryani", "Biryani", 380, "Mutton kacchi with potato and egg"],
      ["Chicken Tehari", "Biryani", 220, "Mustard-oil tehari with chicken"],
      ["Beef Tehari", "Biryani", 260, "Beef tehari with green chilli"],
      ["Borhani", "Drinks", 40, "Spiced yogurt drink"],
      ["Firni", "Dessert", 70, "Rice-flour milk pudding"]
    ]
  },
  {
    branches: [
      ["Gulshan 2", "Gulshan 2", "Gulshan", "Dhaka"],
      ["Banani", "Road 11, Banani", "Banani", "Dhaka"]
    ],
    restaurant: { name: "Bhuna Ghor", description: "Home-style Bangladeshi curries.", area: "Gulshan", city: "Dhaka", address: "Gulshan 2, Dhaka", phone: "01700000002", cuisines: ["Bangladeshi", "Curry"], openingHours: "12:00 - 22:00", isActive: true },
    items: [
      ["Beef Bhuna with Paratha", "Mains", 260, "Two parathas and beef bhuna"],
      ["Hilsa Fry", "Mains", 450, "Fried ilish, two pieces"],
      ["Chicken Roast", "Mains", 240, "Polao-style chicken roast"],
      ["Dal Bhuna", "Sides", 80, "Thick lentils"],
      ["Mishti Doi", "Dessert", 90, "Sweet yogurt"]
    ]
  },
  {
    branches: [
      ["Agrabad", "Agrabad C/A", "Agrabad", "Chattogram"],
      ["Nasirabad", "Nasirabad H/S", "Nasirabad", "Chattogram"]
    ],
    restaurant: { name: "Burger Corner", description: "Burgers, fries and shakes.", area: "Agrabad", city: "Chattogram", address: "Agrabad C/A, Chattogram", phone: "01700000003", cuisines: ["Fast food", "Burgers"], openingHours: "10:00 - 00:00", isActive: true },
    items: [
      ["Classic Beef Burger", "Burgers", 320, "Beef patty, cheese, lettuce"],
      ["Crispy Chicken Burger", "Burgers", 280, "Fried chicken fillet"],
      ["French Fries", "Sides", 120, "Large"],
      ["Chocolate Shake", "Drinks", 180, "Thick shake"]
    ]
  },
  {
    branches: [
      ["GEC Circle", "GEC Circle", "GEC Circle", "Chattogram"],
      ["Khulshi", "Khulshi", "Khulshi", "Chattogram"]
    ],
    restaurant: { name: "Chittagong Mezban", description: "Spicy mezbani beef and Chattogram classics.", area: "GEC Circle", city: "Chattogram", address: "GEC Circle, Chattogram", phone: "01700000004", cuisines: ["Bangladeshi", "Mezban"], openingHours: "12:00 - 22:30", isActive: true },
    items: [
      ["Mezbani Beef with Rice", "Mains", 290, "Peppery beef curry with plain rice"],
      ["Shutki Bhuna", "Mains", 210, "Dried fish bhuna"],
      ["Plain Rice", "Sides", 40, "Steamed rice"],
      ["Lassi", "Drinks", 80, "Sweet lassi"]
    ]
  },
  {
    branches: [
      ["Zindabazar", "Zindabazar", "Zindabazar", "Sylhet"],
      ["Ambarkhana", "Ambarkhana", "Ambarkhana", "Sylhet"]
    ],
    restaurant: { name: "Sylhet Seven Rings", description: "Seven-layer tea, shatkora dishes and pitha.", area: "Zindabazar", city: "Sylhet", address: "Zindabazar, Sylhet", phone: "01700000005", cuisines: ["Sylheti", "Tea & snacks"], openingHours: "09:00 - 21:00", isActive: true },
    items: [
      ["Seven-layer Tea", "Drinks", 60, "Famous layered tea"],
      ["Shatkora Beef", "Mains", 320, "Beef cooked with shatkora"],
      ["Chitoi Pitha (4 pcs)", "Snacks", 80, "Steamed rice-flour pitha"],
      ["Akhni Polao", "Mains", 230, "Fragrant Sylheti polao"]
    ]
  },
  {
    branches: [
      ["Uttara", "Sector 4, Uttara", "Uttara", "Dhaka"],
      ["Mirpur", "Mirpur 10", "Mirpur", "Dhaka"]
    ],
    restaurant: { name: "Pizza & Pasta Co.", description: "Wood-fired pizza and creamy pasta.", area: "Uttara", city: "Dhaka", address: "Sector 4, Uttara, Dhaka", phone: "01700000006", cuisines: ["Italian", "Pizza"], openingHours: "11:00 - 23:30", isActive: true },
    items: [
      ["Margherita Pizza", "Pizza", 450, "Tomato, mozzarella, basil"],
      ["BBQ Chicken Pizza", "Pizza", 620, "Smoky chicken, onion, cheese"],
      ["Creamy Chicken Pasta", "Pasta", 380, "Penne in white sauce"],
      ["Garlic Bread", "Sides", 150, "Four slices"]
    ]
  }
];

type SeededRestaurant = { branchIds: string[]; id: string; items: Array<{ id: string; name: string; price: number }> };

async function seedCatalog(): Promise<SeededRestaurant[]> {
  const seeded: SeededRestaurant[] = [];
  for (const sample of SEED) {
    const id = extractId(await restaurants.create({ ...sample.restaurant, cuisines: [...(sample.restaurant.cuisines ?? [])] }));
    if (!id) throw new Error("Could not read back the new restaurant id.");
    const branchIds: string[] = [];
    for (const [name, address, area, city] of sample.branches) {
      const branchId = extractId(await branches.create({ address, area, city, isActive: true, name, openingHours: sample.restaurant.openingHours, phone: sample.restaurant.phone, restaurantId: id, timezone: "Asia/Dhaka" }));
      if (!branchId) throw new Error("Could not read back the new branch id.");
      branchIds.push(branchId);
    }
    const items: SeededRestaurant["items"] = [];
    for (const [name, category, price, description] of sample.items) {
      const itemId = extractId(await menuItems.create({ category, description, isAvailable: true, name, price, restaurantId: id }));
      if (!itemId) throw new Error("Could not read back the new menu item id.");
      items.push({ id: itemId, name, price });
    }
    seeded.push({ branchIds, id, items });
  }
  return seeded;
}

// Orders across every status so the history page has something to show.
async function seedOrders(customerId: string, catalog: SeededRestaurant[]): Promise<void> {
  const plan: Array<{ channel: Channel; lines: Array<[number, number]>; minutesAgo: number; payment: PaymentMethod; restaurant: number; status: OrderStatus }> = [
    { channel: "kiosk", lines: [[0, 1], [3, 2]], minutesAgo: 240, payment: "cod", restaurant: 0, status: "delivered" },
    { channel: "webapp", lines: [[1, 1], [2, 1]], minutesAgo: 35, payment: "bkash", restaurant: 1, status: "out_for_delivery" },
    { channel: "website", lines: [[0, 2], [2, 1], [3, 2]], minutesAgo: 12, payment: "nagad", restaurant: 2, status: "preparing" },
    { channel: "webapp", lines: [[0, 1], [1, 1]], minutesAgo: 3, payment: "cod", restaurant: 5, status: "placed" },
    { channel: "kiosk", lines: [[1, 2]], minutesAgo: 90, payment: "cod", restaurant: 4, status: "cancelled" }
  ];
  for (const entry of plan) {
    const restaurant = catalog[entry.restaurant];
    if (!restaurant) continue;
    const lines = entry.lines.flatMap(([itemIndex, quantity]) => {
      const item = restaurant.items[itemIndex];
      return item ? [{ menuItemId: item.id, name: item.name, quantity, unitPrice: item.price }] : [];
    });
    const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
    const placedAt = new Date(Date.now() - entry.minutesAgo * 60_000).toISOString();
    await placeOrder(
      { branchId: restaurant.branchIds[0], channel: entry.channel, placedAt, customerId, deliveryAddress: "House 12, Road 5, Dhanmondi, Dhaka", deliveryFee: DELIVERY_FEE_BDT, notes: "", paymentMethod: entry.payment, phone: "01712345678", restaurantId: restaurant.id, status: entry.status, subtotal, total: subtotal + DELIVERY_FEE_BDT },
      lines
    );
  }
}

export async function seedSampleData(customerId?: string): Promise<void> {
  const catalog = await seedCatalog();
  if (customerId) await seedOrders(customerId, catalog);
}

// For when restaurants already exist but this account has no orders yet.
export async function seedSampleOrders(customerId: string): Promise<void> {
  const existing = await listRestaurants();
  const catalog: SeededRestaurant[] = [];
  for (const restaurant of existing.slice(0, 6)) {
    const items = await listMenuItems(restaurant.ItemId);
    const restaurantBranches = await listBranches(restaurant.ItemId);
    catalog.push({ branchIds: restaurantBranches.map((branch) => branch.ItemId), id: restaurant.ItemId, items: items.map((item) => ({ id: item.ItemId, name: item.name, price: item.price })) });
  }
  await seedOrders(customerId, catalog);
}

export function formatBdt(amount: number): string {
  return `৳${amount.toLocaleString("en-US")}`;
}

// Dev tool: gives a restaurant two branches if it has none, then adds a spread
// of orders in every status/channel/age so the kitchen board and dashboard have
// something to show. Only ever adds records.
export async function seedKitchenDemo(restaurantId: string, customerId: string): Promise<void> {
  let branchList = await listBranches(restaurantId);
  if (branchList.length === 0) {
    const restaurant = (await listRestaurants()).find((entry) => entry.ItemId === restaurantId);
    for (const name of [restaurant?.area || "Main branch", "Second branch"]) {
      await branches.create({ address: restaurant?.address, area: restaurant?.area, city: restaurant?.city, isActive: true, name, openingHours: restaurant?.openingHours, phone: restaurant?.phone, restaurantId, timezone: "Asia/Dhaka" });
    }
    branchList = await listBranches(restaurantId);
  }
  const menu = (await listMenuItems(restaurantId)).filter((item) => item.isAvailable !== false);
  if (branchList.length === 0 || menu.length === 0) throw new Error("This restaurant needs at least one menu item before demo orders can be added.");

  const plan: Array<{ channel: Channel; minutesAgo: number; status: OrderStatus }> = [
    { channel: "kiosk", minutesAgo: 2, status: "placed" },
    { channel: "webapp", minutesAgo: 7, status: "placed" },
    { channel: "website", minutesAgo: 9, status: "placed" },
    { channel: "kiosk", minutesAgo: 14, status: "accepted" },
    { channel: "webapp", minutesAgo: 10, status: "preparing" },
    { channel: "kiosk", minutesAgo: 19, status: "preparing" },
    { channel: "website", minutesAgo: 31, status: "preparing" },
    { channel: "webapp", minutesAgo: 26, status: "ready" },
    { channel: "kiosk", minutesAgo: 42, status: "out_for_delivery" },
    { channel: "webapp", minutesAgo: 75, status: "delivered" },
    { channel: "kiosk", minutesAgo: 160, status: "delivered" },
    { channel: "website", minutesAgo: 95, status: "cancelled" }
  ];
  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

  for (const [index, entry] of plan.entries()) {
    const lines = [0, 1, 2].slice(0, 1 + (index % 3)).map((offset) => {
      const item = menu[(index + offset) % menu.length] as MenuItem;
      return { menuItemId: item.ItemId, name: item.name, quantity: 1 + ((index + offset) % 2), unitPrice: item.price };
    });
    const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
    const reached = (...states: OrderStatus[]) => states.includes(entry.status);
    const branch = branchList[index % branchList.length] as Branch;
    await placeOrder(
      {
        acceptedAt: reached("accepted", "preparing", "ready", "out_for_delivery", "delivered") ? at(entry.minutesAgo - 2) : undefined,
        branchId: branch.ItemId,
        channel: entry.channel,
        customerId,
        deliveredAt: reached("delivered") ? at(Math.max(0, entry.minutesAgo - 40)) : undefined,
        deliveryAddress: "House 12, Road 5, Dhanmondi, Dhaka",
        deliveryFee: DELIVERY_FEE_BDT,
        notes: "",
        paymentMethod: entry.channel === "kiosk" ? "cod" : "bkash",
        phone: "01712345678",
        placedAt: at(entry.minutesAgo),
        readyAt: reached("ready", "out_for_delivery", "delivered") ? at(Math.max(0, entry.minutesAgo - 20)) : undefined,
        restaurantId,
        status: entry.status,
        subtotal,
        total: subtotal + DELIVERY_FEE_BDT
      },
      lines
    );
  }
}

// Dev tool: stocks every branch of a restaurant and wires each menu item to
// two ingredients, with a couple of items deliberately low or out so the
// alerts have something to show. Only adds records.
export async function seedInventoryDemo(restaurantId: string): Promise<void> {
  const branchList = await listBranches(restaurantId);
  const menu = await listMenuItems(restaurantId);
  if (branchList.length === 0) throw new Error("Add branches first (use Add demo orders on the Kitchen page).");

  const catalogue: Array<[string, string, number, number]> = [
    ["Rice", "kg", 40, 10], ["Chicken", "kg", 25, 8], ["Beef", "kg", 18, 6], ["Cooking oil", "l", 20, 5],
    ["Spice mix", "kg", 6, 2], ["Potato", "kg", 30, 8], ["Eggs", "pcs", 120, 40], ["Flour", "kg", 22, 6],
    ["Milk", "l", 15, 5], ["Takeaway boxes", "pcs", 300, 100]
  ];
  for (const [branchIndex, branch] of branchList.entries()) {
    for (const [index, [name, unit, onHand, reorderLevel]] of catalogue.entries()) {
      // Shape the first branch: one item low, one out; the second branch is fully stocked.
      const level = branchIndex === 0 && index === 1 ? reorderLevel - 1 : branchIndex === 0 && index === 4 ? 0 : onHand;
      await inventory.create({ branchId: branch.ItemId, costPerUnit: 100 + index * 20, isActive: true, name, onHand: level, reorderLevel, restaurantId, unit });
    }
  }
  const quantities = [0.25, 0.15, 0.3, 0.1];
  for (const [index, item] of menu.entries()) {
    for (const offset of [0, 1]) {
      const [ingredient] = catalogue[(index * 2 + offset) % catalogue.length] as [string, string, number, number];
      await recipes.create({ ingredient, menuItemId: item.ItemId, quantity: quantities[(index + offset) % quantities.length] as number, restaurantId });
    }
  }
}
