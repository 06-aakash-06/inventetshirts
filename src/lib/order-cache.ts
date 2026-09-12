import type { Order } from "./api";

export const ORDERS_STORAGE_KEY = "invente-orders-v2";
export const ORDER_CACHE_UPDATED_EVENT = "invente-orders-updated";

interface OrdersSnapshot {
  savedAt: number;
  data: Order[];
}

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readOrdersSnapshot(): OrdersSnapshot | null {
  if (!canUseStorage()) return null;

  try {
    const stored = window.localStorage.getItem(ORDERS_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : null;
    if (!Array.isArray(parsed?.data) || parsed.data.length === 0) return null;
    return {
      savedAt: Number(parsed.savedAt) || 0,
      data: parsed.data as Order[],
    };
  } catch {
    return null;
  }
}

export function saveOrdersSnapshot(data: Order[], savedAt = Date.now()) {
  if (!canUseStorage()) return;

  try {
    window.localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify({ savedAt, data }));
    window.dispatchEvent(new Event(ORDER_CACHE_UPDATED_EVENT));
  } catch {
    // Browser storage is only a speed optimization, never a requirement.
  }
}

function comparable(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function lookupValue(reference: string) {
  const value = reference.trim();
  const separator = value.lastIndexOf(".");
  return separator > 0 ? value.substring(0, separator) : value;
}

export function findCachedOrder(reference: string, orders?: Order[]) {
  const wanted = comparable(lookupValue(reference));
  if (!wanted) return null;

  const source = orders || readOrdersSnapshot()?.data || [];
  return source.find((order) => [
    order["Order ID"],
    order["Register Number"],
    order["Digital ID"],
    order["Phone Number"],
  ].some((value) => comparable(value) === wanted)) || null;
}

export function updateCachedOrder(order: Partial<Order> & { "Order ID": string }) {
  const snapshot = readOrdersSnapshot();
  if (!snapshot) return;

  const orderId = comparable(order["Order ID"]);
  const index = snapshot.data.findIndex((item) => comparable(item["Order ID"]) === orderId);
  if (index === -1) return;

  const data = snapshot.data.slice();
  data[index] = { ...data[index], ...order } as Order;
  saveOrdersSnapshot(data);
}
