import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SRC = fs.readFileSync(
  path.resolve(__dirname, "TeamBonusDistributionTab.tsx"),
  "utf-8",
);

// Mirrors handleSaveEditNote() affected-row contract
function evaluateSave(res: { data: { id: string }[] | null; error: { message: string } | null }) {
  if (res.error) return "error";
  if (!res.data || res.data.length === 0) return "error";
  return "success";
}

describe("bonus note save affected-row verification", () => {
  it("UPDATE error -> no success toast", () => {
    expect(evaluateSave({ data: null, error: { message: "rls" } })).toBe("error");
  });

  it("UPDATE returned [] -> no success toast", () => {
    expect(evaluateSave({ data: [], error: null })).toBe("error");
  });

  it("UPDATE returned [{id}] -> success toast", () => {
    expect(evaluateSave({ data: [{ id: "x" }], error: null })).toBe("success");
  });

  it("handler selects ids and guards zero rows", () => {
    const handler = SRC.slice(
      SRC.indexOf("async function handleSaveEditNote"),
      SRC.indexOf("// ============ Card 2"),
    );
    expect(handler).toContain('.select("id")');
    expect(handler).toContain("data.length === 0");
    expect(handler.indexOf("data.length === 0")).toBeLessThan(
      handler.indexOf('toast.success("備註已更新")'),
    );
  });
});
