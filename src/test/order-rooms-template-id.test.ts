import { describe, it, expect } from "vitest";
import { resolveTemplateId, type TemplateLite } from "@/lib/resolveTemplateId";

const RT_A = "11111111-1111-1111-1111-111111111111";
const RT_B = "22222222-2222-2222-2222-222222222222";

const tplSea: TemplateLite = { id: "t-sea", template_name: "海景四人房", room_type_ids: [RT_A] };
const tplMountain: TemplateLite = { id: "t-mtn", template_name: "山景四人房", room_type_ids: [RT_B] };
const tplGeneric: TemplateLite = { id: "t-all", template_name: "包棟方案", room_type_ids: [] };
const tplDupA: TemplateLite = { id: "t-dup-a", template_name: "早鳥", room_type_ids: [RT_A] };
const tplDupB: TemplateLite = { id: "t-dup-b", template_name: "早鳥", room_type_ids: [RT_A] };
const tplDupOther: TemplateLite = { id: "t-dup-c", template_name: "早鳥", room_type_ids: [RT_B] };
const tplLegacy: TemplateLite = { id: "t-legacy", template_name: "舊綁定", room_type_id: RT_A };

const all = [tplSea, tplMountain, tplGeneric, tplDupA, tplDupB, tplDupOther, tplLegacy];

describe("resolveTemplateId", () => {
  it("名稱為空 → null", () => {
    expect(resolveTemplateId(all, RT_A, "")).toBeNull();
  });

  it("名稱為 null → null", () => {
    expect(resolveTemplateId(all, RT_A, null)).toBeNull();
  });

  it("唯一對應 → 回傳該 id", () => {
    expect(resolveTemplateId(all, RT_A, "海景四人房")).toBe("t-sea");
  });

  it("通用方案（未綁房型）→ 任何房型都適用", () => {
    expect(resolveTemplateId(all, RT_B, "包棟方案")).toBe("t-all");
  });

  it("名稱相符但房型不符 → null", () => {
    expect(resolveTemplateId(all, RT_B, "海景四人房")).toBeNull();
  });

  it("查無同名方案 → null", () => {
    expect(resolveTemplateId(all, RT_A, "不存在的方案")).toBeNull();
  });

  it("同名多筆且皆適用 → 模糊，回 null", () => {
    expect(resolveTemplateId(all, RT_A, "早鳥")).toBeNull();
  });

  it("同名多筆但僅一筆適用該房型 → 回該筆", () => {
    expect(resolveTemplateId([tplDupA, tplDupOther], RT_B, "早鳥")).toBe("t-dup-c");
  });

  it("既有 template_id 仍相符 → 原封保留（同名多筆也不漂移）", () => {
    expect(resolveTemplateId(all, RT_A, "早鳥", "t-dup-b")).toBe("t-dup-b");
  });

  it("既有 template_id 名稱已改 → 重新解析", () => {
    expect(resolveTemplateId(all, RT_A, "海景四人房", "t-dup-a")).toBe("t-sea");
  });

  it("既有 template_id 已失效（清單查無）→ 重新解析", () => {
    expect(resolveTemplateId(all, RT_A, "海景四人房", "t-gone")).toBe("t-sea");
  });

  it("legacy room_type_id 綁定也能解析；空清單 → null", () => {
    expect(resolveTemplateId(all, RT_A, "舊綁定")).toBe("t-legacy");
    expect(resolveTemplateId([], RT_A, "海景四人房")).toBeNull();
    expect(resolveTemplateId(null, RT_A, "海景四人房")).toBeNull();
  });
});
