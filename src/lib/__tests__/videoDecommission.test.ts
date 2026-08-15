/**
 * 影音組分潤停用回歸測試
 *
 * 驗證三件事：
 * 1. 新快照／新補差不再產生 video 金額（掃描 Edge Function 原始碼的關鍵不變式）
 * 2. 取消沖銷（cancellation / reactivation）仍以快照原值鏡像，歷史追溯不被破壞
 * 3. 其他分潤類型（成交組、星探、AM…）未受影響
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BONUS_FORMULAS } from "@/lib/bonusFormulas";
import { BONUS_RATE_META } from "@/lib/bonusRateMeta";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const snapshots = read("supabase/functions/create-commission-snapshots/index.ts");
const adjustments = read("supabase/functions/create-commission-adjustments/index.ts");
const preview = read("supabase/functions/preview-closer-commission/index.ts");

describe("快照不再產生 video 金額", () => {
  it("create-commission-snapshots 將 videoAmt 固定為 0、video_rate 為 null", () => {
    expect(snapshots).toMatch(/const videoAmt = 0;/);
    expect(snapshots).toMatch(/video_rate: null,/);
    expect(snapshots).not.toMatch(/videoAmt\s*=\s*[^0;]/);
  });

  it("preview-closer-commission 試算的影音金額為 0", () => {
    expect(preview).toMatch(/const videoRate = 0;/);
    expect(preview).toMatch(/const videoAmt = 0;/);
  });

  it("金額異動補差不再產生影音差額", () => {
    expect(adjustments).toMatch(/const videoAmt = 0;/);
  });
});

describe("取消沖銷仍正確鏡像快照原值", () => {
  it("cancellation 以快照影音金額取負值沖銷", () => {
    expect(adjustments).toMatch(/video_amount: -Number\(s\.video_commission_amount \?\? 0\)/);
    expect(adjustments).toMatch(/closer_amount: -Number\(s\.closer_commission_amount \?\? 0\)/);
  });

  it("reactivation 以快照原值回補", () => {
    expect(adjustments).toMatch(/video_amount: Number\(snap\.video_commission_amount \?\? 0\)/);
    expect(adjustments).toMatch(/closer_amount: Number\(snap\.closer_commission_amount \?\? 0\)/);
  });

  it("重算未發放快照時，取消沖銷同樣沿用快照原值", () => {
    expect(snapshots).toMatch(/video_amount: -Number\(s\.video_commission_amount \?\? 0\)/);
  });
});

describe("前端不再提供影音組分潤的入口", () => {
  it("獎金公式清單沒有 video 項目", () => {
    expect(BONUS_FORMULAS.find((f) => f.key === "video")).toBeUndefined();
  });

  it("費率說明沒有 video 項目", () => {
    expect(BONUS_RATE_META["video"]).toBeUndefined();
  });

  it("加倍活動新增選單排除 video", () => {
    const src = read("src/components/team/BonusMultiplierSection.tsx");
    expect(src).toMatch(/filter\(\(\[k\]\) => k !== "video"\)/);
  });

  it("館別費率設定不再寫入新的影音費率", () => {
    const src = read("src/components/team/CommissionRatesTab.tsx");
    expect(src).toMatch(/video_rate: editing\.video_rate,/);
    expect(src).not.toMatch(/value=\{videoRate\}/);
  });
});

describe("其他分潤類型未被破壞", () => {
  it("成交組分潤公式與費率設定仍存在", () => {
    expect(BONUS_FORMULAS.find((f) => f.key === "closer")).toBeDefined();
    expect(BONUS_RATE_META["closer"]?.venueRateField).toBe("closer_rate");
    expect(snapshots).toMatch(/closer_commission_amount/);
  });

  it("星探與 AM 類獎金公式仍存在", () => {
    for (const key of ["scout_kol", "scout_base", "am_performance"]) {
      expect(BONUS_FORMULAS.find((f) => f.key === key)).toBeDefined();
    }
  });
});
