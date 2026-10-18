import json, subprocess, sys

# 2a-2：P0 7 張表跨館修正。用法：python3 gen_m3.py <輸出 json>（從本機 kol3 讀現況並產生 4 個 SQL）
src = open("docs/onboarding-2/tools/gen_m1.py").read().replace("\nmain()\n", "\n")
g = {}
exec(compile(src, "gen_m1", "exec"), g)
alter, targets, SNAP, OTHER_CHECK, lit = g["alter"], g["targets"], g["SNAP"], g["OTHER_CHECK"], g["lit"]

TS = "20261018110005"
SUPER = "is_super_admin(auth.uid())"
OWN = "(is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id))"
HQ = "(is_super_admin(auth.uid()) OR user_has_team_role(auth.uid(), 'admin'::app_role))"
LBT = ("(is_super_admin(auth.uid()) OR user_has_team_role(auth.uid(), 'admin'::app_role) OR "
       "((user_has_team_role(auth.uid(), 'am'::app_role) OR user_has_team_role(auth.uid(), 'am_manager'::app_role)) AND "
       "(EXISTS (SELECT 1 FROM team_member_profiles tmp WHERE tmp.id = line_binding_tokens.team_member_id AND tmp.user_id = auth.uid()))))")

TARGETS = [
    ("kol_referrals", "Admins can delete kol referrals"),
    ("kol_referrals", "Admins can update kol referrals"),
    ("kol_referrals", "Internal staff can insert kol referrals"),
    ("kol_referrals", "Internal staff can view kol referrals"),
    ("line_binding_tokens", "admins manage line_binding_tokens"),
    ("line_sessions", "Admins can view line sessions"),
    ("order_attributions", "order_attributions_select_admin"),
    ("order_attributions", "order_attributions_update_admin"),
    ("owlting_fillup_tokens", "Admins manage fillup tokens"),
    ("referral_records", "Admins manage referral records"),
    ("trip_products", "Admins and owners can manage trip products"),
]


def new_expr(t, e):
    if e is None:
        return None
    if t in ("trip_products", "order_attributions"):
        return OWN
    if t in ("owlting_fillup_tokens", "line_sessions", "referral_records"):
        return SUPER
    if t == "kol_referrals":
        assert "is_admin_or_super()" in e, e
        return e.replace("is_admin_or_super()", HQ)
    if t == "line_binding_tokens":
        return LBT
    raise AssertionError(t)


