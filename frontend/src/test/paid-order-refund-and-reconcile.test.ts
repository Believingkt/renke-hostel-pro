import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const threeDs = readFileSync(
  resolve(process.cwd(), "supabase/functions/complete-3ds-booking/index.ts"),
  "utf8",
);
const reconcile = readFileSync(
  resolve(process.cwd(), "supabase/functions/paid-draft-reconcile/index.ts"),
  "utf8",
);

// insert 錯誤區塊＝ if (orderError) { ... } 之後到「Order created:」log 之前
const insertErrorBlock = threeDs.slice(
  threeDs.indexOf("if (orderError) {"),
  threeDs.indexOf('console.log("[complete-3ds-booking] Order created:'),
);

describe("complete-3ds-booking：insert 失敗自動退款", () => {
  it("情境一：insert 其他錯誤會觸發退款分支（insert_error）", () => {
    expect(insertErrorBlock).toContain(
      'return await refundAndFail("insert_error", "order_insert_error", orderError.message);',
    );
    expect(insertErrorBlock).not.toContain('message: "建立訂單失敗"');
    expect(threeDs).toContain('category: kind === "inventory"');
    expect(threeDs).toContain('"order_insert_failed_after_payment"');
  });

  it("情境一附帶：庫存分支行為完全不變（409 + inventoryUnavailable + 原文案）", () => {
    expect(threeDs).toContain(
      'return await refundAndFail("inventory", "inventory_gate_on_insert", orderError.message);',
    );
    expect(threeDs).toContain("inventoryUnavailable: true");
    expect(threeDs).toContain("status: 409");
    expect(threeDs).toContain(
      "很抱歉，您選擇的房型剛剛被其他旅客訂走，款項已全額退回原信用卡（依發卡行作業約 3–7 個工作天入帳）。請重新選擇日期或房型。",
    );
  });

  it("情境二：TapPay 本身失敗（未成功／金額不符）在 insert 之前 return，不觸發退款", () => {
    const beforeInsert = threeDs.slice(0, threeDs.indexOf("// Create the order"));
    const failIdx = beforeInsert.indexOf('message: "付款未成功，無法建立訂單"');
    const mismatchIdx = beforeInsert.indexOf('message: "付款金額與訂單金額不符"');
    expect(failIdx).toBeGreaterThan(-1);
    expect(mismatchIdx).toBeGreaterThan(-1);
    // 這兩段之前不得出現任何 refundAndFail 呼叫
    expect(beforeInsert.slice(0, mismatchIdx)).not.toContain("refundAndFail(");
  });

  it("情境三：重複訂單命中不退款——insert 失敗先重查訂單，查到就回既有訂單", () => {
    expect(insertErrorBlock).toContain('.eq("idempotency_key", body.idempotencyKey)');
    expect(insertErrorBlock).toContain(".ilike(\"notes\", `%${body.recTradeId}%`)");
    expect(insertErrorBlock).toContain("if (raceOrder) {");
    expect(insertErrorBlock).toContain("alreadyExists: true");
    // 重查命中的 return 必須排在退款呼叫之前
    const raceReturn = insertErrorBlock.indexOf("alreadyExists: true");
    const refundCall = insertErrorBlock.indexOf('refundAndFail("insert_error"');
    expect(raceReturn).toBeGreaterThan(-1);
    expect(refundCall).toBeGreaterThan(raceReturn);
  });

  it("insert 成功之後的收尾流程仍為非致命、不退款", () => {
    const afterInsert = threeDs.slice(
      threeDs.indexOf('console.log("[complete-3ds-booking] Order created:'),
    );
    expect(afterInsert).not.toContain("refundAndFail(");
  });
});

describe("paid-draft-reconcile：補救掃描", () => {
  it("只掃靜置超過 15 分鐘的三種狀態、每輪上限 50 筆", () => {
    expect(reconcile).toContain("const STALE_MINUTES = 15;");
    expect(reconcile).toContain("const BATCH_LIMIT = 50;");
    expect(reconcile).toContain(
      '.in("status", ["pending_3ds", "manual_review", "payment_succeeded"])',
    );
    expect(reconcile).toContain('.lt("updated_at", staleBefore)');
  });

  it("補建前先查既有訂單，且一律透過 create-paid-order post-charge 模式", () => {
    expect(reconcile).toContain('.eq("idempotency_key", d.idempotency_key)');
    expect(reconcile).toContain("functions/v1/create-paid-order");
    expect(reconcile).toContain("alreadyChargedRecTradeId: d.rec_trade_id");
    expect(reconcile).not.toContain('.from("orders").insert');
  });

  it("dry-run 模式不寫入任何資料，只回報判定", () => {
    expect(reconcile).toContain("if (dryRun) return;");
    expect(reconcile).toContain('decision: "would_create_order"');
  });

  it("金額不符與查詢失敗一律 manual_review，未扣款標 failed", () => {
    expect(reconcile).toContain('decision: "manual_review_amount_mismatch"');
    expect(reconcile).toContain('decision: "manual_review_query_failed"');
    expect(reconcile).toContain('"expired_not_charged" : "failed_not_charged"');
  });
});
