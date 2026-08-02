/**
 * /cart — 多品項整合購物車（住宿 + 景點 / 票券 / 餐券）
 * 「確認預約」會把加購列暫存到 sessionStorage，並導回既有 BookingFlow 結帳
 * （信用卡 3DS / ATM / LINE Pay 全部沿用既有流程與 Edge Functions，未新建金流）。
 */
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { bookingPath } from "@/lib/frontendUrl";
import { normalizeLang, tripText, type TripLang } from "@/lib/tripI18n";
import {
  buildCheckoutLines,
  cartSubtotal,
  cartTotal,
  readCart,
  stageTripCheckout,
  writeCart,
  type CartItem,
  type TripCart,
} from "@/lib/tripCart";
import { toast } from "sonner";

export default function Cart() {
  const [params] = useSearchParams();
  const lang = normalizeLang(params.get("lang")) as TripLang;
  const t = tripText(lang);
  const navigate = useNavigate();
  const [cart, setCart] = useState<TripCart>({ tripId: null, items: [] });

  useEffect(() => {
    setCart(readCart());
    const onUpdate = () => setCart(readCart());
    window.addEventListener("trip-cart-updated", onUpdate);
    return () => window.removeEventListener("trip-cart-updated", onUpdate);
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

  const checkout = () => {
    if (!stay) {
      toast.error(lang === "ja" ? "宿泊を追加してください" : lang === "en" ? "Please add a stay first" : "請先加入住宿");
      return;
    }
    stageTripCheckout({
      tripId: cart.tripId,
      accommodationId: stay.accommodationId,
      lines: buildCheckoutLines(cart.items),
    });
    navigate(
      bookingPath({
        accommodationId: stay.accommodationId,
        params: {
          roomId: stay.roomTypeId,
          checkIn: stay.checkIn,
          checkOut: stay.checkOut,
          rooms: stay.qty,
          step: "payment",
        },
      }),
    );
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
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">{t.total}</p>
            <p className="text-lg font-bold tabular-nums text-foreground">
              NT$ {cartTotal(cart.items).toLocaleString()}
            </p>
          </div>
          <Button onClick={checkout} disabled={cart.items.length === 0} className="min-w-32">
            {t.cta}
          </Button>
        </div>
      </div>
    </div>
  );
}
