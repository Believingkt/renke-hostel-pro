import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const src = readFileSync(resolve(__dirname, "../pages/team/TeamOrders.tsx"), "utf8");

describe("成交大師 existing-meta 儲存契約", () => {
  it("使用 narrow RPC 儲存行銷資訊與重新指派成交人", () => {
    expect(src).toContain('"update_team_order_marketing_info"');
    for (const p of [
      "p_order_id",
      "p_traffic_source",
      "p_booking_method",
      "p_ad_id",
      "p_closer_id",
    ]) {
      expect(src).toContain(p);
    }
  });

  it("不再直接送整張 order_meta payload 做 update", () => {
    expect(src).not.toContain(".update(payload as any)");
  });

  it("RPC 無回傳時視為失敗（不得假成功）", () => {
    expect(src).toContain("if (!rpcOrderId) throw new Error");
  });

  it("非行銷欄位的補寫需驗證受影響列數", () => {
    expect(src).toContain("if (!restRows || restRows.length === 0)");
  });

  it("missing-meta INSERT path 維持不變", () => {
    expect(src).toContain('supabase.from("order_meta").insert(payload as any)');
  });
});
