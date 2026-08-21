import { describe, expect, it } from "vitest";
import {
  isKnownPublishDomain,
  isPmsOrderNumber,
  normalizeCode,
  normalizeIgHandle,
  normalizeKolName,
  kolNameKey,
  validateInvite,
  type CodeConflict,
  type CompanionProfile,
  type InviteFormSnapshot,
} from "../kolInviteValidation";

const ACC_A = "11111111-1111-1111-1111-111111111111";
const ACC_B = "22222222-2222-2222-2222-222222222222";

const base = (over: Partial<InviteFormSnapshot> = {}): InviteFormSnapshot => ({
  name: "小美",
  ig_handle: "meimei",
  scout_id: "scout-1",
  accommodation_id: ACC_A,
  venue_id: "",
  venue_parent_accommodation_id: null,
  venue_label: "",
  accommodation_label: "森山",
  invited_at: "2026-08-01",
  check_in_date: "2026-08-10",
  check_out_date: "2026-08-11",
  order_number: "",
  order_exists: null,
  order_discount_code: null,
  order_bound_to_other_profile: null,
  cid_code: "",
  companion_cid: "",
  publish_url: "",
  publish_date: "",
  follower_count_original: null,
  follower_count_next: 1000,
  ig_duplicate_confirmed: false,
  ig_duplicate_name: null,
  collab_confirmed: false,
  ...over,
});

const run = (
  f: Partial<InviteFormSnapshot>,
  opts: { companion?: CompanionProfile; conflicts?: CodeConflict[]; isManager?: boolean } = {},
) =>
  validateInvite(base(f), {
    companion: opts.companion ?? null,
    conflicts: opts.conflicts ?? [],
    isManager: opts.isManager ?? false,
  });

const conflict = (over: Partial<CodeConflict>): CodeConflict => ({
  source: "kol_profiles",
  severity: "block",
  code: "SELFE",
  accommodation_id: ACC_A,
  accommodation_name: "森山",
  owner_name: "阿傑",
  detail: {},
  ...over,
});

const rules = (r: ReturnType<typeof validateInvite>) => r.issues.map((i) => i.rule);

describe("normalizers", () => {
  it("normalizes IG handles from URLs, @ prefix and query strings", () => {
    expect(normalizeIgHandle("https://www.instagram.com/meimei/?igsh=abc")).toBe("meimei");
    expect(normalizeIgHandle("@MeiMei ")).toBe("MeiMei");
    expect(normalizeIgHandle("instagram.com/meimei")).toBe("meimei");
    expect(normalizeIgHandle("")).toBe("");
  });

  it("normalizes discount codes to trimmed uppercase", () => {
    expect(normalizeCode(" selfe ")).toBe("SELFE");
    expect(normalizeCode("")).toBe("");
  });

  it("recognizes PMS order number format only", () => {
    expect(isPmsOrderNumber("K7M4XQ9B")).toBe(true);
    expect(isPmsOrderNumber("k7m4xq9b")).toBe(true);
    expect(isPmsOrderNumber("K7M4XQ9")).toBe(false); // 7 碼
    expect(isPmsOrderNumber("K7M4XQ0B")).toBe(false); // 含 0
    expect(isPmsOrderNumber("HT-20260810-001")).toBe(false); // 匯入單
  });

  it("detects known publish domains", () => {
    expect(isKnownPublishDomain("https://www.instagram.com/p/xxx/")).toBe(true);
    expect(isKnownPublishDomain("https://vt.tiktok.com/abc")).toBe(true);
    expect(isKnownPublishDomain("https://example.com/post")).toBe(false);
    expect(isKnownPublishDomain("not-a-url")).toBe(false);
  });
});

describe("館別一致性", () => {
  it("blocks when venue parent accommodation differs from accommodation_id", () => {
    const r = run({
      venue_id: "venue-1",
      venue_parent_accommodation_id: ACC_B,
      venue_label: "雲岫 B 區",
      accommodation_label: "森山",
    });
    expect(rules(r)).toContain("venue.parent_mismatch");
    const issue = r.issues.find((i) => i.rule === "venue.parent_mismatch")!;
    expect(issue.level).toBe("block");
    expect(issue.field).toBe("venue");
    expect(issue.actual).toContain("雲岫 B 區");
    expect(issue.suggestion).toBeTruthy();
  });

  it("passes when venue parent matches", () => {
    const r = run({ venue_id: "venue-1", venue_parent_accommodation_id: ACC_A });
    expect(rules(r)).not.toContain("venue.parent_mismatch");
  });

  it("ignores check when venue has no parent accommodation", () => {
    const r = run({ venue_id: "venue-1", venue_parent_accommodation_id: null });
    expect(r.blocks).toHaveLength(0);
  });
});

