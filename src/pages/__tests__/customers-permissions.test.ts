import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const src = fs.readFileSync(path.resolve(__dirname, "../Customers.tsx"), "utf8");

describe("Customers 三態權限與假成功防護（原始碼契約）", () => {
  it("使用既有 useStaffPermissions helper，未自建權限系統", () => {
    expect(src).toContain('useStaffPermissions');
    expect(src).toContain('canEdit("customers")');
    expect(src).toContain("const canDeleteCustomers = isAdmin;");
  });

  it("新增/編輯按鈕受 canEditCustomers 控制", () => {
    expect(src).toContain("canEditCustomers ? (");
    expect(src).toContain("{canEditCustomers && (");
  });

  it("刪除按鈕僅 admin 可見", () => {
    expect(src).toContain("{canDeleteCustomers && (");
    expect(src).not.toMatch(/canEditCustomers && \([\s\S]{0,400}Trash2/);
  });

  it("write handler 具 code-level guard，不只隱藏按鈕", () => {
    const save = src.slice(src.indexOf("const handleSave"), src.indexOf("const handleDelete"));
    expect(save).toContain("if (!canEditCustomers)");
    const open = src.slice(src.indexOf("const handleOpenDialog"), src.indexOf("const handleSave"));
    expect(open).toContain("if (!canEditCustomers)");
    const del = src.slice(src.indexOf("const handleDelete"));
    expect(del).toContain("if (!canDeleteCustomers)");
  });

  it("INSERT / UPDATE / DELETE 全部經過 writeWithRowCheck，避免假成功", () => {
    expect(src).toContain("writeWithRowCheck");
    expect(src).not.toMatch(/if \(updateError\) throw updateError/);
    expect(src).not.toMatch(/if \(insertError\) throw insertError/);
    expect(src).not.toMatch(/if \(deleteError\) throw deleteError/);
    expect((src.match(/writeWithRowCheck\(/g) || []).length).toBe(3);
  });

  it("payload 欄位維持不變", () => {
    const payload = src.slice(src.indexOf("const customerData = {"), src.indexOf("if (editingCustomer)"));
    ["accommodation_id", "name", "phone", "email", "gender", "nationality", "first_order_date", "visit_count", "notes"]
      .forEach((f) => expect(payload).toContain(f));
  });
});
