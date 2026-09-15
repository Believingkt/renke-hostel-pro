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
    expect(SRC).not.toMatch(/\bnotes\s*:\s*o\.notes/);
    expect(SRC).not.toMatch(/\.\.\.\s*(o|order|row)\s*,/);
  });

  it("保護原因的註解仍在（避免未來誤刪這道防線）", () => {
    expect(SRC).toContain("V5.5B");
    expect(SRC).toMatch(/嚴禁出現在回傳給 KOL/);
  });
});