describe("訂單編號", () => {
  it("warns (not blocks) on non-PMS format so imported orders still save", () => {
    const r = run({ order_number: "HT-20260810-001", order_exists: true });
    expect(rules(r)).toContain("order.not_pms_format");
    expect(r.blocks).toHaveLength(0);
  });

  it("accepts valid PMS format without warning", () => {
    const r = run({ order_number: "K7M4XQ9B", order_exists: true });
    expect(rules(r)).not.toContain("order.not_pms_format");
  });

  it("warns when the order does not exist", () => {
    const r = run({ order_number: "K7M4XQ9B", order_exists: false });
    expect(rules(r)).toContain("order.not_found");
  });

  it("blocks when the order is already bound to another invite", () => {
    const r = run({ order_number: "K7M4XQ9B", order_exists: true, order_bound_to_other_profile: "阿傑" });
    const issue = r.issues.find((i) => i.rule === "order.already_bound")!;
    expect(issue.level).toBe("block");
    expect(issue.field).toBe("order_number");
  });
});

describe("CID 與訂單／折扣碼一致性", () => {
  it("warns when order discount code differs from CID", () => {
    const r = run({
      order_number: "K7M4XQ9B",
      order_exists: true,
      order_discount_code: "abcxyz",
      cid_code: "SELFE",
    });
    const issue = r.issues.find((i) => i.rule === "order.cid_mismatch")!;
    expect(issue.level).toBe("warning");
    expect(issue.expected).toContain("ABCXYZ");
  });

  it("is case-insensitive when comparing CID with order code", () => {
    const r = run({
      order_number: "K7M4XQ9B",
      order_exists: true,
      order_discount_code: " selfe ",
      cid_code: "SelfE",
    });
    expect(rules(r)).not.toContain("order.cid_mismatch");
  });
});

