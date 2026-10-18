import json, sys

ALIAS_OLD = ("(EXISTS ( SELECT 1\n   FROM user_roles\n  WHERE ((user_roles.user_id = auth.uid()) AND "
             "(user_roles.role = ANY (ARRAY['super_admin'::app_role, 'hotel_admin'::app_role])))))")
ALIAS_NEW = "(is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id))"


def new_expr(e):
    if e is None:
        return None
    if e == ALIAS_OLD:
        return ALIAS_NEW
    assert "is_admin_or_super()" in e, e
    return e.replace("is_admin_or_super()", "is_super_admin(auth.uid())")


def lit(s):
    return "NULL" if s is None else "$q$" + s + "$q$"


def alter(p, q, w):
    sql = f'ALTER POLICY "{p["p"]}" ON public.{p["t"]}'
    if q is not None:
        sql += f"\n  USING ({q})"
    if w is not None:
        sql += f"\n  WITH CHECK ({w})"
    return sql + ";"


def values(rows, qk, wk):
    return ",\n".join(f"    ('{r['t']}', $q${r['p']}$q$, {lit(r[qk])}, {lit(r[wk])})" for r in rows)


def guard(rows, qk, wk, label):
    return f"""DO $$
DECLARE r record; v_n int;
BEGIN
  FOR r IN SELECT * FROM (VALUES
{values(rows, qk, wk)}
  ) AS x(t, p, q, w) LOOP
    SELECT count(*) INTO v_n FROM pg_policies
    WHERE schemaname = 'public' AND tablename = r.t AND policyname = r.p
      AND qual IS NOT DISTINCT FROM r.q AND with_check IS NOT DISTINCT FROM r.w;
    IF v_n <> 1 THEN
      RAISE EXCEPTION '{label}：%.% 的條件和預期不一致（或 policy 不存在），全部不修改', r.t, r.p;
    END IF;
  END LOOP;
END $$;"""


SNAP = """CREATE TEMP TABLE _m1_other_policies ON COMMIT DROP AS
SELECT tablename, policyname, md5(cmd || '|' || array_to_string(roles, ',') || '|' || permissive || '|' || coalesce(qual, '<null>') || '|' || coalesce(with_check, '<null>')) AS h
FROM pg_policies
WHERE schemaname = 'public' AND (tablename, policyname) NOT IN (SELECT t, p FROM _m1_targets);"""

OTHER_CHECK = """DO $$
DECLARE v_bad int;
BEGIN
  SELECT count(*) INTO v_bad FROM (
    (SELECT * FROM _m1_other_policies EXCEPT
     SELECT tablename, policyname, md5(cmd || '|' || array_to_string(roles, ',') || '|' || permissive || '|' || coalesce(qual, '<null>') || '|' || coalesce(with_check, '<null>'))
     FROM pg_policies WHERE schemaname = 'public' AND (tablename, policyname) NOT IN (SELECT t, p FROM _m1_targets))
    UNION ALL
    (SELECT tablename, policyname, md5(cmd || '|' || array_to_string(roles, ',') || '|' || permissive || '|' || coalesce(qual, '<null>') || '|' || coalesce(with_check, '<null>'))
     FROM pg_policies WHERE schemaname = 'public' AND (tablename, policyname) NOT IN (SELECT t, p FROM _m1_targets)
     EXCEPT SELECT * FROM _m1_other_policies)
  ) d;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：有 % 條不在修正範圍內的 policy 被改到', v_bad;
  END IF;
END $$;"""


def targets(rows):
    return ("CREATE TEMP TABLE _m1_targets ON COMMIT DROP AS SELECT * FROM (VALUES\n"
            + ",\n".join(f"  ('{r['t']}', $q${r['p']}$q$)" for r in rows) + "\n) AS x(t, p);")


