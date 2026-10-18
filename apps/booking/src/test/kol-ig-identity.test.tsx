import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const records = [
  { id: "1", name: "小方糖謝晴煦", venue_name: "良辰暖居", invited_at: "2026-09-01", cid_code: "SUGAR", booking_status: "成功訂房", primary_profile_id: null, scout_name: "阿比" },
  { id: "2", name: "小方糖謝晴煦", venue_name: "旅行日", invited_at: "2026-09-20", cid_code: "SUGAR2", booking_status: "已取消", primary_profile_id: null, scout_name: "小明" },
  { id: "3", name: "謝晴煦小方糖", venue_name: "良辰暖居", invited_at: "2026-10-05", cid_code: "SUGAR", booking_status: "邀約中", primary_profile_id: "1", scout_name: "阿比" },
];

vi.mock("@/hooks/useKolIgRecords", async (orig) => {
  const actual = await orig<typeof import("@/hooks/useKolIgRecords")>();
  return { ...actual, useKolIgRecords: () => ({ records, loading: false }) };
});

import { escapeIlike, groupKolNames } from "@/hooks/useKolIgRecords";
import { KolIgNameHint } from "@/components/kol/KolIgNameHint";
import { KolIdentityConflictPanel } from "@/components/kol/KolIdentityConflictPanel";

describe("KOL 同 IG 名稱", () => {
  it("escapeIlike 跳脫底線與百分比，IG 底線不會變成萬用字元", () => {
    expect(escapeIlike("sugar_tw")).toBe("sugar\\_tw");
    expect(escapeIlike("a%b\\c")).toBe("a\\%b\\\\c");
  });

  it("groupKolNames 依筆數排序", () => {
    expect(groupKolNames(records)).toEqual([
      { name: "小方糖謝晴煦", count: 2 },
      { name: "謝晴煦小方糖", count: 1 },
    ]);
  });

  it("輸入 IG 後帶出既有名稱，按「套用這個名稱」會帶入", () => {
    const onApply = vi.fn();
    render(<KolIgNameHint igHandle="sugar_tw" currentName="謝晴煦小方糖" excludeId={null} onApply={onApply} />);
    expect(screen.getByTestId("kol-ig-name-hint")).toHaveTextContent("「小方糖謝晴煦」（2 筆）");
    expect(screen.getByTestId("kol-ig-name-hint")).toHaveTextContent("同一個 IG 有多種寫法");
    fireEvent.click(screen.getByTestId("kol-ig-name-apply-小方糖謝晴煦"));
    expect(onApply).toHaveBeenCalledWith("小方糖謝晴煦");
  });

  it("擋下視窗列出既有紀錄，並提供「改用既有名稱」與「IG 貼錯」", () => {
    const onUseName = vi.fn();
    const onFixIg = vi.fn();
    render(
      <KolIdentityConflictPanel igHandle="sugar_tw" currentName="謝晴煦小方糖" excludeId={null} onUseName={onUseName} onFixIg={onFixIg} />,
    );
    expect(screen.getByTestId("kol-conflict-row-1")).toHaveTextContent("良辰暖居");
    expect(screen.getByTestId("kol-conflict-row-1")).toHaveTextContent("阿比");
    expect(screen.getByTestId("kol-conflict-row-3")).toHaveTextContent("（附屬）");
    expect(screen.queryByTestId("kol-conflict-use-name-謝晴煦小方糖")).toBeNull();
    fireEvent.click(screen.getByTestId("kol-conflict-use-name-小方糖謝晴煦"));
    expect(onUseName).toHaveBeenCalledWith("小方糖謝晴煦");
    fireEvent.click(screen.getByTestId("kol-conflict-fix-ig"));
    expect(onFixIg).toHaveBeenCalled();
  });
});
