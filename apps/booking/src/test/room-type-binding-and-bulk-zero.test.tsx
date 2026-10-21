import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { splitRoomTypeIds, needsAllRoomsConfirm, ALL_ROOMS_CONFIRM_TEXT } from "@/lib/roomTypeBinding";
import { DeletedRoomTypeChips, AllRoomTypesConfirmDialog } from "@/components/RoomTypeBindingGuard";

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: (...a: any[]) => toastError(...a) } }));

const inserts: any[] = [];
vi.mock("@lakeze/shared/integrations/supabase/client", () => {
  const builder: any = {};
  for (const m of ["select", "in", "gte", "lte", "is", "order", "range", "eq"]) builder[m] = () => builder;
  builder.then = (res: any) => Promise.resolve({ data: [], error: null }).then(res);
  return {
    supabase: {
      from: () => ({
        ...builder,
        insert: (rows: any[]) => { inserts.push(...rows); return Promise.resolve({ error: null }); },
        update: () => builder,
        delete: () => builder,
      }),
    },
  };
});

import { BulkOpenInventoryDialog } from "@/components/BulkOpenInventoryDialog";

const EXISTING = [{ id: "r1" }, { id: "r2" }];

describe("roomTypeBinding 過濾", () => {
  it("過濾掉不存在的房型，保留順序", () => {
    expect(splitRoomTypeIds(["gone", "r2", "r1"], EXISTING)).toEqual({ valid: ["r2", "r1"], removed: ["gone"] });
  });
  it("原本有已刪房型、過濾後全空 → 需要確認", () => {
    expect(needsAllRoomsConfirm(["gone"], [], EXISTING)).toBe(true);
  });
  it("使用者重新勾選有效房型 → 不用確認", () => {
    expect(needsAllRoomsConfirm(["gone"], ["r1"], EXISTING)).toBe(false);
  });
  it("原本就是空（所有房型）或原本全有效 → 不用確認", () => {
    expect(needsAllRoomsConfirm([], [], EXISTING)).toBe(false);
    expect(needsAllRoomsConfirm(["r1"], [], EXISTING)).toBe(false);
  });
});

describe("已刪除房型標籤與確認框", () => {
  it("顯示「已刪除的房型（請移除）」且可點掉", () => {
    const onRemove = vi.fn();
    render(<DeletedRoomTypeChips ids={["gone"]} onRemove={onRemove} />);
    expect(screen.getByTestId("deleted-room-type-chip-gone").textContent).toContain("已刪除的房型（請移除）");
    fireEvent.click(screen.getByTestId("deleted-room-type-remove-gone"));
    expect(onRemove).toHaveBeenCalledWith("gone");
  });
  it("確認框顯示提示文字，按確認才呼叫存檔", () => {
    const onConfirm = vi.fn();
    render(<AllRoomTypesConfirmDialog open onOpenChange={() => {}} onConfirm={onConfirm} />);
    expect(screen.getByTestId("all-room-types-confirm-dialog").textContent).toContain(ALL_ROOMS_CONFIRM_TEXT);
    fireEvent.click(screen.getByTestId("all-room-types-confirm-ok"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe("批次開庫存 0 元防呆", () => {
  beforeEach(() => { inserts.length = 0; toastError.mockClear(); });
  const start = new Date("2026-12-01T00:00:00");
  const end = new Date("2026-12-02T00:00:00");
  const run = async (rooms: any[]) => {
    render(
      <BulkOpenInventoryDialog open onOpenChange={() => {}} accommodationId="acc" roomTypes={rooms}
        defaultStart={start} defaultEnd={end} onComplete={() => {}} />,
    );
    fireEvent.click(screen.getByText("全選"));
    fireEvent.click(screen.getByTestId("bulk-inventory-scan-btn"));
    await waitFor(() => screen.getByTestId("bulk-inventory-submit-btn"));
    fireEvent.click(screen.getByTestId("bulk-inventory-submit-btn"));
  };

  it("沒勾改價、房型基礎價為 0 → 擋下，不寫入", async () => {
    await run([
      { id: "r1", name: "零元房", is_exclusive_package: false, base_price: 0, room_count: 2 },
      { id: "r2", name: "正常房", is_exclusive_package: false, base_price: 3000, room_count: 1 },
    ]);
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastError.mock.calls[0][0]).toBe("請輸入價格或先設定房型基礎價");
    expect(toastError.mock.calls[0][1].description).toContain("零元房");
    expect(inserts).toHaveLength(0);
  });

  it("基礎價都有設定 → 照常寫入基礎價", async () => {
    await run([{ id: "r2", name: "正常房", is_exclusive_package: false, base_price: 3000, room_count: 1 }]);
    await waitFor(() => expect(inserts.length).toBe(2));
    expect(inserts.every((r) => r.price === 3000)).toBe(true);
    expect(toastError).not.toHaveBeenCalled();
  });
});
