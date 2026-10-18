import json, sys, importlib.util

spec = importlib.util.spec_from_file_location("g", "docs/onboarding-2/tools/gen_m1.py")
src = open("docs/onboarding-2/tools/gen_m1.py").read().replace("\nmain()\n", "\n")
g = {}
exec(compile(src, "gen_m1", "exec"), g)

HQ = "(is_super_admin(auth.uid()) OR user_has_team_role(auth.uid(), 'admin'::app_role))"
SUPER = "is_super_admin(auth.uid())"


def new_expr(r, e):
    if e is None:
        return None
    if r["t"] == "accommodation_partnership_periods":
        if r["p"] == "partnership_periods_write_admin":
            return SUPER
        assert e.startswith("(is_admin_or_super() OR"), e
        return e.replace("is_admin_or_super()", SUPER, 1)
    return HQ


rows = json.load(open(sys.argv[1]))
for r in rows:
    r["nq"], r["nw"] = new_expr(r, r["q"]), new_expr(r, r["w"])

g["new_expr"] = lambda e: e
tables = sorted({r["t"] for r in rows})
head = ("-- ============================================================\n"
        "-- 2a 第三部分（待核准，尚未套用）：全平台旅客／再行銷／合作期間 跨館修正\n"
        "--   traveler_profiles、remarketing_campaigns、remarketing_sends 沒有館別欄位 → 只限總部：\n"
        "--     is_super_admin(auth.uid()) OR user_has_team_role(auth.uid(), 'admin')（全域 admin，accommodation_id IS NULL）\n"
        "--   accommodation_partnership_periods：寫入只限 super_admin；讀取把 is_admin_or_super() 換成 is_super_admin()，\n"
        "--     保留 finance/am/am_manager 與「本館 hotel_admin/owner」條件\n"
        "--   policy 名稱、cmd、roles 不變；不修改 is_admin_or_super() 函式\n"
        "-- ============================================================\n")
mig = [head, "BEGIN;", g["guard"](rows, "q", "w", "PRECHECK 失敗"), g["targets"](rows), g["SNAP"], ""]
mig += [g["alter"](r, r["nq"], r["nw"]) for r in rows]
mig += ["", g["guard"](rows, "nq", "nw", "POSTCHECK 失敗"),
        """DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies p JOIN _m1_targets t ON t.t = p.tablename AND t.p = p.policyname
             WHERE p.schemaname = 'public' AND (coalesce(p.qual, '') || coalesce(p.with_check, '')) ~ 'is_admin_or_super\\(\\)') THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：仍有跨館條件';
  END IF;
END $$;""", g["OTHER_CHECK"], "COMMIT;", ""]
open(sys.argv[2], "w").write("\n".join(mig))
rb = ["-- rollback：2a 第三部分，還原原條件", "BEGIN;", g["guard"](rows, "nq", "nw", "ROLLBACK PRECHECK 失敗"), ""]
rb += [g["alter"](r, r["q"], r["w"]) for r in rows]
rb += ["", g["guard"](rows, "q", "w", "ROLLBACK 驗證失敗"), "COMMIT;", ""]
open(sys.argv[3], "w").write("\n".join(rb))
pre = ["-- precheck（唯讀）：每列 matches = true", "SELECT x.t, x.p, (p.policyname IS NOT NULL) AS matches FROM (VALUES",
       g["values"](rows, "q", "w"),
       ") AS x(t, p, q, w)\nLEFT JOIN pg_policies p ON p.schemaname = 'public' AND p.tablename = x.t AND p.policyname = x.p\n"
       "  AND p.qual IS NOT DISTINCT FROM x.q AND p.with_check IS NOT DISTINCT FROM x.w ORDER BY 3, 1, 2;", ""]
open(sys.argv[4], "w").write("\n".join(pre))
post = ["-- postcheck（唯讀）：每列 matches = true", "SELECT x.t, x.p, (p.policyname IS NOT NULL) AS matches FROM (VALUES",
        g["values"](rows, "nq", "nw"),
        ") AS x(t, p, q, w)\nLEFT JOIN pg_policies p ON p.schemaname = 'public' AND p.tablename = x.t AND p.policyname = x.p\n"
        "  AND p.qual IS NOT DISTINCT FROM x.q AND p.with_check IS NOT DISTINCT FROM x.w ORDER BY 3, 1, 2;", ""]
open(sys.argv[5], "w").write("\n".join(post))
