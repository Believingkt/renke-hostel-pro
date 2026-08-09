/**
 * 行程「多品項購物車」— 純前端狀態（localStorage），不另做金流。
 * 結帳時把住宿列導回既有 BookingFlow（/booking/:accId），
 * 其餘品項（景點／票券／餐券）以既有 custom_addon_details 機制掛在訂單上。
 */

export const TRIP_CART_KEY = "trip_cart_v1";
export const TRIP_CHECKOUT_KEY = "trip_checkout_v1";

export interface CartStayItem {
  kind: "stay";
  key: string;
  roomTypeId: string;
  accommodationId: string;
  roomName: string;
  accommodationName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  /** 顯示用每晚均價（僅顯示，不得參與加總） */
  unitPrice: number;
  /** 單一房間整段 stay 的實價（唯一計價來源） */
  stayTotal?: number;
  qty: number;
  coverUrl?: string | null;
}

export interface CartProductItem {
  kind: "product";
  key: string;
  productId: string;
  name: string;
  type: string;
  unitPrice: number;
  qty: number;
  coverUrl?: string | null;
}

export type CartItem = CartStayItem | CartProductItem;

export interface TripCart {
  tripId: string | null;
  items: CartItem[];
}

const EMPTY: TripCart = { tripId: null, items: [] };

export function readCart(): TripCart {
  try {
    const raw = localStorage.getItem(TRIP_CART_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as TripCart;
    if (!parsed || !Array.isArray(parsed.items)) return EMPTY;
    return parsed;
  } catch {
    return EMPTY;
  }
}

export function writeCart(cart: TripCart) {
  localStorage.setItem(TRIP_CART_KEY, JSON.stringify(cart));
  window.dispatchEvent(new CustomEvent("trip-cart-updated"));
}

export function clearCart() {
  localStorage.removeItem(TRIP_CART_KEY);
  window.dispatchEvent(new CustomEvent("trip-cart-updated"));
}

export function cartSubtotal(item: CartItem): number {
  if (item.kind === "stay") {
    const stayTotal =
      Number(item.stayTotal ?? 0) || Math.round(item.unitPrice * Math.max(1, item.nights));
    return stayTotal * Math.max(1, item.qty);
  }
  return item.unitPrice * item.qty;
}

export function cartTotal(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + cartSubtotal(i), 0);
}

/** 送往既有結帳流程的行程加購列（沿用 custom_addon_details 結構） */
export interface TripCheckoutLine {
  source: "trip_product";
  product_id: string;
  addon_type: string;
  count: number;
  price_per_unit: number;
  pricing_mode: "per_stay";
  total: number;
  unit_label: string;
  name: string;
}

export interface TripCheckoutPayload {
  tripId: string | null;
  accommodationId: string;
  lines: TripCheckoutLine[];
}

export function buildCheckoutLines(items: CartItem[]): TripCheckoutLine[] {
  return items
    .filter((i): i is CartProductItem => i.kind === "product" && i.qty > 0)
    .map((i) => ({
      source: "trip_product" as const,
      product_id: i.productId,
      addon_type: `trip_${i.productId}`,
      count: i.qty,
      price_per_unit: i.unitPrice,
      pricing_mode: "per_stay" as const,
      total: i.unitPrice * i.qty,
      unit_label: "份",
      name: i.name,
    }));
}

export function stageTripCheckout(payload: TripCheckoutPayload) {
  sessionStorage.setItem(TRIP_CHECKOUT_KEY, JSON.stringify(payload));
}

export function readTripCheckout(): TripCheckoutPayload | null {
  try {
    const raw = sessionStorage.getItem(TRIP_CHECKOUT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TripCheckoutPayload;
    if (!parsed?.accommodationId || !Array.isArray(parsed.lines)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearTripCheckout() {
  sessionStorage.removeItem(TRIP_CHECKOUT_KEY);
}
