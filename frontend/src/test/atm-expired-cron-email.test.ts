import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { buildCancelEmail } from "../../supabase/functions/_shared/orderCancelledEmail.ts";

const src = readFileSync(
  resolve(process.cwd(), "supabase/functions/cancel-expired-atm-orders/index.ts"),
  "utf8",
);
// 官網 legacy 分支＝檔案中第一段迴圈，止於團購新制註解之前
const legacy = src.slice(0, src.indexOf("NEW CONTRACT（團購 ATM）"));

describe("cancel-expired-atm-orders：官網 legacy 逾期取消寄信", () => {
  it("以 in-process 方式 import 共用寄信模組，不用 HTTP 呼叫", () => {
    expect(src).toContain(
      'import { sendOrderCancelledEmail } from "../_shared/orderCancelledEmail.ts";',
    );
    expect(src).not.toContain("functions/v1/send-order-cancelled-email");
  });

  it("legacy 分支寄信帶 atm_expired 與 atm_expire_at 期限，trigger 為 cron", () => {
    expect(legacy).toContain("sendOrderCancelledEmail(supabase, {");
    expect(legacy).toContain("cancelKind: 'atm_expired'");
    expect(legacy).toContain("formatTaipei(new Date(o.atm_expire_at as string))");
    expect(legacy).toContain("triggerSource: 'atm_expire_cron'");
  });

  it("UPDATE 未真的更新到任何一列時不會往下寄信", () => {
    expect(legacy).toContain("const { data: updated, error: upErr }");
    expect(legacy).toContain("if (upErr || !updated) {");
    const guardIdx = legacy.indexOf("if (upErr || !updated) {");
    const mailIdx = legacy.indexOf("sendOrderCancelledEmail(supabase, {");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(mailIdx).toBeGreaterThan(guardIdx);
  });

  it("寄信排在取消 commit 與 notifications 之後", () => {
    const updIdx = legacy.indexOf(".update({");
    const notifyIdx = legacy.indexOf("from('notifications')");
    const mailIdx = legacy.indexOf("sendOrderCancelledEmail(supabase, {");
    expect(mailIdx).toBeGreaterThan(notifyIdx);
    expect(notifyIdx).toBeGreaterThan(updIdx);
  });

  it("查重只跳過 status='sent'，失敗的下一輪可重試", () => {
    expect(legacy).toContain("from('booking_email_log')");
    expect(legacy).toContain(".eq('email_type', 'order_cancelled')");
    expect(legacy).toContain(".eq('status', 'sent')");
    expect(legacy).toContain("if (!sent) {");
  });

  it("寄信整段包在 try/catch，失敗不中斷整批", () => {
    const mailIdx = legacy.indexOf("sendOrderCancelledEmail(supabase, {");
    const tryIdx = legacy.lastIndexOf("try {", mailIdx);
    const catchIdx = legacy.indexOf("} catch (mailErr) {", mailIdx);
    expect(tryIdx).toBeGreaterThan(-1);
    expect(catchIdx).toBeGreaterThan(mailIdx);
    const block = legacy.slice(tryIdx, catchIdx);
    expect(block).not.toContain("continue;");
    expect(block).not.toContain("throw");
  });

  it("取消判定條件與團購分支維持原樣", () => {
    expect(legacy).toContain("if ((o.paid_amount || 0) > 0) continue;");
    expect(legacy).toContain("if (fresh.payment_status !== 'pending_payment')");
    expect(legacy).toContain("[ATM Expire] ${taipeiIso} - 虛擬帳號逾期未繳款，系統自動取消訂單");
    expect(src).toContain("await sendAtmDeadlineExpiredEmail(supabase, o.id, deadlineTaipei);");
  });

  it("atm_expired 版型：逾期文案存在且無退款區塊", () => {
    const { html } = buildCancelEmail({
      order: {
        order_number: "TEST1234",
        guest_name: "測試",
        check_in_date: "2026-10-01",
        check_out_date: "2026-10-02",
        final_price: 6983,
      },
      accName: "森山寫照",
      cancelKind: "atm_expired",
      deadlineText: "2026/09/09 23:41",
    });
    expect(html).toContain("未於付款期限內完成 ATM 匯款");
    expect(html).toContain("原付款期限：<strong>2026/09/09 23:41</strong>");
    expect(html).toContain("請勿再匯款至原虛擬帳號");
    expect(html).not.toContain("取消手續費");
    expect(html).not.toContain("退款金額");
  });
});
