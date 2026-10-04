import { blocksClient } from "../../lib/blocks/client";

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
// kitchen board uses to measure prep time.
export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
  const now = new Date().toISOString();
  const stamp: Partial<Order> = status === "accepted" ? { acceptedAt: now } : status === "ready" ? { readyAt: now } : status === "delivered" ? { deliveredAt: now } : {};
  await orders.update(orderId, { status, ...stamp });
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