describe("折扣碼衝突回傳邏輯", () => {
  it("blocks scout-owned codes (namespace conflict)", () => {
    const r = run(
      { cid_code: "SELFE" },
      { conflicts: [conflict({ source: "scout_discount_codes", owner_name: "星探小王" })] },
    );
    expect(rules(r)).toContain("cid.scout_namespace");
    expect(r.blocks).toHaveLength(1);
  });

  it("blocks a CID used by a different KOL until a real primary link exists", () => {
    const c = [
      conflict({ owner_name: "阿傑", detail: { check_in_date: "2026-08-10", profile_id: "p-other" } }),
    ];
    const blocked = run({ cid_code: "SELFE" }, { conflicts: c });
    expect(rules(blocked)).toContain("cid.used_by_other");

    // 只勾「確認合拍」不算數，必須真的建立主檔關係
    const onlyCheckbox = run({ cid_code: "SELFE", collab_confirmed: true }, { conflicts: c });
    expect(rules(onlyCheckbox)).toContain("cid.used_by_other");

    const linked = run({ cid_code: "SELFE", primary_profile_id: "p-other" }, { conflicts: c });
    expect(rules(linked)).toContain("cid.collab_confirmed");
    expect(linked.blocks).toHaveLength(0);

    // 對方掛在本筆底下也算已建立關係
    const child = run(
      { cid_code: "SELFE", self_id: "p-self" },
      {
        conflicts: [
          conflict({ owner_name: "阿傑", detail: { profile_id: "p-other", primary_profile_id: "p-self" } }),
        ],
      },
    );
    expect(rules(child)).toContain("cid.collab_confirmed");
    expect(child.blocks).toHaveLength(0);
  });


  it("treats a mutual companion pair as a warning without confirmation", () => {
    const r = run(
      { cid_code: "MEIMEI", companion_cid: "SELFE" },
      { conflicts: [conflict({ code: "SELFE", owner_name: "阿傑" })] },
    );
    expect(rules(r)).toContain("cid.collab_confirmed");
    expect(r.blocks).toHaveLength(0);
  });

  it("blocks duplicated profile for the same person in the same accommodation", () => {
    const r = run(
      { cid_code: "SELFE", name: "阿傑" },
      { conflicts: [conflict({ owner_name: "阿傑", accommodation_id: ACC_A })] },
    );
    expect(rules(r)).toContain("cid.duplicate_same_person");
  });

  it("only warns when a PMS discount code belongs to another accommodation", () => {
    const r = run(
      { cid_code: "SELFE" },
      { conflicts: [conflict({ source: "discount_codes", accommodation_id: ACC_B, accommodation_name: "雲岫" })] },
    );
    expect(rules(r)).toContain("cid.other_accommodation");
    expect(r.blocks).toHaveLength(0);
  });

  it("stays silent for a PMS code already bound to the same accommodation", () => {
    const r = run(
      { cid_code: "SELFE" },
      { conflicts: [conflict({ source: "discount_codes", accommodation_id: ACC_A })] },
    );
    expect(r.blocks).toHaveLength(0);
    expect(r.warnings).toHaveLength(0);
  });

  it("同一位 KOL 跨館（皆為民宿、非旅行日系列）只給資訊提示，不擋也不警告", () => {
    const r = run(
      { cid_code: "SUMMER168", name: "莊巧綾", accommodation_label: "森山" },
      {
        conflicts: [
          conflict({
            owner_name: "莊巧綾",
            accommodation_id: ACC_B,
            accommodation_name: "雲岫海景渡假會館",
            venue_type: "民宿",
          }),
        ],
      },
    );
    const issue = r.issues.find((i) => i.rule === "cid.same_person_other_accommodation")!;
    expect(issue.level).toBe("info");
    expect(r.blocks).toHaveLength(0);
    expect(r.warnings).toHaveLength(0);
  });

  it("同一位 KOL 跨館但皆為旅行日系列時，視為同一份合約（警告建議歸戶）", () => {
    const r = run(
      { cid_code: "SUMMER168", name: "莊巧綾", accommodation_label: "旅行日-光" },
      {
        conflicts: [
          conflict({
            owner_name: "莊巧綾",
            accommodation_id: ACC_B,
            accommodation_name: "旅行日-艾屋吉屋",
            venue_type: "民宿",
          }),
        ],
      },
    );
    expect(rules(r)).toContain("cid.same_person_same_contract");
    expect(r.blocks).toHaveLength(0);
  });

  it("對方場域類別非民宿（餐廳／農場／其他）時視為同一份合約", () => {
    const r = run(
      { cid_code: "SUMMER168", name: "莊巧綾", accommodation_label: "森山" },
      {
        conflicts: [
          conflict({ owner_name: "莊巧綾", accommodation_id: ACC_B, accommodation_name: "某某餐廳", venue_type: "餐廳" }),
        ],
      },
    );
    expect(rules(r)).toContain("cid.same_person_same_contract");
    expect(r.blocks).toHaveLength(0);
  });
});


describe("同住夥伴", () => {
  const companion = (over: Partial<NonNullable<CompanionProfile>> = {}): CompanionProfile => ({
    id: "p1",
    name: "阿傑",
    cid_code: "SELFE",
    companion_cid: null,
    accommodation_id: ACC_A,
    venue_id: null,
    check_in_date: "2026-08-10",
    ...over,
  });

  it("blocks self reference", () => {
    const r = run({ cid_code: "SELFE", companion_cid: "selfe" });
    expect(rules(r)).toContain("companion.self_reference");
  });

  it("blocks chained companions", () => {
    const r = run({ cid_code: "MEIMEI", companion_cid: "SELFE" }, { companion: companion({ companion_cid: "XYZ" }) });
    expect(rules(r)).toContain("companion.chain");
  });

  it("blocks different accommodation or different check-in date", () => {
    const diffAcc = run(
      { cid_code: "MEIMEI", companion_cid: "SELFE" },
      { companion: companion({ accommodation_id: ACC_B }) },
    );
    expect(rules(diffAcc)).toContain("companion.different_accommodation");

    const diffDate = run(
      { cid_code: "MEIMEI", companion_cid: "SELFE" },
      { companion: companion({ check_in_date: "2026-08-20" }) },
    );
    expect(rules(diffDate)).toContain("companion.different_checkin");
  });

  it("同一支折扣碼視為同一份合約：跨館與 30 天內只警告不擋", () => {
    const r = run(
      { cid_code: "SELFE", companion_cid: "SELFE2" },
      { companion: companion({ cid_code: "SELFE", accommodation_id: ACC_B, check_in_date: "2026-08-25" }) },
    );
    expect(rules(r)).toContain("companion.cross_accommodation_same_contract");
    expect(rules(r)).toContain("companion.adjacent_checkin");
    expect(r.blocks).toHaveLength(0);
  });


  it("passes for a valid companion", () => {
    const r = run({ cid_code: "MEIMEI", companion_cid: "SELFE" }, { companion: companion() });
    expect(r.blocks).toHaveLength(0);
  });
});