def main():
    rows = json.load(open(sys.argv[1]))
    for r in rows:
        r["nq"], r["nw"] = new_expr(r["q"]), new_expr(r["w"])
    tables = sorted({r["t"] for r in rows})
    head = ("-- ============================================================\n"
            "-- 2a M1：PMS 營運表跨館修正（hotel_admin 只能存取自己館）\n"
            "--   is_admin_or_super() 不看館別，任何館的 hotel_admin 都能讀寫所有館。\n"
            "--   只把條件中的 is_admin_or_super() 換成 is_super_admin(auth.uid())，其餘條件、policy 名稱、cmd、roles 不變；\n"
            "--   owlting_email_property_alias／owlting_email_room_alias 的「任一列 super_admin/hotel_admin」改為\n"
            "--   is_super_admin(auth.uid()) OR is_hotel_admin_of(accommodation_id)。不修改 is_admin_or_super() 函式。\n"
            f"--   範圍：{len(rows)} 條 policy，{len(tables)} 張表：{', '.join(tables)}\n"
            "-- ============================================================\n")
    mig = [head, "BEGIN;", "-- PRECHECK：每條 policy 的條件必須和預期文字完全一致",
           guard(rows, "q", "w", "PRECHECK 失敗"), targets(rows), SNAP, ""]
    mig += [alter(r, r["nq"], r["nw"]) for r in rows]
    mig += ["", "-- POSTCHECK：修改後條件完全符合預期、不含跨館條件；其他 policy 的 md5 完全未變",
            guard(rows, "nq", "nw", "POSTCHECK 失敗"),
            f"""DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies p JOIN _m1_targets t ON t.t = p.tablename AND t.p = p.policyname
             WHERE p.schemaname = 'public'
               AND (coalesce(p.qual, '') || coalesce(p.with_check, '')) ~ '(is_admin_or_super\\(\\)|role = ANY \\(ARRAY\\[''super_admin'')') THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：仍有跨館條件';
  END IF;
END $$;""", OTHER_CHECK, "COMMIT;", ""]
    open(sys.argv[2], "w").write("\n".join(mig))

    pre = ["-- precheck（唯讀）：2a M1。每列都要 matches = true", "SELECT x.t, x.p, (p.policyname IS NOT NULL) AS matches FROM (VALUES",
           values(rows, "q", "w"),
           ") AS x(t, p, q, w)\nLEFT JOIN pg_policies p ON p.schemaname = 'public' AND p.tablename = x.t AND p.policyname = x.p\n"
           "  AND p.qual IS NOT DISTINCT FROM x.q AND p.with_check IS NOT DISTINCT FROM x.w\nORDER BY 3, 1, 2;", ""]
    open(sys.argv[3], "w").write("\n".join(pre))
    post = ["-- postcheck（唯讀）：2a M1。每列都要 matches = true；第 2 段要 0 列", "SELECT x.t, x.p, (p.policyname IS NOT NULL) AS matches FROM (VALUES",
            values(rows, "nq", "nw"),
            ") AS x(t, p, q, w)\nLEFT JOIN pg_policies p ON p.schemaname = 'public' AND p.tablename = x.t AND p.policyname = x.p\n"
            "  AND p.qual IS NOT DISTINCT FROM x.q AND p.with_check IS NOT DISTINCT FROM x.w\nORDER BY 3, 1, 2;",
            "SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' AND tablename IN ("
            + ", ".join(f"'{t}'" for t in tables) + ")\n  AND (coalesce(qual, '') || coalesce(with_check, '')) ~ '(is_admin_or_super\\(\\)|role = ANY \\(ARRAY\\[''super_admin'')';", ""]
    open(sys.argv[4], "w").write("\n".join(post))
    rb = ["-- rollback：2a M1，還原成原本的條件（會恢復跨館漏洞，只在緊急時使用）", "BEGIN;",
          guard(rows, "nq", "nw", "ROLLBACK PRECHECK 失敗"), ""]
    rb += [alter(r, r["q"], r["w"]) for r in rows]
    rb += ["", guard(rows, "q", "w", "ROLLBACK 驗證失敗"), "COMMIT;", ""]
    open(sys.argv[5], "w").write("\n".join(rb))


main()
