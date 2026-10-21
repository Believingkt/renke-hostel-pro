import { describe, expect, it } from "vitest";
import { groupBySources, mergeFixedGroups } from "@lakeze/shared/lib/teamBonusRevenue";

// 舊規則（改版前 create-team-bonus-snapshots／TeamHome）：館名「旅行日」開頭
const NAMES: Record<string, string> = { a: "雲岫", b: "旅行日 台北", c: "森之館", d: "旅行日 台中", e: "旅行日 花蓮" };
const oldExcluded = (ids: string[]) => ids.filter((id) => !NAMES[id].startsWith("旅行日"));
const oldMerge = (ids: string[]) => {
  const travel = ids.filter((id) => NAMES[id].startsWith("旅行日"));
  return [...ids.filter((id) => !NAMES[id].startsWith("旅行日")), ...(travel.length ? [travel[0]] : [])];
};
// migration 帶入後的設定：旅行日各館 exclude＝true、群組＝旅行日系列
const groupOf = new Map(Object.keys(NAMES).filter((id) => NAMES[id].startsWith("旅行日")).map((id) => [id, "旅行日系列"]));
const excluded = new Set(groupOf.keys());

describe("旅行日改設定：帶入後結果與舊規則完全相同", () => {
  const cases = [["a", "b", "c", "d", "e"], ["b", "d"], ["a", "c"], ["e", "a", "b"], []];
  it.each(cases)("抽成類排除與固定額合併 %#", (...ids) => {
    expect(ids.filter((id) => !excluded.has(id))).toEqual(oldExcluded(ids));
    expect(mergeFixedGroups(ids, groupOf)).toEqual(oldMerge(ids));
  });

  it("多個群組各自只算一館", () => {
    const g = new Map([["b", "旅行日系列"], ["d", "旅行日系列"], ["a", "雲系列"], ["c", "雲系列"]]);
    expect(mergeFixedGroups(["a", "b", "c", "d", "e"], g)).toEqual(["e", "a", "b"]);
  });
});

describe("單館訂單來源覆蓋分組", () => {
  it("沒有覆蓋：全部一組、沿用全站清單", () => {
    const g = groupBySources(["a", "b"], ["website", "owner_provided"], new Map());
    expect([...g.values()]).toEqual([{ ids: ["a", "b"], sources: ["owner_provided", "website"] }]);
  });
  it("有覆蓋的館改用自己的清單；覆蓋成空清單＝該館不計", () => {
    const g = groupBySources(["a", "b", "c"], ["website", "owner_provided"], new Map([["b", ["website"]], ["c", []]]));
    expect([...g.values()]).toEqual([
      { ids: ["a"], sources: ["owner_provided", "website"] },
      { ids: ["b"], sources: ["website"] },
      { ids: ["c"], sources: [] },
    ]);
  });
});
