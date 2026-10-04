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

export const ORDER_STATUSES = ["placed", "accepted", "preparing", "out_for_delivery", "delivered", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const PAYMENT_METHODS = ["cod", "bkash", "nagad"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type Order = {
  ItemId: string;
  customerId: string;
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

export type NewOrder = Omit<Order, "ItemId">;
export type NewOrderItem = Omit<OrderItem, "ItemId" | "orderId">;

export const DELIVERY_FEE_BDT = 60;

const restaurants = blocksClient.data.collection<Restaurant>("Restaurant", {
  fields: ["name", "description", "address", "area", "city", "phone", "cuisines", "imageUrl", "openingHours", "isActive"]
});
const menuItems = blocksClient.data.collection<MenuItem>("MenuItem", {
  fields: ["restaurantId", "name", "description", "price", "category", "imageUrl", "isAvailable"]
});
const orders = blocksClient.data.collection<Order>("Order", {
  fields: ["customerId", "restaurantId", "status", "subtotal", "deliveryFee", "total", "deliveryAddress", "phone", "paymentMethod", "notes"]
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

export async function placeOrder(order: NewOrder, lines: NewOrderItem[]): Promise<string> {
  const created = await orders.create(order);
  const orderId = extractId(created);
  if (!orderId) throw new Error("Order was created but its id could not be read back, so its items were not saved.");
  for (const line of lines) {
    await orderItems.create({ ...line, orderId });
  }
  return orderId;
}

type SeedRestaurant = { items: ReadonlyArray<readonly [string, string, number, string]>; restaurant: Omit<Restaurant, "ItemId"> };

const SEED: SeedRestaurant[] = [
  {
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
    restaurant: { name: "Burger Corner", description: "Burgers, fries and shakes.", area: "Agrabad", city: "Chattogram", address: "Agrabad C/A, Chattogram", phone: "01700000003", cuisines: ["Fast food", "Burgers"], openingHours: "10:00 - 00:00", isActive: true },
    items: [
      ["Classic Beef Burger", "Burgers", 320, "Beef patty, cheese, lettuce"],
      ["Crispy Chicken Burger", "Burgers", 280, "Fried chicken fillet"],
      ["French Fries", "Sides", 120, "Large"],
      ["Chocolate Shake", "Drinks", 180, "Thick shake"]
    ]
  },
  {
    restaurant: { name: "Chittagong Mezban", description: "Spicy mezbani beef and Chattogram classics.", area: "GEC Circle", city: "Chattogram", address: "GEC Circle, Chattogram", phone: "01700000004", cuisines: ["Bangladeshi", "Mezban"], openingHours: "12:00 - 22:30", isActive: true },
    items: [
      ["Mezbani Beef with Rice", "Mains", 290, "Peppery beef curry with plain rice"],
      ["Shutki Bhuna", "Mains", 210, "Dried fish bhuna"],
      ["Plain Rice", "Sides", 40, "Steamed rice"],
      ["Lassi", "Drinks", 80, "Sweet lassi"]
    ]
  },
  {
    restaurant: { name: "Sylhet Seven Rings", description: "Seven-layer tea, shatkora dishes and pitha.", area: "Zindabazar", city: "Sylhet", address: "Zindabazar, Sylhet", phone: "01700000005", cuisines: ["Sylheti", "Tea & snacks"], openingHours: "09:00 - 21:00", isActive: true },
    items: [
      ["Seven-layer Tea", "Drinks", 60, "Famous layered tea"],
      ["Shatkora Beef", "Mains", 320, "Beef cooked with shatkora"],
      ["Chitoi Pitha (4 pcs)", "Snacks", 80, "Steamed rice-flour pitha"],
      ["Akhni Polao", "Mains", 230, "Fragrant Sylheti polao"]
    ]
  },
  {
    restaurant: { name: "Pizza & Pasta Co.", description: "Wood-fired pizza and creamy pasta.", area: "Uttara", city: "Dhaka", address: "Sector 4, Uttara, Dhaka", phone: "01700000006", cuisines: ["Italian", "Pizza"], openingHours: "11:00 - 23:30", isActive: true },
    items: [
      ["Margherita Pizza", "Pizza", 450, "Tomato, mozzarella, basil"],
      ["BBQ Chicken Pizza", "Pizza", 620, "Smoky chicken, onion, cheese"],
      ["Creamy Chicken Pasta", "Pasta", 380, "Penne in white sauce"],
      ["Garlic Bread", "Sides", 150, "Four slices"]
    ]
  }
];

type SeededRestaurant = { id: string; items: Array<{ id: string; name: string; price: number }> };

async function seedCatalog(): Promise<SeededRestaurant[]> {
  const seeded: SeededRestaurant[] = [];
  for (const sample of SEED) {
    const id = extractId(await restaurants.create({ ...sample.restaurant, cuisines: [...(sample.restaurant.cuisines ?? [])] }));
    if (!id) throw new Error("Could not read back the new restaurant id.");
    const items: SeededRestaurant["items"] = [];
    for (const [name, category, price, description] of sample.items) {
      const itemId = extractId(await menuItems.create({ category, description, isAvailable: true, name, price, restaurantId: id }));
      if (!itemId) throw new Error("Could not read back the new menu item id.");
      items.push({ id: itemId, name, price });
    }
    seeded.push({ id, items });
  }
  return seeded;
}

// Orders across every status so the history page has something to show.
async function seedOrders(customerId: string, catalog: SeededRestaurant[]): Promise<void> {
  const plan: Array<{ lines: Array<[number, number]>; payment: PaymentMethod; restaurant: number; status: OrderStatus }> = [
    { lines: [[0, 1], [3, 2]], payment: "cod", restaurant: 0, status: "delivered" },
    { lines: [[1, 1], [2, 1]], payment: "bkash", restaurant: 1, status: "out_for_delivery" },
    { lines: [[0, 2], [2, 1], [3, 2]], payment: "nagad", restaurant: 2, status: "preparing" },
    { lines: [[0, 1], [1, 1]], payment: "cod", restaurant: 5, status: "placed" },
    { lines: [[1, 2]], payment: "cod", restaurant: 4, status: "cancelled" }
  ];
  for (const entry of plan) {
    const restaurant = catalog[entry.restaurant];
    if (!restaurant) continue;
    const lines = entry.lines.flatMap(([itemIndex, quantity]) => {
      const item = restaurant.items[itemIndex];
      return item ? [{ menuItemId: item.id, name: item.name, quantity, unitPrice: item.price }] : [];
    });
    const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
    await placeOrder(
      { customerId, deliveryAddress: "House 12, Road 5, Dhanmondi, Dhaka", deliveryFee: DELIVERY_FEE_BDT, notes: "", paymentMethod: entry.payment, phone: "01712345678", restaurantId: restaurant.id, status: entry.status, subtotal, total: subtotal + DELIVERY_FEE_BDT },
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
    catalog.push({ id: restaurant.ItemId, items: items.map((item) => ({ id: item.ItemId, name: item.name, price: item.price })) });
  }
  await seedOrders(customerId, catalog);
}

export function formatBdt(amount: number): string {
  return `৳${amount.toLocaleString("en-US")}`;
}
