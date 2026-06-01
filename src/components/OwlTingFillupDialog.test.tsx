import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { OwlTingFillupDialog } from "./OwlTingFillupDialog";

// ── Mocks ────────────────────────────────────────────────────────────────────
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

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
};

const roomTypes = [
  { id: "room-1", name: "雙人房 A", base_price: 3800 },
  { id: "room-2", name: "四人房 B", base_price: 5800 },
];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: stagingRow, error: null }),
        }),
        order: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
    functions: {
      invoke: async (name: string) => {
        if (name === "owlting-fillup-issue") {
          return { data: { ok: true, token: "tok_abc1234567890123" }, error: null };
        }
        if (name === "owlting-fillup-validate") {
          return {
            data: { ok: true, room_types: roomTypes, accommodation: { name: "森山寫照" } },
            error: null,
          };
        }
        if (name === "owlting-fillup-submit") {
          return { data: { ok: true, order_number: "EWTEST01" }, error: null };
        }
        return { data: null, error: null };
      },
    },
  },
}));

// Radix Select uses pointer APIs that jsdom lacks; provide noop polyfills.
beforeEach(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => {};
  proto.setPointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
});

// ── Helpers ──────────────────────────────────────────────────────────────────
async function renderAndReachForm() {
  const onOpenChange = vi.fn();
  render(
    <OwlTingFillupDialog open={true} onOpenChange={onOpenChange} stagingId="staging-1" />,
  );
  // Wait until form phase (住客姓名 input appears)
  await waitFor(() => {
    expect(screen.getByLabelText(/住客姓名/)).toBeInTheDocument();
  });
}

function getSubmitButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: /送出並建立訂單/ }) as HTMLButtonElement;
}

function setAmount(value: string) {
  const input = screen.getByLabelText(/訂單金額/) as HTMLInputElement;
  fireEvent.change(input, { target: { value } });
}

function setGuestCount(value: string) {
  const input = screen.getByLabelText(/住客人數/) as HTMLInputElement;
  fireEvent.change(input, { target: { value } });
}

function fillRequiredText() {
  fireEvent.change(screen.getByLabelText(/住客姓名/), { target: { value: "測試客" } });
  fireEvent.change(screen.getByLabelText(/電話/), { target: { value: "0912345678" } });
}

// Radix Select is hard to drive in jsdom; we directly invoke the onValueChange
// by clicking the trigger and pressing the option. To keep tests robust we
// instead inject the selection through native dispatchEvent on the underlying
// hidden form input that Radix maintains. Simpler: manipulate via the listbox.
async function pickRoomType() {
  const trigger = screen.getByRole("combobox");
  fireEvent.click(trigger);
  // Wait for options to render
  const option = await screen.findByRole("option", { name: /雙人房 A/ });
  fireEvent.click(option);
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe("OwlTingFillupDialog — 金額警示與送出狀態", () => {
  it("預填 3800 → 不顯示警示，且其他必填齊全時送出按鈕可用", async () => {
    await renderAndReachForm();
    fillRequiredText();
    await pickRoomType();
    // 預填 total_amount=3800（來自 staging）
    expect(screen.queryByText(/金額看起來不太對/)).not.toBeInTheDocument();
    await waitFor(() => expect(getSubmitButton()).not.toBeDisabled());
  });

  it("金額 = 1（<100）顯示警示，按鈕仍可用（警示為提醒非阻擋）", async () => {
    await renderAndReachForm();
    fillRequiredText();
    await pickRoomType();
    setAmount("1");
    expect(await screen.findByText(/金額看起來不太對/)).toBeInTheDocument();
    expect(getSubmitButton()).not.toBeDisabled();
  });

  it("金額 = 100（下邊界）不顯示警示", async () => {
    await renderAndReachForm();
    fillRequiredText();
    await pickRoomType();
    setAmount("100");
    expect(screen.queryByText(/金額看起來不太對/)).not.toBeInTheDocument();
    expect(getSubmitButton()).not.toBeDisabled();
  });

  it("金額 = 100000（上邊界）不顯示警示", async () => {
    await renderAndReachForm();
    fillRequiredText();
    await pickRoomType();
    setAmount("100000");
    expect(screen.queryByText(/金額看起來不太對/)).not.toBeInTheDocument();
    expect(getSubmitButton()).not.toBeDisabled();
  });

  it("金額 = 100001（>100000）顯示警示", async () => {
    await renderAndReachForm();
    fillRequiredText();
    await pickRoomType();
    setAmount("100001");
    expect(await screen.findByText(/金額看起來不太對/)).toBeInTheDocument();
  });
});

describe("OwlTingFillupDialog — 住客人數驗證與送出狀態", () => {
  it("人數 = 0（<1）顯示錯誤訊息且送出按鈕禁用", async () => {
    await renderAndReachForm();
    fillRequiredText();
    await pickRoomType();
    setGuestCount("0");
    expect(await screen.findByText(/人數需為 1-50 之間的整數/)).toBeInTheDocument();
    expect(getSubmitButton()).toBeDisabled();
  });

  it("人數 = 1（下邊界）有效，送出按鈕可用", async () => {
    await renderAndReachForm();
    fillRequiredText();
    await pickRoomType();
    setGuestCount("1");
    expect(screen.queryByText(/人數需為 1-50 之間的整數/)).not.toBeInTheDocument();
    await waitFor(() => expect(getSubmitButton()).not.toBeDisabled());
  });

  it("人數 = 50（上邊界）有效，送出按鈕可用", async () => {
    await renderAndReachForm();
    fillRequiredText();
    await pickRoomType();
    setGuestCount("50");
    expect(screen.queryByText(/人數需為 1-50 之間的整數/)).not.toBeInTheDocument();
    await waitFor(() => expect(getSubmitButton()).not.toBeDisabled());
  });

  it("人數 = 51（>50）顯示錯誤訊息且送出按鈕禁用", async () => {
    await renderAndReachForm();
    fillRequiredText();
    await pickRoomType();
    setGuestCount("51");
    expect(await screen.findByText(/人數需為 1-50 之間的整數/)).toBeInTheDocument();
    expect(getSubmitButton()).toBeDisabled();
  });

  it("人數 空字串 → 送出按鈕禁用", async () => {
    await renderAndReachForm();
    fillRequiredText();
    await pickRoomType();
    setGuestCount("");
    expect(getSubmitButton()).toBeDisabled();
  });
});

describe("OwlTingFillupDialog — 必填欄位整合", () => {
  it("未選房型 → 送出按鈕禁用，選後即可用", async () => {
    await renderAndReachForm();
    fillRequiredText();
    // 尚未選房型
    expect(getSubmitButton()).toBeDisabled();
    await pickRoomType();
    await waitFor(() => expect(getSubmitButton()).not.toBeDisabled());
  });

  it("姓名或電話空白 → 送出按鈕禁用", async () => {
    await renderAndReachForm();
    await pickRoomType();
    // 不填姓名電話
    expect(getSubmitButton()).toBeDisabled();
  });
});