def psql(sql):
    out = subprocess.run(["sudo", "-u", "postgres", "psql", "-d", "kol3", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"],
                         input=sql, capture_output=True, text=True, check=True).stdout
    return out


def read_policies():
    vals = ",".join(f"('{t}', $q${p}$q$)" for t, p in TARGETS)
    sql = (f"SELECT json_agg(json_build_object('t', p.tablename, 'p', p.policyname, 'cmd', p.cmd, 'q', p.qual, 'w', p.with_check) "
           f"ORDER BY p.tablename, p.policyname) FROM pg_policies p JOIN (VALUES {vals}) AS x(t, p) "
           f"ON p.schemaname = 'public' AND p.tablename = x.t AND p.policyname = x.p;")
    return sql


R = "replace({0}, E'\\r', '')"


def guard(rows, qk, wk, label):
    return f"""DO $$
DECLARE r record; v_n int;
BEGIN
  FOR r IN SELECT * FROM (VALUES
{g["values"](rows, qk, wk)}
  ) AS x(t, p, q, w) LOOP
    SELECT count(*) INTO v_n FROM pg_policies
    WHERE schemaname = 'public' AND tablename = r.t AND policyname = r.p
      AND {R.format('qual')} IS NOT DISTINCT FROM {R.format('r.q')} AND {R.format('with_check')} IS NOT DISTINCT FROM {R.format('r.w')};
    IF v_n <> 1 THEN
      RAISE EXCEPTION '{label}：%.% 的條件和預期不一致（或 policy 不存在），全部不修改', r.t, r.p;
    END IF;
  END LOOP;
END $$;"""


def check_select(rows, qk, wk, title):
    return "\n".join([title, "SELECT x.t, x.p, (p.policyname IS NOT NULL) AS matches FROM (VALUES",
                      g["values"](rows, qk, wk),
                      ") AS x(t, p, q, w)\nLEFT JOIN pg_policies p ON p.schemaname = 'public' AND p.tablename = x.t AND p.policyname = x.p\n"
                      f"  AND {R.format('p.qual')} IS NOT DISTINCT FROM {R.format('x.q')} AND {R.format('p.with_check')} IS NOT DISTINCT FROM {R.format('x.w')}\nORDER BY 3, 1, 2;"])


def main():
    rows = json.loads(psql(read_policies()))
    assert len(rows) == len(TARGETS), rows
    for r in rows:
        r["dq"], r["dw"] = new_expr(r["t"], r["q"]), new_expr(r["t"], r["w"])
    # 讓 PostgreSQL 把新條件轉成正式文字（交易內套用後讀回，再 ROLLBACK）
    draft = "BEGIN;\n" + "\n".join(alter(r, r["dq"], r["dw"]) for r in rows) + "\n" + read_policies() + "\nROLLBACK;\n"
    norm = {(n["t"], n["p"]): n for n in json.loads(psql(draft).strip().splitlines()[-1])}
    for r in rows:
        n = norm[(r["t"], r["p"])]
        r["nq"], r["nw"] = n["q"], n["w"]
    json.dump(rows, open(sys.argv[1], "w"), ensure_ascii=False, indent=1)

    tables = sorted({r["t"] for r in rows})
    head = ("-- ============================================================\n"
            "-- 2a-2：P0 7 張表跨館修正（只改 policy 條件，不修改任何函式）\n"
            "--   trip_products、order_attributions：is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id)\n"
            "--   owlting_fillup_tokens、line_sessions、referral_records（管理 policy）：只限 is_super_admin(auth.uid())\n"
            "--   kol_referrals：is_admin_or_super() 換成 (is_super_admin OR user_has_team_role(admin))，is_sales_role 保留\n"
            "--   line_binding_tokens：super_admin、全域 admin；am／am_manager 只能處理自己的成員資料（TeamLineOA 成員頁）\n"
            "--   公開讀取、會員本人、本館成員讀取等其他 policy 不動\n"
            f"--   範圍：{len(rows)} 條 policy，{len(tables)} 張表：{', '.join(tables)}\n"
            "-- ============================================================\n")
    mig = [head, "BEGIN;", "-- PRECHECK：每條 policy 的條件必須和預期文字完全一致（比對前去掉 \\r）",
           guard(rows, "q", "w", "PRECHECK 失敗"), targets(rows), SNAP, ""]
    mig += [alter(r, r["nq"], r["nw"]) for r in rows]
    mig += ["", "-- POSTCHECK：修改後條件完全符合預期、不含 is_admin_or_super()；其他 policy 的 md5 完全未變",
            guard(rows, "nq", "nw", "POSTCHECK 失敗"),
            """DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies p JOIN _m1_targets t ON t.t = p.tablename AND t.p = p.policyname
             WHERE p.schemaname = 'public' AND (coalesce(p.qual, '') || coalesce(p.with_check, '')) ~ 'is_admin_or_super\\(\\)') THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：仍有跨館條件';
  END IF;
END $$;""", OTHER_CHECK, "COMMIT;", ""]
    open(f"supabase/migrations/{TS}_p0_tenant_isolation_2a2.sql", "w").write("\n".join(mig))
    open(f"docs/onboarding-2/precheck_{TS}.sql", "w").write(
        check_select(rows, "q", "w", "-- precheck（唯讀；比對前先去掉 \\r，Windows 貼上也適用）：2a-2。每列都要 matches = true") + "\n")
    post = check_select(rows, "nq", "nw", "-- postcheck（唯讀；比對前先去掉 \\r，Windows 貼上也適用）：2a-2。每列都要 matches = true；第 2 段要 0 列")
    post += ("\nSELECT tablename, policyname FROM pg_policies p WHERE schemaname = 'public' AND (tablename, policyname) IN (VALUES "
             + ", ".join(f"('{t}', $q${p}$q$)" for t, p in TARGETS)
             + ")\n  AND (coalesce(qual, '') || coalesce(with_check, '')) ~ 'is_admin_or_super\\(\\)';\n")
    open(f"docs/onboarding-2/postcheck_{TS}.sql", "w").write(post)
    rb = ["-- rollback：2a-2，還原成原本的條件（會恢復跨館漏洞，只在緊急時使用）", "BEGIN;",
          guard(rows, "nq", "nw", "ROLLBACK PRECHECK 失敗"), ""]
    rb += [alter(r, r["q"], r["w"]) for r in rows]
    rb += ["", guard(rows, "q", "w", "ROLLBACK 驗證失敗"), "COMMIT;", ""]
    open(f"docs/onboarding-2/rollback_{TS}.sql", "w").write("\n".join(rb))


main()
