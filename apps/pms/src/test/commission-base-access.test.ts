import { describe, it, expect } from "vitest";
import {
  canEditCommissionBase,
  resolveTeamRoleFlags,
} from "@/lib/commissionBaseAccess";

const CLOSER_A = "aaaaaaaa-0000-0000-0000-000000000001";
const CLOSER_B = "bbbbbbbb-0000-0000-0000-000000000002";
const ACC = "cccccccc-0000-0000-0000-000000000003";

const flagsFor = (rows: Array<{ role: string; accommodation_id: string | null }>) =>
  resolveTeamRoleFlags(rows);

describe("commission base access — 與 DB trigger 契約對齊", () => {
  it("團隊角色只認 accommodation_id IS NULL（與 user_has_team_role 一致）", () => {
    expect(flagsFor([{ role: "closer", accommodation_id: ACC }]).isCloserRole).toBe(false);
    expect(flagsFor([{ role: "closer", accommodation_id: null }]).isCloserRole).toBe(true);
  });

  it("super_admin 不分館皆成立", () => {
    const f = flagsFor([{ role: "super_admin", accommodation_id: ACC }]);
    expect(f.isSuperAdmin).toBe(true);
    expect(f.isFinancialAdmin).toBe(true);
    expect(f.canForceCommission).toBe(true);
  });

  it("hotel_admin / staff 不具分潤金額權限", () => {
    const f = flagsFor([
      { role: "hotel_admin", accommodation_id: ACC },
      { role: "staff", accommodation_id: ACC },
    ]);
    expect(f.isFinancialAdmin).toBe(false);
    expect(f.isCloserRole).toBe(false);
    expect(
      canEditCommissionBase({
        ...f,
        currentUserId: CLOSER_A,
        existingCloserId: CLOSER_A,
        nextCloserId: CLOSER_A,
      }),
    ).toBe(false);
  });

  it("1. closer 自己負責的訂單 → editable", () => {
    expect(
      canEditCommissionBase({
        isFinancialAdmin: false,
        isCloserRole: true,
        currentUserId: CLOSER_A,
        existingCloserId: CLOSER_A,
        nextCloserId: CLOSER_A,
      }),
    ).toBe(true);
  });

  it("2. closer 他人訂單 → denied", () => {
    expect(
      canEditCommissionBase({
        isFinancialAdmin: false,
        isCloserRole: true,
        currentUserId: CLOSER_A,
        existingCloserId: CLOSER_B,
        nextCloserId: CLOSER_B,
      }),
    ).toBe(false);
  });

  it("2b. closer 不得把他人訂單改指派給自己來取得編輯權", () => {
    expect(
      canEditCommissionBase({
        isFinancialAdmin: false,
        isCloserRole: true,
        currentUserId: CLOSER_A,
        existingCloserId: CLOSER_B,
        nextCloserId: CLOSER_A,
      }),
    ).toBe(false);
  });

  it("7. 尚無 order_meta（首次建立）且成交人為自己 → editable", () => {
    expect(
      canEditCommissionBase({
        isFinancialAdmin: false,
        isCloserRole: true,
        currentUserId: CLOSER_A,
        existingCloserId: null,
        nextCloserId: CLOSER_A,
      }),
    ).toBe(true);
  });

  it("首次建立但成交人不是自己 → denied", () => {
    expect(
      canEditCommissionBase({
        isFinancialAdmin: false,
        isCloserRole: true,
        currentUserId: CLOSER_A,
        existingCloserId: null,
        nextCloserId: CLOSER_B,
      }),
    ).toBe(false);
  });

  it("3/4. closer_manager 自己負責 editable、他人訂單 denied", () => {
    const f = flagsFor([{ role: "closer_manager", accommodation_id: null }]);
    expect(
      canEditCommissionBase({
        isFinancialAdmin: f.isFinancialAdmin,
        isCloserRole: f.isCloserRole,
        currentUserId: CLOSER_A,
        existingCloserId: CLOSER_A,
        nextCloserId: CLOSER_A,
      }),
    ).toBe(true);
    expect(
      canEditCommissionBase({
        isFinancialAdmin: f.isFinancialAdmin,
        isCloserRole: f.isCloserRole,
        currentUserId: CLOSER_A,
        existingCloserId: CLOSER_B,
        nextCloserId: CLOSER_B,
      }),
    ).toBe(false);
  });

  it("5/6. force 權限差異保留：closer_manager ALLOW、closer DENY", () => {
    expect(flagsFor([{ role: "closer_manager", accommodation_id: null }]).canForceCommission).toBe(
      true,
    );
    expect(flagsFor([{ role: "closer", accommodation_id: null }]).canForceCommission).toBe(false);
  });

  it("9. admin / finance / super_admin 既有全域權限不受 self-scoped 影響", () => {
    for (const role of ["admin", "finance", "super_admin"]) {
      const f = flagsFor([{ role, accommodation_id: null }]);
      expect(f.isFinancialAdmin).toBe(true);
      expect(
        canEditCommissionBase({
          isFinancialAdmin: f.isFinancialAdmin,
          isCloserRole: f.isCloserRole,
          currentUserId: CLOSER_A,
          existingCloserId: CLOSER_B,
          nextCloserId: CLOSER_B,
        }),
      ).toBe(true);
    }
  });

  it("未登入 → denied", () => {
    expect(
      canEditCommissionBase({
        isFinancialAdmin: false,
        isCloserRole: true,
        currentUserId: null,
        existingCloserId: null,
        nextCloserId: null,
      }),
    ).toBe(false);
  });
});
