/**
 * /liff/checkout — LINE 內結帳頁（行動優先）
 * 讀取小安的暫存購物 → 沿用既有 /cart 結帳邏輯與金流（BookingFlow：信用卡 3DS / LINE Pay / ATM）。
 * 未在 LINE 環境開啟時顯示引導提示（可用 ?u=Uxxx mock 驗證）。
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { initLiff, butlerApi, type LiffProfile } from "@/lib/liff";
import {
  buildCheckoutLines,
  cartSubtotal,
  cartTotal,
  stageTripCheckout,
  writeCart,
  type CartItem,
} from "@/lib/tripCart";
import { toast } from "sonner";

interface CartResponse {
  cart: CartItem[];
  state?: { guests?: number } | null;
}

export default function LiffCheckout() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<LiffProfile | null>(null);
  const [items, setItems] = useState<CartItem[]>([]);
  const [guests, setGuests] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const p = await initLiff();
      setProfile(p);
      if (p.lineUserId) {
        const res = await butlerApi<CartResponse>({ action: "get_cart", line_user_id: p.lineUserId });
        setItems(res?.cart ?? []);
        setGuests(res?.state?.guests ?? null);
      }
      setLoading(false);
    })();
  }, []);

  const stay = items.find((i): i is Extract<CartItem, { kind: "stay" }> => i.kind === "stay");

  const checkout = () => {
    try {
      if (!stay) {
        toast.error("請先在對話中選擇房型");
        return;
      }
      const missing: string[] = [];
      if (!stay.accommodationId) missing.push("館別");
      if (!stay.roomTypeId) missing.push("房型");
      if (!stay.checkIn || !stay.checkOut) missing.push("入住日期");
      if (missing.length) {
        toast.error(`購物清單缺少${missing.join("、")}，請回 LINE 重新選擇`);
        return;
      }

      // 同步寫入既有前台購物車，維持 /cart 與結帳流程一致
      writeCart({ tripId: null, items });
      stageTripCheckout({
        tripId: null,
        accommodationId: stay.accommodationId,
        lines: buildCheckoutLines(items),
      });
      if (profile?.lineUserId) sessionStorage.setItem("liff_line_user_id", profile.lineUserId);

      // 直接進入既有 BookingFlow 金流頁（/book），不是館別介紹頁
      const params = new URLSearchParams();
      params.set("acc", stay.accommodationId);
      params.set("roomId", stay.roomTypeId);
      params.set("checkIn", stay.checkIn);
      params.set("checkOut", stay.checkOut);
      params.set("adults", String(Math.max(1, guests ?? 2)));
      if (stay.qty > 1) params.set("rooms", String(stay.qty));
      params.set("step", "payment");
      navigate(`/book?${params.toString()}`);
    } catch (err) {
      console.error("[LiffCheckout] checkout failed", err);
      toast.error(`無法進入付款流程：${err instanceof Error ? err.message : "未知錯誤"}`);
    }
  };


  if (loading) return null;

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <h1 className="text-base font-bold text-foreground">🧸 小安幫你整理的訂單</h1>
      </header>

      <div className="mx-auto max-w-xl px-4 py-4">
        {profile?.isMock && (
          <div className="mb-4 rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            目前不是在 LINE App 內開啟（測試模式）。請從 LINE 對話中的「前往結帳」按鈕開啟，才能自動帶入你的購物清單。
          </div>
        )}

        {items.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">購物清單是空的，回 LINE 跟小安說想住哪幾天吧 😊</p>
        ) : (
          <ul className="space-y-3">
            {items.map((item, idx) => (
              <li key={idx} className="flex gap-3 rounded-xl border border-border bg-card p-3">
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
                    {item.kind === "stay" ? `${item.checkIn} → ${item.checkOut}・${item.nights} 晚` : item.type}
                  </p>
                  <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">
                    NT$ {cartSubtotal(item).toLocaleString()} × {item.qty}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 safe-bottom border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">合計</p>
            <p className="text-lg font-bold tabular-nums text-foreground">NT$ {cartTotal(items).toLocaleString()}</p>
          </div>
          <Button onClick={checkout} disabled={items.length === 0} className="min-w-32">
            前往付款
          </Button>
        </div>
      </div>
    </div>
  );
}