describe("其他規則", () => {
  it("blocks checkout on or before check-in", () => {
    const r = run({ check_in_date: "2026-08-10", check_out_date: "2026-08-10" });
    const issue = r.issues.find((i) => i.rule === "dates.checkout_after_checkin")!;
    expect(issue.suggestion).toContain("2026-08-11");
  });

  it("requires scout for non-managers but only warns for managers", () => {
    expect(rules(run({ scout_id: "" }))).toContain("scout.required");
    expect(rules(run({ scout_id: "" }, { isManager: true }))).toContain("scout.missing_manager");
  });

  it("blocks duplicate IG until confirmed", () => {
    expect(rules(run({ ig_duplicate_name: "阿傑" }))).toContain("ig.duplicate");
    expect(run({ ig_duplicate_name: "阿傑", ig_duplicate_confirmed: true }).blocks).toHaveLength(0);
  });

  it("returns no issues for a clean submission", () => {
    const r = run({ order_number: "K7M4XQ9B", order_exists: true, cid_code: "MEIMEI" });
    expect(r.issues).toHaveLength(0);
  });

  it("keeps blocks/warnings strings in sync with issues", () => {
    const r = run({ scout_id: "", order_number: "IMPORT-1", order_exists: false });
    expect(r.blocks).toEqual(r.issues.filter((i) => i.level === "block").map((i) => i.message));
    expect(r.warnings).toEqual(r.issues.filter((i) => i.level === "warning").map((i) => i.message));
  });
});

describe("normalizeKolName / kolNameKey", () => {
  it("全形英文轉半形並首字大寫", () => {
    expect(normalizeKolName("歐妮Ｏni")).toBe("歐妮Oni");
    expect(normalizeKolName("KIMBO")).toBe("Kimbo");
    expect(normalizeKolName("VIna")).toBe("Vina");
    expect(normalizeKolName("Ｍie")).toBe("Mie");
  });
  it("移除中英文之間的空白，保留英文單字間空白", () => {
    expect(normalizeKolName("Annie 與美食")).toBe("Annie與美食");
    expect(normalizeKolName("小比 簡君如")).toBe("小比簡君如");
    expect(normalizeKolName("john  doe")).toBe("John Doe");
  });
  it("比對鍵忽略大小寫與空白", () => {
    expect(kolNameKey("Annie 與美食")).toBe(kolNameKey("annie與美食"));
    expect(kolNameKey("  ")).toBe("");
  });
});

describe("名稱寫法防呆", () => {
  const nameForm = () => base({ name: "歐妮Ｏni" });
  it("既有同名不同寫法時阻擋，並建議套用既有寫法", () => {
    const r = validateInvite(
      { ...nameForm(), name_variant_existing: "歐妮Oni", name_variant_confirmed: false },
      { companion: null, conflicts: [], isManager: true },
    );
    const issue = r.issues.find((i) => i.rule === "name.variant_existing");
    expect(issue?.level).toBe("block");
    expect(issue?.suggestion).toContain("歐妮Oni");
  });
  it("勾選確認為不同人後不再阻擋", () => {
    const r = validateInvite(
      { ...nameForm(), name_variant_existing: "歐妮Oni", name_variant_confirmed: true },
      { companion: null, conflicts: [], isManager: true },
    );
    expect(r.issues.some((i) => i.rule === "name.variant_existing")).toBe(false);
  });
  it("無既有紀錄但寫法需正規化時只給警告", () => {
    const r = validateInvite(nameForm(), { companion: null, conflicts: [], isManager: true });
    const issue = r.issues.find((i) => i.rule === "name.normalized");
    expect(issue?.level).toBe("warning");
    expect(issue?.expected).toBe("歐妮Oni");
  });
});
