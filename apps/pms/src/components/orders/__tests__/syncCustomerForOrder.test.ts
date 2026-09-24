import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { syncCustomerForOrder } from "../CreateOrderDialog";

const baseParams = {
  accommodationId: "acc-1",
  name: "王小明",
  phone: "0912345678",
  email: "a@b.com",
  gender: "male",
  nationality: "台灣",
  firstOrderDate: "2026-09-01",
};

const makeClient = (result: any) => ({ rpc: vi.fn().mockResolvedValue(result) }) as any;

describe("syncCustomerForOrder", () => {
  beforeEach(() => vi.spyOn(console, "warn").mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it("呼叫 upsert_customer_for_order RPC 並帶入相同來源欄位", async () => {
    const client = makeClient({ data: [{ customer_id: "c-1", action: "created" }], error: null });
    const id = await syncCustomerForOrder({ ...baseParams, client });
    expect(id).toBe("c-1");
    expect(client.rpc).toHaveBeenCalledWith("upsert_customer_for_order", {
      _accommodation_id: "acc-1",
      _name: "王小明",
      _phone: "0912345678",
      _email: "a@b.com",
      _gender: "male",
      _nationality: "台灣",
      _first_order_date: "2026-09-01",
    });
  });

  it("action = updated 也視為成功", async () => {
    const client = makeClient({ data: [{ customer_id: "c-2", action: "updated" }], error: null });
    expect(await syncCustomerForOrder({ ...baseParams, client })).toBe("c-2");
  });

  it("RPC 回錯誤（權限不足 42501）時回傳 null，不 fallback 直寫", async () => {
    const client = makeClient({ data: null, error: { message: "forbidden", code: "42501" } });
    expect(await syncCustomerForOrder({ ...baseParams, client })).toBeNull();
  });

  it("同館重複電話（21000）時回傳 null，不挑第一筆、不重試", async () => {
    const client = makeClient({ data: null, error: { message: "duplicate customer phone", code: "21000" } });
    expect(await syncCustomerForOrder({ ...baseParams, client })).toBeNull();
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it("customer_id 為 null 時不得視為成功", async () => {
    const client = makeClient({ data: [{ customer_id: null, action: "created" }], error: null });
    expect(await syncCustomerForOrder({ ...baseParams, client })).toBeNull();
  });

  it("action 非 created/updated 時不得視為成功", async () => {
    const client = makeClient({ data: [{ customer_id: "c-3", action: "skipped" }], error: null });
    expect(await syncCustomerForOrder({ ...baseParams, client })).toBeNull();
  });

  it("空結果不得視為成功", async () => {
    const client = makeClient({ data: [], error: null });
    expect(await syncCustomerForOrder({ ...baseParams, client })).toBeNull();
  });
});

describe("CreateOrderDialog customer write path contract", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../CreateOrderDialog.tsx"),
    "utf8",
  );

  it("不再有 customers UPDATE / INSERT 直寫，也沒有以電話查詢的 customer lookup", () => {
    expect(src).not.toMatch(/from\("customers"\)[\s\S]{0,200}\.update\(/);
    expect(src).not.toMatch(/from\("customers"\)[\s\S]{0,200}\.insert\(/);
    expect(src).not.toMatch(/\.eq\("phone", guestPhone\)/);
  });

  it("使用 upsert_customer_for_order RPC", () => {
    expect(src).toContain('rpc("upsert_customer_for_order"');
  });
});
