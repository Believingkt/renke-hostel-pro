/**
 * /cart — 多品項整合購物車（住宿 + 景點 / 票券 / 餐券）
 * 「確認預約」會把加購列暫存到 sessionStorage，並導回既有 BookingFlow 結帳
 * （信用卡 3DS / ATM / LINE Pay 全部沿用既有流程與 Edge Functions，未新建金流）。
 */
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { bookingPath } from "@/lib/frontendUrl";
import { normalizeLang, tripText, type TripLang } from "@/lib/tripI18n";
import {
  buildCheckoutLines,
  cartSubtotal,
  cartTotal,
  clearCart,
  readCart,
  stageTripCheckout,
  writeCart,
  type CartItem,
  type TripCart,
} from "@/lib/tripCart";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export default function Cart() {
  const [params] = useSearchParams();
  const lang = normalizeLang(params.get("lang")) as TripLang;
  const t = tripText(lang);
  const navigate = useNavigate();
  const [cart, setCart] = useState<TripCart>({ tripId: null, items: [] });
  const [checkingOut, setCheckingOut] = useState(false);
  const [showGuestForm, setShowGuestForm] = useState(false);
  const [guest, setGuest] = useState({ name: "", phone: "", email: "" });

  useEffect(() => {
    setCart(readCart());
    const onUpdate = () => setCart(readCart());
    window.addEventListener("trip-cart-updated", onUpdate);
    return () => window.removeEventListener("trip-cart-updated", onUpdate);
  }, []);

  // 已登入會員自動帶入聯絡資料（未登入則走訪客結帳，不強制註冊）
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) return;
      const { data: member } = await supabase
        .from("platform_members")
        .select("name, phone, email")
        .eq("user_id", user.id)
        .maybeSingle();
      setGuest((prev) => ({
        name: prev.name || member?.name || "",
        phone: prev.phone || member?.phone || "",
        email: prev.email || member?.email || user.email || "",
      }));
    })();
  }, []);

  const update = (next: TripCart) => {
    writeCart(next);
    setCart(next);
  };

  const setQty = (key: string, qty: number) => {
    if (qty < 1) return;
    update({ ...cart, items: cart.items.map((i) => (i.key === key ? { ...i, qty } : i)) });
  };

  const removeItem = (key: string) => {
    update({ ...cart, items: cart.items.filter((i) => i.key !== key) });
  };

  const stay = cart.items.find((i): i is Extract<CartItem, { kind: "stay" }> => i.kind === "stay");

  /** 行程商品獨立付款：不需要住宿訂單、不需要認領，直接建立行程訂單並進既有 TapPay 付款頁 */
  const payTripOnly = async () => {
    if (checkingOut) return;
    const productLines = buildCheckoutLines(cart.items);
    if (!productLines.length) return;
    if (!guest.name.trim() || !guest.phone.trim()) {
      setShowGuestForm(true);
      toast.info(
        lang === "ja" ? "お名前と電話番号をご入力ください" : lang === "en" ? "Enter your name and phone" : "請填寫姓名與電話",
      );
      return;
    }
    setCheckingOut(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-trip-order", {
        body: {
          items: productLines.map((l) => ({ product_id: l.product_id, count: l.count })),
          tripId: cart.tripId,
          guest: { name: guest.name.trim(), phone: guest.phone.trim(), email: guest.email.trim() || null },
        },
      });
      const result = data as {
        success?: boolean;
        message?: string;
        order_number?: string;
        amount?: number;
        accommodation_id?: string;
      } | null;
      if (error || !result?.success || !result.order_number) {
        toast.error(result?.message || "建立行程訂單失敗，請稍後再試");
        setCheckingOut(false);
        return;
      }
      clearCart();
      const payParams = new URLSearchParams({
        order_number: result.order_number,
        amount: String(Math.round(Number(result.amount) || 0)),
      });
      if (result.accommodation_id) payParams.set("acc", result.accommodation_id);
      navigate(`/pay/order?${payParams.toString()}`);
    } catch (e) {
      console.error("[Cart] trip order failed", e);
      toast.error("建立行程訂單失敗，請稍後再試");
      setCheckingOut(false);
    }
  };

  const checkout = async () => {
    if (checkingOut) return;
    const productLines = buildCheckoutLines(cart.items);

    // 沒有住宿列 → 行程商品獨立購買，直接付款
    if (!stay && productLines.length > 0) {
      await payTripOnly();
      return;
    }

    setCheckingOut(true);

    // 購物車本身已有住宿列時，以該住宿館別進入既有結帳流程
    const accommodationId = stay?.accommodationId || null;

    if (!accommodationId) {
      toast.info(
        lang === "ja" ? "宿泊をお選びください" : lang === "en" ? "Please pick a stay first" : "請先選擇住宿",
      );
      navigate("/booking");
      return;
    }



    stageTripCheckout({
      tripId: cart.tripId,
      accommodationId,
      lines: productLines,
    });
    navigate(
      bookingPath({
        accommodationId,
        params: stay
          ? {
              roomId: stay.roomTypeId,
              checkIn: stay.checkIn,
              checkOut: stay.checkOut,
              rooms: stay.qty,
              step: "payment",
            }
          : undefined,
        hash: stay ? undefined : "rooms",
      }),
    );
    setCheckingOut(false);
  };


  return (
    <div className="min-h-screen bg-background pb-32">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <Link to={`/trips?lang=${lang}`} aria-label={t.back} className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-secondary">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-base font-bold text-foreground">
          {lang === "ja" ? "カート" : lang === "en" ? "Cart" : "購物車"}
        </h1>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-4">
        {cart.items.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            {lang === "ja" ? "カートは空です" : lang === "en" ? "Your cart is empty" : "購物車是空的"}
          </p>
        ) : (
          <ul className="space-y-3">
            {cart.items.map((item) => (
              <li key={item.key} className="flex gap-3 rounded-xl border border-border bg-card p-3">
                {item.coverUrl ? (
                  <img src={item.coverUrl} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                ) : (
                  <div className="h-16 w-16 shrink-0 rounded-lg bg-secondary" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {item.kind === "stay" ? `${item.accommodationName}・${item.roomName}` : item.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {item.kind === "stay"
                      ? `${item.checkIn} → ${item.checkOut}・${item.nights} 晚`
                      : item.type}
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="inline-flex items-center gap-1 rounded-full border border-border">
                      <button className="p-1.5" onClick={() => setQty(item.key, item.qty - 1)} aria-label="minus">
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="min-w-6 text-center text-sm tabular-nums">{item.qty}</span>
                      <button className="p-1.5" onClick={() => setQty(item.key, item.qty + 1)} aria-label="plus">
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold tabular-nums text-foreground">
                        NT$ {cartSubtotal(item).toLocaleString()}
                      </span>
                      <button onClick={() => removeItem(item.key)} aria-label="remove">
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {!stay && cart.items.length > 0 && (
          <div className="mt-4 space-y-3 rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-semibold text-foreground">
              {lang === "ja" ? "ご連絡先" : lang === "en" ? "Contact details" : "聯絡資料"}
            </p>
            <Input
              value={guest.name}
              onChange={(e) => setGuest({ ...guest, name: e.target.value })}
              placeholder={lang === "ja" ? "お名前" : lang === "en" ? "Name" : "姓名"}
              autoComplete="name"
            />
            <Input
              value={guest.phone}
              onChange={(e) => setGuest({ ...guest, phone: e.target.value })}
              placeholder={lang === "ja" ? "電話番号" : lang === "en" ? "Phone" : "手機號碼"}
              inputMode="tel"
              autoComplete="tel"
            />
            <Input
              value={guest.email}
              onChange={(e) => setGuest({ ...guest, email: e.target.value })}
              placeholder="Email"
              inputMode="email"
              autoComplete="email"
            />
            {showGuestForm && (!guest.name.trim() || !guest.phone.trim()) && (
              <p className="text-xs text-destructive">
                {lang === "ja" ? "お名前と電話番号は必須です" : lang === "en" ? "Name and phone are required" : "請填寫姓名與電話"}
              </p>
            )}
          </div>
        )}
      </div>


      <div className="fixed inset-x-0 bottom-0 safe-bottom border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">{t.total}</p>
            <p className="text-lg font-bold tabular-nums text-foreground">
              NT$ {cartTotal(cart.items).toLocaleString()}
            </p>
          </div>
          <Button onClick={checkout} disabled={cart.items.length === 0 || checkingOut} className="min-w-32">
            {t.cta}
          </Button>
        </div>
      </div>
    </div>
  );
}
