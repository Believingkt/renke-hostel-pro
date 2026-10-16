import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { toast } from "sonner";
import { OwlTingFillupDialog } from "@/components/OwlTingFillupDialog";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const stagingRow = {
  id: "staging-1",
  raw_email_id: "raw-1",
  obe_number: "OBE-TEST-001",
  accommodation_id: "acc-1",
  accommodation_name: "森山寫照",
  room_type_name: "雙人房",
  check_in_date: "2026-06-10",
  check_out_date: "2026-06-11",
  guest_count: 2,
  total_amount: 3800,
  pii_status: "pending_pii_fillup",
  auto_order_id: null,
};

let submitResult: () => { data: unknown; error: unknown };

vi.mock("@lakeze/shared/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: stagingRow, error: null }) }),
        order: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
    functions: {
      invoke: async (name: string) => {
        if (name === "owlting-fillup-issue") return { data: { ok: true, token: "tok_abc1234567890123" }, error: null };
        if (name === "owlting-fillup-validate") {
          return {
            data: { ok: true, room_types: [{ id: "room-1", name: "B1-四人房", base_price: 3800 }], accommodation: { name: "森山寫照" } },
            error: null,
          };
        }
        if (name === "owlting-fillup-submit") return submitResult();
        return { data: null, error: null };
      },
    },
  },
}));

beforeEach(() => {
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
  vi.mocked(toast.warning).mockClear();
  const proto = Element.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => {};
  proto.setPointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
});

async function fillAndSubmit() {
  const onOpenChange = vi.fn();
  const onSubmitted = vi.fn();
  render(<OwlTingFillupDialog open={true} onOpenChange={onOpenChange} stagingId="staging-1" onSubmitted={onSubmitted} />);
  await waitFor(() => expect(screen.getByLabelText(/住客姓名/)).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText(/住客姓名/), { target: { value: "測試客" } });
  fireEvent.change(screen.getByLabelText(/電話/), { target: { value: "0912345678" } });
  fireEvent.click(screen.getAllByRole("combobox")[0]);
  fireEvent.click(await screen.findByRole("option", { name: /B1-四人房/ }));
  const btn = screen.getByRole("button", { name: /送出並建立訂單/ });
  await waitFor(() => expect(btn).not.toBeDisabled());
  fireEvent.click(btn);
  return { onOpenChange, onSubmitted };
}

describe("OwlTingFillupDialog — 未分配房號與明細寫入失敗", () => {
  it("unassigned_rooms 兩筆 → 顯示警告，列出房型名稱與原因", async () => {
    submitResult = () => ({
      data: {
        ok: true,
        order_number: "EWTEST01",
        unassigned_rooms: [
          { room_type_id: "room-1", requested_unit: "821", reason: "occupied" },
          { room_type_id: "room-1", requested_unit: null, reason: "no_free_unit" },
        ],
      },
      error: null,
    });
    const { onOpenChange, onSubmitted } = await fillAndSubmit();
    await waitFor(() => expect(toast.warning).toHaveBeenCalledTimes(1));
    expect(vi.mocked(toast.warning).mock.calls[0][0]).toBe(
      "訂單已建立，但以下 2 間未分配房號，請到訂單詳情手動安排：B1-四人房（原指定 821，已被佔用）、B1-四人房（無空房號）",
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(onSubmitted).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("unassigned_rooms 為空 → 維持原本的成功提示", async () => {
    submitResult = () => ({ data: { ok: true, order_number: "EWTEST02", unassigned_rooms: [] }, error: null });
    await fillAndSubmit();
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("訂單已建立：EWTEST02"));
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("ROOMS_WRITE_FAILED → 顯示後端 error、對話框不關閉、不呼叫 onSubmitted", async () => {
    const body = { ok: false, code: "ROOMS_WRITE_FAILED", case: "1a", error: "訂單 Y0001 已建立，但房間明細寫入失敗，請聯絡客服", order_number: "Y0001" };
    submitResult = () => ({
      data: null,
      error: { message: "Edge Function returned a non-2xx status code", context: new Response(JSON.stringify(body), { status: 500 }) },
    });
    const { onOpenChange, onSubmitted } = await fillAndSubmit();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(`送出失敗：${body.error}`));
    expect(onSubmitted).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole("button", { name: /送出並建立訂單/ })).toBeInTheDocument();
  });
});
