import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import OwlTingFillup from "@/pages/OwlTingFillup";

const toastMock = vi.fn();
vi.mock("@lakeze/shared/hooks/use-toast", () => ({ toast: (...args: unknown[]) => toastMock(...args) }));

let submitResult: () => { data: unknown; error: unknown };

vi.mock("@lakeze/shared/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: async (name: string) => {
        if (name === "owlting-fillup-validate") {
          return {
            data: {
              ok: true,
              staging: {
                id: "s-1", obe_number: "OBE-001", accommodation_name: "森山寫照", room_type_name: "四人房",
                project_name: null, room_quantity: 2, check_in_date: "2026-06-10", check_out_date: "2026-06-11",
                guest_count: 4, adult_count: 4, child_count: 0, nights: 1, total_amount: 6000, remaining_amount: 0,
                currency: "TWD", payment_status: "paid", special_requests: null, pii_due_at: null,
              },
              accommodation: { id: "acc-1", name: "森山寫照", short_url_alias: null },
              room_types: [{ id: "rt-1", name: "B1-四人房", base_price: 3000 }],
            },
            error: null,
          };
        }
        if (name === "owlting-fillup-submit") return submitResult();
        return { data: null, error: null };
      },
    },
  },
}));

beforeEach(() => toastMock.mockClear());

async function renderAndSubmit() {
  render(
    <MemoryRouter initialEntries={["/owlting-fillup/tok_abc"]}>
      <Routes><Route path="/owlting-fillup/:token" element={<OwlTingFillup />} /></Routes>
    </MemoryRouter>,
  );
  await waitFor(() => expect(screen.getByLabelText(/住客姓名/)).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText(/住客姓名/), { target: { value: "測試客" } });
  fireEvent.change(screen.getByLabelText(/電話/), { target: { value: "0912345678" } });
  fireEvent.click(screen.getByRole("button", { name: /送出並建立訂單/ }));
}

describe("OwlTingFillup 公開補單頁 — 未分配房號與明細寫入失敗", () => {
  it("成功畫面列出 fillup-unassigned-rooms，且不含其他訂單編號", async () => {
    submitResult = () => ({
      data: {
        ok: true,
        order_id: "o-1",
        order_number: "EWOWN001",
        unassigned_rooms: [
          { room_type_id: "rt-1", requested_unit: "821", reason: "occupied", conflict_order_number: "EWOTHER99" },
          { room_type_id: "rt-unknown", requested_unit: null, reason: "no_free_unit" },
        ],
      },
      error: null,
    });
    await renderAndSubmit();
    const list = await screen.findByTestId("fillup-unassigned-rooms");
    expect(list.textContent).toBe(
      "訂單已建立，但以下 2 間未分配房號，客服將協助安排：• B1-四人房（原指定 821，已被佔用）• 房型（無空房號）",
    );
    expect(list.textContent).not.toMatch(/EWOTHER99|rt-unknown/);
    expect(list.textContent).not.toMatch(/EW[A-Z0-9]+/);
  });

  it("unassigned_rooms 為空 → 不顯示清單", async () => {
    submitResult = () => ({ data: { ok: true, order_id: "o-2", order_number: "EWOWN002", unassigned_rooms: [] }, error: null });
    await renderAndSubmit();
    await screen.findByText("EWOWN002");
    expect(screen.queryByTestId("fillup-unassigned-rooms")).not.toBeInTheDocument();
  });

  it("ROOMS_WRITE_FAILED → 顯示後端 error 文字，停留在表單", async () => {
    const body = { ok: false, code: "ROOMS_WRITE_FAILED", case: "1b", error: "訂單 Y0002 已建立，但房間明細寫入失敗，請聯絡客服", order_number: "Y0002" };
    submitResult = () => ({
      data: null,
      error: { message: "Edge Function returned a non-2xx status code", context: new Response(JSON.stringify(body), { status: 500 }) },
    });
    await renderAndSubmit();
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({ title: "送出失敗", description: body.error, variant: "destructive" }),
    );
    expect(screen.getByRole("button", { name: /送出並建立訂單/ })).toBeInTheDocument();
    expect(screen.queryByTestId("fillup-unassigned-rooms")).not.toBeInTheDocument();
  });
});
