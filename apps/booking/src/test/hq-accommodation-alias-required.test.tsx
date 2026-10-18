import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...a: unknown[]) => toastError(...a), success: vi.fn(), info: vi.fn() } }));

const chain: any = {};
["select", "eq", "neq", "ilike", "order", "limit", "in"].forEach((k) => (chain[k] = () => chain));
chain.maybeSingle = async () => ({ data: null, error: null });
chain.single = async () => ({ data: null, error: null });
(globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
chain.then = (r: any) => Promise.resolve({ data: [], error: null }).then(r);
vi.mock("@lakeze/shared/integrations/supabase/client", () => ({
  supabase: {
    from: () => chain,
    functions: { invoke: async () => ({ data: null, error: null }) },
    storage: { from: () => ({ upload: vi.fn(), getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
  },
}));

import { AccommodationDialog } from "@/components/headquarters/AccommodationDialog";

describe("總部新增民宿：PMS 代號（網址路徑）必填", () => {
  beforeEach(() => toastError.mockClear());

  it("新館沒填網址路徑時不送出，並提示必填", async () => {
    const onSubmit = vi.fn(async () => {});
    const { container } = render(
      <AccommodationDialog open onOpenChange={() => {}} onSubmit={onSubmit} initialData={{ name: "測試館" } as any} />,
    );
    expect(screen.getByTestId("alias-required-mark")).toBeTruthy();
    fireEvent.submit(container.ownerDocument.querySelector("form")!);
    await Promise.resolve();
    expect(toastError).toHaveBeenCalledWith("請填寫網址路徑（PMS 代號）", expect.anything());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("編輯既有館時不顯示必填星號", () => {
    render(
      <AccommodationDialog open isEditing onOpenChange={() => {}} onSubmit={vi.fn(async () => {})} initialData={{ id: "x", name: "舊館" } as any} />,
    );
    expect(screen.queryByTestId("alias-required-mark")).toBeNull();
  });
});
