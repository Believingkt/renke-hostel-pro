import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, renderHook } from "@testing-library/react";
import {
  selectTemplatesForRoomType,
  resolveOrderPackage,
  finalPackageId,
  roomTemplateKey,
  type TemplateLite,
  type PackageLite,
} from "@/lib/orderPackageResolution";
import { OrderPackageField, TemplateFallbackWarning, useResetOnRoomTemplateChange } from "@/components/orders/OrderPackageField";

const RT_QUAD = "rt-quad";
const RT_B16 = "rt-b16";
const RT_B14 = "rt-b14";
const RT_LONELY = "rt-lonely";

const PKGS: PackageLite[] = [
  { id: "pkg-quad", name: "海景四人房", guest_count: 4, primary_room_type_id: RT_QUAD, room_type_ids: [RT_QUAD] },
  { id: "pkg-b16", name: "16人包棟", guest_count: 16, primary_room_type_id: RT_B16, room_type_ids: [RT_B16] },
  { id: "pkg-b14", name: "14人包棟", guest_count: 14, primary_room_type_id: null, room_type_ids: [RT_B14] },
];

const TPLS: TemplateLite[] = [
  { id: "tpl-quad", template_name: "海景四人房", room_type_ids: [RT_QUAD], default_package_id: "pkg-quad" },
  { id: "tpl-b16", template_name: "16人包棟", room_type_ids: [RT_B16], default_package_id: "pkg-b16" },
  { id: "tpl-b14", template_name: "14人包棟", room_type_id: RT_B14, default_package_id: "pkg-b14" },
  { id: "tpl-b14-free", template_name: "14人包棟（未綁方案）", room_type_ids: [RT_B14], default_package_id: null },
  { id: "tpl-summer", template_name: "暑假限定", room_type_ids: [RT_LONELY], valid_from: "2026-07-01", valid_until: "2026-08-31", default_package_id: null },
];

const resolve = (rooms: Array<[string, string]>, hasChannel: boolean) =>
  resolveOrderPackage({ rooms: rooms.map(([room_type_id, template_id]) => ({ room_type_id, template_id })), templates: TPLS, packages: PKGS, hasChannel });

describe("單房：對應方案由專案自動帶入", () => {
  it("非通路館：專案綁 16人包棟 → 自動帶入，不能另選", () => {
    const r = resolve([[RT_B16, "tpl-b16"]], false);
    expect(r.mode).toBe("auto");
    expect(r.packageName).toBe("16人包棟");
    expect(finalPackageId(r, "pkg-quad")).toBe("pkg-b16");
  });

  it("通路館：專案綁方案時同樣自動帶入，人員殘留的舊選擇被忽略（重現 LE9Q93G5 情境）", () => {
    const r = resolve([[RT_QUAD, "tpl-quad"]], true);
    expect(r.mode).toBe("auto");
    expect(finalPackageId(r, "pkg-b16")).toBe("pkg-quad");
  });
});

describe("專案未綁方案", () => {
  it("非通路館：package_id 留空（交給資料庫觸發器）", () => {
    const r = resolve([[RT_B14, "tpl-b14-free"]], false);
    expect(r.mode).toBe("none");
    expect(finalPackageId(r, "pkg-b14")).toBeNull();
  });

  it("通路館：只列涵蓋該房型的方案（含 room_type_ids 綁定）", () => {
    const r = resolve([[RT_B14, "tpl-b14-free"]], true);
    expect(r.mode).toBe("manual");
    expect(r.options.map((p) => p.id)).toEqual(["pkg-b14"]);
    expect(finalPackageId(r, "pkg-b14")).toBe("pkg-b14");
  });

  it("通路館：選了不涵蓋房型的方案不會被寫入", () => {
    const r = resolve([[RT_B14, "tpl-b14-free"]], true);
    expect(finalPackageId(r, "pkg-b16")).toBeNull();
  });

  it("通路館：沒有方案涵蓋此房型 → 選單只有留空", () => {
    const r = resolve([[RT_LONELY, "tpl-summer"]], true);
    expect(r.mode).toBe("manual");
    expect(r.options).toHaveLength(0);
  });
});

describe("多房", () => {
  it("各房方案相同 → 無衝突", () => {
    const r = resolve([[RT_B16, "tpl-b16"], [RT_B16, "tpl-b16"]], true);
    expect(r.conflict).toBe(false);
    expect(r.packageId).toBe("pkg-b16");
  });

  it("各房方案不同 → 衝突，訂單方案取第一間房（重現 DV2L39V2 情境）", () => {
    const r = resolve([[RT_B14, "tpl-b14"], [RT_QUAD, "tpl-quad"]], true);
    expect(r.conflict).toBe(true);
    expect(finalPackageId(r, "")).toBe("pkg-b14");
    expect(r.roomPackages.map((x) => x.packageName)).toEqual(["14人包棟", "海景四人房"]);
  });

  it("第一間專案未綁方案、第二間有綁 → 不借用第二間的方案（避免與訂單專案不一致）", () => {
    const r = resolve([[RT_B14, "tpl-b14-free"], [RT_B16, "tpl-b16"]], false);
    expect(r.mode).toBe("none");
    expect(r.conflict).toBe(false);
    expect(finalPackageId(r, "")).toBeNull();
  });
});

