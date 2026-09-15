# V5.5B.4 — kol-dashboard 保險式排除 notes（設計稿，未施工）

## 事實前提（唯讀查證）
- `ORDER_SELECT`（L11-12）有撈 `notes`，且**必須繼續撈**：`commissionBaseFromOrder()` → `extraOnSiteAddonFromNotes()` 會從 notes 解析 `【額外現場加購金額】…【額外現場加購金額END】`（V2/V3 分潤基準需要）。
- 回傳端（L118-133）逐欄組裝，目前**沒有**把 notes 放進 `orders[]`。
- 因此本次不是修 bug，是加「防未來誤加回去」的保險：明確剝除 + 註解 + 回歸測試。

## 1) `supabase/functions/kol-dashboard/index.ts`

### 1-1 檔頭常數區（現況 L11-12），改為：

```ts
/**
 * 🔒 notes 僅供伺服器端解析分潤用，嚴禁出現在回傳給 KOL 的 payload。
 *
 * 為什麼要撈 notes：commissionBaseFromOrder() → extraOnSiteAddonFromNotes() 需要從備註
 * 解析【額外現場加購金額】…【額外現場加購金額END】，V2/V3 分潤基準都依賴它。刪掉會算錯錢。
 *
 * 為什麼不能回傳 notes：orders.notes 內含內部稽核行（🔒）、金流資料（ATM 虛擬帳號、
 * rec_trade_id、3DS / TapPay webhook 紀錄）、包棟／包區房間配置、以及客人聯絡方式。
 * KOL 是外部合作對象，只該看到自己代碼帶來的訂單金額與分潤，不該看到上述任何一項。
 * 2026-09 V5.5B 系列（B.1 OwlTing 推送、B.2 客人確認信／會員訂單頁、B.3 點數平台 API、
 * B.4 本檔）已逐一確認此原則。
 *
 * ⚠️ 未來維護者請注意：
 *   - 不要因為「看起來沒用到」就刪掉下面的 stripInternal()，那是最後一道防線。
 *   - 若真的要在 KOL 後台顯示備註，必須改走 buildOwltingNotes() 白名單過濾
 *     （supabase/functions/_shared/owltingNotesWhitelist.ts），不可直接塞 o.notes。
 *   - 不要把整列訂單用 `...o` 展開放進回傳物件。
 */
const ORDER_SELECT =
  "id, order_number, discount_code, check_in_date, check_out_date, order_date, total_price, final_price, order_status, accommodation_id, custom_addon_details, notes, currency_at_booking";

/**
 * 回傳前的最後一道防線：任何情況下都不讓 notes 流出到 KOL 端。
 * 對目前的欄位白名單而言是 no-op；價值在於擋住未來的 `...o` 展開式改寫。
 */
function stripInternal<T extends Record<string, unknown>>(row: T): Omit<T, "notes"> {
  const { notes: _notes, ...safe } = row as T & { notes?: unknown };
  return safe as Omit<T, "notes">;
}
```

### 1-2 回傳組裝（現況 L118-133）diff：

```diff
-    orders.push({
+    orders.push(stripInternal({
       id: o.id,
       order_number: o.order_number,
       discount_code: o.discount_code,
       order_date: o.order_date,
       check_in_date: o.check_in_date,
       check_out_date: o.check_out_date,
       order_status: o.order_status,
       accommodation_id: o.accommodation_id,
       gross_revenue: g,
       addon_total: addon,
       commission_base: base,
       commission_rate: rate,
       commission_amount: commission,
       is_settleable: isSettleable,
-    });
+    }));
```

其餘程式碼（查詢、篩選、分潤計算、總計、排序、其他 handler）完全不動。

## 2) 新增回歸測試 `src/test/kol-dashboard-no-notes.test.ts`（完整內容）

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const SRC = readFileSync(
  path.resolve(process.cwd(), "supabase/functions/kol-dashboard/index.ts"),
  "utf8",
);

describe("kol-dashboard 不得回傳 orders.notes（V5.5B.4 保險式排除）", () => {
  it("ORDER_SELECT 仍保留 notes（分潤解析需要，不可誤刪）", () => {
    const m = SRC.match(/const ORDER_SELECT\s*=\s*([\s\S]*?);/);
    expect(m).not.toBeNull();
    expect(m![1]).toContain("notes");
  });

  it("stripInternal() 存在且會剝除 notes", () => {
    expect(SRC).toMatch(/function stripInternal/);
    expect(SRC).toMatch(/const \{\s*notes:\s*_notes,\s*\.\.\.safe\s*\}/);
  });

  it("KOL 訂單回傳陣列的組裝有經過 stripInternal()", () => {
    expect(SRC).toMatch(/orders\.push\(\s*stripInternal\(/);
  });

  it("回傳物件內不得出現 notes 欄位或整列展開", () => {
    // 直接把 notes 塞進回傳物件
    expect(SRC).not.toMatch(/\bnotes\s*:\s*o\.notes/);
    // 整列展開（...o / ...order / ...row），會夾帶 notes
    expect(SRC).not.toMatch(/\.\.\.\s*(o|order|row)\s*,/);
  });

  it("保護原因的註解仍在（避免未來誤刪這道防線）", () => {
    expect(SRC).toContain("V5.5B");
    expect(SRC).toMatch(/嚴禁出現在回傳給 KOL/);
  });
});
```

## 3) 影響面
- 行為零變化：回傳欄位與現況完全相同，分潤金額計算不受影響。
- 無 migration、無 DB 寫入、不影響前端（`KolDashboardPublic.tsx` 本來就沒讀 notes）。
- 需重新部署 `kol-dashboard`；回滾＝還原此檔並刪除測試檔。

## 4) 範圍外（如實說明）
`kol-bonus-public`、`kol-webhook` 本次不動（先前查證兩者皆未 select 或回傳 notes）。
