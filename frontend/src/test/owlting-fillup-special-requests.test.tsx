import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { OwlTingFillupDialog } from "@/components/OwlTingFillupDialog";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const selectCalls: string[] = [];
const mutationCalls: string[] = [];

let extractedFields: Record<string, unknown> | null = { special_requests: "需要嬰兒床\n晚到" };

const stagingRow = () => ({
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
  channel_source: "Agoda",
  extracted_fields: extractedFields,
  auto_order_id: null,
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: (cols: string) => {
        selectCalls.push(cols);
        return {
          eq: () => ({
            maybeSingle: async () => ({ data: stagingRow(), error: null }),
            gt: () => ({ order: async () => ({ data: [], error: null }) }),
          }),
          order: () => Promise.resolve({ data: [], error: null }),
        };
      },
      insert: () => { mutationCalls.push("insert"); return { select: () => ({}) }; },
      update: () => { mutationCalls.push("update"); return { eq: () => ({}) }; },
      delete: () => { mutationCalls.push("delete"); return { eq: () => ({}) }; },
      upsert: () => { mutationCalls.push("upsert"); return { select: () => ({}) }; },
    }),
    functions: {
      invoke: async (name: string) => {
        if (name === "owlting-fillup-issue") return { data: { ok: true, token: "tok_abc1234567890123" }, error: null };
        if (name === "owlting-fillup-validate") {
          return { data: { ok: true, room_types: [{ id: "room-1", name: "雙人房 A", base_price: 3800 }], accommodation: { name: "森山寫照" } }, error: null };
        }
        return { data: null, error: null };
      },
    },
  },
}));

beforeEach(() => {
  selectCalls.length = 0;
  mutationCalls.length = 0;
  const proto = Element.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => {};
  proto.setPointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
});

async function renderDialog() {
  render(<OwlTingFillupDialog open onOpenChange={vi.fn()} stagingId="staging-1" />);
  await waitFor(() => expect(screen.getByLabelText(/住客姓名/)).toBeInTheDocument());
}

describe("OwlTingFillupDialog — special_requests 來源", () => {
  it("staging select 不含不存在的 bare column special_requests，改取 extracted_fields", async () => {
    extractedFields = { special_requests: "需要嬰兒床" };
    await renderDialog();
    const stagingSelect = selectCalls.find((c) => c.includes("obe_number"));
    expect(stagingSelect).toBeTruthy();
    expect(stagingSelect).not.toMatch(/(^|,\s*)special_requests(\s*,|$)/);
    expect(stagingSelect).toContain("extracted_fields");
  });

  it("正確顯示 extracted_fields.special_requests 內容", async () => {
    extractedFields = { special_requests: "需要嬰兒床" };
    await renderDialog();
    await waitFor(() => expect(screen.getByText(/需要嬰兒床/)).toBeInTheDocument());
  });

  it("key 不存在時仍正常載入且不 crash", async () => {
    extractedFields = { other: 1 };
    await renderDialog();
    expect(screen.getByLabelText(/住客姓名/)).toBeInTheDocument();
  });

  it("extracted_fields 為 null／空字串時不 crash", async () => {
    extractedFields = null;
    await renderDialog();
    expect(screen.getByLabelText(/住客姓名/)).toBeInTheDocument();
    extractedFields = { special_requests: "" };
  });

  it("開啟 Dialog 期間沒有任何 DB mutation", async () => {
    extractedFields = { special_requests: "需要嬰兒床" };
    await renderDialog();
    expect(mutationCalls).toEqual([]);
  });
});