describe("專案清單退路（找不到對應專案時列全館專案）", () => {
  it("有綁房型的專案 → bound", () => {
    expect(selectTemplatesForRoomType(TPLS, RT_B16, []).source).toBe("bound");
  });

  it("入住日不在專案期間、也沒有通用專案 → fallback_all 並列出全館有效專案", () => {
    const res = selectTemplatesForRoomType(TPLS, RT_LONELY, ["2026-09-19"]);
    expect(res.source).toBe("fallback_all");
    expect(res.list.map((t) => t.id)).not.toContain("tpl-summer");
    expect(res.list.length).toBe(4);
  });

  it("有通用專案時優先通用專案，不算退路", () => {
    const withUniversal = [...TPLS, { id: "tpl-all", template_name: "通用", default_package_id: null }];
    expect(selectTemplatesForRoomType(withUniversal, RT_LONELY, ["2026-09-19"]).source).toBe("unbound");
  });
});

describe("換房型或換專案時清空人員所選方案", () => {
  it("初次載入不清空；組合改變才清空", () => {
    const onReset = vi.fn();
    const { rerender } = renderHook(({ k }) => {
      const { key, complete } = roomTemplateKey(k);
      useResetOnRoomTemplateChange(key, complete, onReset);
    }, { initialProps: { k: [{ room_type_id: RT_B14, template_id: "" }] } });
    rerender({ k: [{ room_type_id: RT_B14, template_id: "tpl-b14-free" }] });
    expect(onReset).not.toHaveBeenCalled();
    rerender({ k: [{ room_type_id: RT_B16, template_id: "tpl-b16" }] });
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});

describe("畫面元件", () => {
  const name = (id: string) => ({ [RT_QUAD]: "海景四人房", [RT_B16]: "16人包棟", [RT_B14]: "14人包棟" } as Record<string, string>)[id] || id;

  it("自動帶入時顯示唯讀「對應方案：XXX」，沒有下拉", () => {
    render(<OrderPackageField resolution={resolve([[RT_B16, "tpl-b16"]], true)} manualPick="" onManualPick={() => {}} isRequired channelLabel="奧丁丁" roomTypeName={name} />);
    expect(screen.getByTestId("order-package-auto").textContent).toContain("對應方案：16人包棟");
    expect(screen.queryByTestId("order-package-select")).toBeNull();
  });

  it("非通路館專案未綁方案：顯示留空說明，沒有下拉", () => {
    render(<OrderPackageField resolution={resolve([[RT_B14, "tpl-b14-free"]], false)} manualPick="" onManualPick={() => {}} isRequired={false} channelLabel="" roomTypeName={name} />);
    expect(screen.getByTestId("order-package-none")).toBeTruthy();
    expect(screen.queryByTestId("order-package-select")).toBeNull();
  });

  it("通路館專案未綁方案：顯示下拉", () => {
    render(<OrderPackageField resolution={resolve([[RT_B14, "tpl-b14-free"]], true)} manualPick="" onManualPick={() => {}} isRequired channelLabel="奧丁丁" roomTypeName={name} />);
    expect(screen.getByTestId("order-package-select")).toBeTruthy();
  });

  it("多房方案不同：顯示紅色提示與各房方案", () => {
    render(<OrderPackageField resolution={resolve([[RT_B14, "tpl-b14"], [RT_QUAD, "tpl-quad"]], true)} manualPick="" onManualPick={() => {}} isRequired channelLabel="奧丁丁" roomTypeName={name} />);
    const alert = screen.getByTestId("order-package-conflict-alert");
    expect(alert.textContent).toContain("第 1 間 14人包棟：14人包棟");
    expect(alert.textContent).toContain("第 2 間 海景四人房：海景四人房");
    expect(alert.textContent).toContain("奧丁丁");
  });

  it("落入退路：顯示紅色警告，勾選後才確認", () => {
    const Harness = () => {
      const [ok, setOk] = useState(false);
      return (
        <>
          <TemplateFallbackWarning roomTypeNames={["孤島房"]} confirmed={ok} onConfirmedChange={setOk} />
          <span data-testid="state">{ok ? "yes" : "no"}</span>
        </>
      );
    };
    render(<Harness />);
    expect(screen.getByTestId("template-fallback-warning").textContent).toContain("此房型在入住日沒有對應專案，請確認");
    expect(screen.getByTestId("state").textContent).toBe("no");
    fireEvent.click(screen.getByTestId("template-fallback-confirm-checkbox"));
    expect(screen.getByTestId("state").textContent).toBe("yes");
  });

  it("沒有落入退路：不顯示警告", () => {
    render(<TemplateFallbackWarning roomTypeNames={[]} confirmed={false} onConfirmedChange={() => {}} />);
    expect(screen.queryByTestId("template-fallback-warning")).toBeNull();
  });
});
