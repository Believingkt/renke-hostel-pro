# 官網 ATM 逾期取消通知信（修正版設計稿）

只補一個缺口：官網（非 group_buy）ATM 訂單因虛擬帳號到期未繳款被系統自動取消時，客人完全收不到通知信。

依上一輪討論修正方向：組信／寄信邏輯抽成可直接 import 的共用模組，HTTP 入口變薄，cron 直接 in-process 呼叫，不再多一層網路呼叫。

## 檔案異動清單

### A. 新增 `supabase/functions/_shared/orderCancelledEmail.ts`

```ts
export type CancelKind = "guest_request" | "atm_expired";

export interface CancelEmailInput {
  orderNumber: string;
  guestName: string;
  roomName: string;
  checkInDate: string;
  checkOutDate: string;
  finalPrice: number;
  accName: string;
  accPhone: string;
  accEmail: string;
  cancelKind?: CancelKind;   // 預設 guest_request
  chargedFee?: number;
  refunded?: number;
  needManual?: boolean;
  reason?: string | null;
  deadlineText?: string;     // 僅 atm_expired 使用
  rebookUrl?: string | null; // 僅 atm_expired 使用
}

/** 純函式：只組主旨與 HTML，不碰 DB、不寄信。單元測試對象。 */
export function buildCancelEmail(input: CancelEmailInput): { subject: string; html: string };

/** 撈訂單＋民宿資料 → buildCancelEmail → Resend 寄出 → 寫 booking_email_log。 */
export async function sendOrderCancelledEmail(
  admin: SupabaseClient,
  params: {
    orderId?: string;
    orderNumber?: string;
    cancelKind?: CancelKind;
    chargedFee?: number;
    refunded?: number;
    needManual?: boolean;
    reason?: string | null;
    deadlineText?: string;
    triggerSource?: string;
    previewTo?: string;      // 有值時只寄此地址，log 標記 preview
  },
): Promise<{ success: boolean; skipped?: string; error?: string; status?: number }>;
```

職責界線：`buildCancelEmail()` 只做文案；`sendOrderCancelledEmail()` 只做取資料、寄送、寫紀錄，不做權限判斷（權限留在各呼叫端）。

`guest_request` 分支的主旨與 HTML 字串，逐字沿用目前 `send-order-cancelled-email/index.ts:79-122` 的內容，一個字都不改。

`atm_expired` 分支：主旨「【付款期限已過】訂單已自動取消 - 訂單編號 XXXX」；內文說明因未於付款期限完成 ATM 轉帳、系統自動取消；表格加「付款期限」一列；不顯示退款／手續費區塊；加「請勿再匯款至原虛擬帳號」提醒與重新訂房連結。

### B. 改寫 `supabase/functions/send-order-cancelled-email/index.ts`（變薄）

保留：CORS、`token !== SERVICE_KEY → 403`、`!orderId && !orderNumber → 400`、成功 `{success:true}`、找不到單 `{success:false,error:"order_not_found"}` 404、無信箱 `{success:true,skipped:"no_email"}`、Resend 失敗 502、例外 500。全部狀態碼與 JSON 形狀維持原樣。

移除：組信與寄信程式碼，改成一行呼叫 `sendOrderCancelledEmail(admin, {...body})`，再依回傳映射成原本的 HTTP 回應。

三支既有呼叫方（`cancel-order-with-refund:347`、`member-order-manage:274`、`public-order-cancel:154`）都沒傳 `cancelKind`，落在預設 `guest_request`，HTTP 行為與回應格式不變。

### C. 改 `supabase/functions/cancel-expired-atm-orders/index.ts` 官網 legacy 分支（34–93 行）

- 檔頭加 `import { sendOrderCancelledEmail } from "../_shared/orderCancelledEmail.ts";`
- 原本 70–80 行的 UPDATE 補上 `.select('id').maybeSingle()`，判斷改成 `if (upErr || !updated) continue;`（與團購分支同構，確保沒被更新的訂單不會寄信）。
- 位置：`cancelled.push()` 與 `notifications` insert 之後、迴圈結尾之前，加：

```ts
try {
  const { data: sent } = await supabase
    .from('booking_email_log')
    .select('id')
    .eq('order_id', o.id)
    .eq('email_type', 'order_cancelled')
    .limit(1)
    .maybeSingle();
  if (!sent) {
    await sendOrderCancelledEmail(supabase, {
      orderId: o.id,
      cancelKind: 'atm_expired',
      deadlineText: formatTaipei(new Date(o.atm_expire_at as string)),
      triggerSource: 'atm_expire_cron',
    });
  }
} catch (mailErr) {
  console.error('[cancel-expired-atm-orders] expired email threw:', o.order_number, mailErr);
}
```

寄信失敗只記 log，絕不回滾取消。團購分支（96–168 行）一行不動。
