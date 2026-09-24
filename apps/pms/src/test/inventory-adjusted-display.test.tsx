import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useAdjustedAvailability, adjustedKey } from "@/hooks/use-adjusted-availability";

const fetchMock = vi.fn();
vi.mock("@lakeze/shared/lib/inventoryQuery", () => ({
  fetchAdjustedInventoryForRoomTypes: (...args: unknown[]) => fetchMock(...args),
}));

const RT = "rt-1";
const ACC = "acc-1";
const D = "2026-09-09";

async function run(rows: Array<{ date: string; available_rooms: number; is_blocked: boolean }>) {
  fetchMock.mockResolvedValueOnce([{ roomTypeId: RT, rows }]);
  const { result } = renderHook(() => useAdjustedAvailability([RT], [D], ACC));
  await waitFor(() => expect(result.current.adjusted.size).toBeGreaterThan(0));
  return result.current.adjusted.get(adjustedKey(RT, D))!;
}

describe("後台房況 adjusted availability 顯示", () => {
  beforeEach(() => fetchMock.mockReset());

  it("CASE 1: base 1 / hold 0 → 可售 1", async () => {
    expect((await run([{ date: D, available_rooms: 1, is_blocked: false }])).available).toBe(1);
  });

  it("CASE 2: base 1 / active hold 1 → 可售 0", async () => {
    expect((await run([{ date: D, available_rooms: 0, is_blocked: false }])).available).toBe(0);
  });

  it("CASE 3: base 2 / hold 1 → 可售 1", async () => {
    expect((await run([{ date: D, available_rooms: 1, is_blocked: false }])).available).toBe(1);
  });

  it("CASE 4/6: hold 過期或訂單取消 → RPC 回復可售", async () => {
    expect((await run([{ date: D, available_rooms: 1, is_blocked: false }])).available).toBe(1);
  });

  it("CASE 5: converted hold + 正式訂單 → 不 double-count", async () => {
    // 轉單後 RPC 仍只扣一筆
    expect((await run([{ date: D, available_rooms: 0, is_blocked: false }])).available).toBe(0);
  });

  it("blocked（互斥/關閉販售）→ 可售視為 0", async () => {
    const cell = await run([{ date: D, available_rooms: 3, is_blocked: true }]);
    expect(cell.available).toBe(0);
    expect(cell.blocked).toBe(true);
  });

  it("查詢失敗不得誤顯示 0，改為無 adjusted 資料", async () => {
    fetchMock.mockRejectedValueOnce(new Error("timeout"));
    const { result } = renderHook(() => useAdjustedAvailability([RT], [D], ACC));
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.adjusted.size).toBe(0);
  });
});
