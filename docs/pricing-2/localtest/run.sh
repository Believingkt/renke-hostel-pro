#!/usr/bin/env bash
# 價格頁整合第 1 批本機完整循環＋回歸
# 前置：docs/onboarding-4/localtest/rebuild_hq3.sh 建好 hq3；本腳本以 hq3 ＋ 所有 >= 20261018120000 且 < 20261026090000 的 migration 建 pbase
# 用法：bash docs/pricing-2/localtest/run.sh
set -uo pipefail
REPO=/app; D=$REPO/docs/pricing-2; L=$D/localtest; MIG=$REPO/supabase/migrations
NEW=$MIG/20261026090000_pricing_v2_batch1.sql
P() { sudo -u postgres psql -X -q "$@"; }
mk() { P -d postgres -c "DROP DATABASE IF EXISTS $1" -c "CREATE DATABASE $1 TEMPLATE $2" 2>&1 | grep -v NOTICE; }
fp() { P -d "$1" -At -c "SELECT count(*) || ' ' || COALESCE(md5(string_agg(id::text||':'||COALESCE(sale_price::text,'')||':'||COALESCE(original_price::text,'')||':'||COALESCE(is_available::text,''), ',' ORDER BY id)), '-') FROM public.package_date_prices"; }

echo "== 建 pbase（hq3 ＋ 20261018120000～20261025090000）"
mk pbase hq3
for f in "$MIG"/*.sql; do b=$(basename "$f"); [[ "$b" < "20261018120000" || ! "$b" < "20261026090000" ]] && continue
  P -d pbase -v ON_ERROR_STOP=1 -f "$f" > /dev/null 2>&1 && echo "  ok $b" || echo "  套用失敗 $b"; done

echo "== 1. 套用前 precheck"
mk pt1 pbase; P -d pt1 -v ON_ERROR_STOP=1 -f "$L/seed_pre.sql" > /dev/null
P -d pt1 -At -F' | ' -f "$D/precheck_20261026090000.sql"
FP0=$(fp pt1)
echo "== 2. 套用 migration"
P -d pt1 -v ON_ERROR_STOP=1 -f "$NEW" > /dev/null && echo "套用成功"
echo "== 3. 套用後 postcheck"
P -d pt1 -At -F' | ' -f "$D/postcheck_20261026090000.sql"
FP1=$(fp pt1); echo "方案單日價指紋 套用前=$FP0 套用後=$FP1 相同=$([ "$FP0" = "$FP1" ] && echo t || echo f)"
echo "== 4. 重複套用必須被 precheck 擋下"
OUT=$(P -d pt1 -v ON_ERROR_STOP=1 -f "$NEW" 2>&1); echo "$OUT" | grep -m1 -o "PRECHECK 失敗.*" || echo "（未被擋下）"
echo "== 5. 功能測試（交易內，最後 ROLLBACK）"
P -d pt1 -At -F' | ' -f "$L/tests.sql" 2>&1 | grep -vE "^(BEGIN|ROLLBACK|CREATE FUNCTION|CREATE TABLE|SET)$" > "$L/output_tests.txt"
grep -E "FAIL|^PASS" "$L/output_tests.txt"
echo "== 6. rollback"
P -d pt1 -v ON_ERROR_STOP=1 -f "$D/rollback_20261026090000.sql" > /dev/null && echo "rollback 成功"
P -d pt1 -At -c "SELECT 'rollback 後新物件全部移除', to_regclass('public.package_seasons') IS NULL AND to_regclass('public.pricing_template_groups') IS NULL
  AND to_regprocedure('public.save_package_season(uuid, uuid, text, date, date, jsonb)') IS NULL AND to_regprocedure('public.pdp_mark_manual()') IS NULL
  AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'package_date_prices' AND column_name IN ('source','season_id','applied_tier'))
  AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND (tgname LIKE 'trg_pricing_v2%' OR tgname IN ('trg_pdp_mark_manual','trg_single_inventory_channel','trg_dctg_change') OR tgname LIKE 'trg_ptg_members%'))"
P -d pt1 -At -F' | ' -f "$D/precheck_20261026090000.sql" | grep -v "| t$" || echo "rollback 後 precheck 全部 t"
FP2=$(fp pt1); echo "rollback 後方案單日價指紋與套用前相同=$([ "$FP0" = "$FP2" ] && echo t || echo f)"
echo "== 7. 再套用＋postcheck＋功能測試"
P -d pt1 -v ON_ERROR_STOP=1 -f "$NEW" > /dev/null && echo "再套用成功"
P -d pt1 -At -F' | ' -f "$D/postcheck_20261026090000.sql" | grep -v "| t$" | grep -v "^[0-9]* |" || echo "再套用後 postcheck 全部 t"
P -d pt1 -At -F' | ' -f "$L/tests.sql" 2>&1 | grep -E "^PASS"

echo "== 8. 回歸（R0＝pbase、R1＝pbase＋本批；同一批測試）"
RG=$L/regression; mkdir -p "$RG"
SEED=$REPO/docs/onboarding-3/localtest/seed_venues.sql
WZ=$REPO/docs/onboarding-4/localtest/regression/wizard_tests_variant_2d_rules.sql
run() { P -d "$1" -At -F' | ' -f "$2" 2>&1 | grep -vE "^(BEGIN|ROLLBACK|SET|RESET|CREATE FUNCTION|GRANT|CREATE TABLE)$|^psql:.*NOTICE"; }
norm() { sed -E 's/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{0,12}/<uuid>/g; s/[0-9]{4}-[0-9]{2}-[0-9]{2}([ T][0-9:.+]+)?/<date>/g' "$1"; }
for v in 0 1; do
  # 精靈測試比照 2d regression.sh：hq3 先種子、再依序套用 >= 20261018120000 的 migration（M3 回填需要種子先存在）
  mk rgw$v hq3; P -d rgw$v -v ON_ERROR_STOP=1 -f "$SEED" > /dev/null
  for f in "$MIG"/*.sql; do b=$(basename "$f"); [[ "$b" < "20261018120000" || ! "$b" < "20261026090000" ]] && continue
    P -d rgw$v -v ON_ERROR_STOP=1 -f "$f" > /dev/null 2>&1 || echo "  rgw$v 套用失敗 $b"; done
  mk rgm$v pbase
  if [ $v = 1 ]; then P -d rgw$v -v ON_ERROR_STOP=1 -f "$NEW" > /dev/null; P -d rgm$v -v ON_ERROR_STOP=1 -f "$NEW" > /dev/null; fi
  run rgw$v "$WZ" > "$RG/R${v}_wizard_2d.txt"
  for m in m1 m2 m3; do run rgm$v "$REPO/docs/onboarding-2/localtest/${m}_tests.sql" > "$RG/R${v}_$m.txt"; done
done
for f in wizard_2d m1 m2 m3; do
  same=$(diff <(norm "$RG/R0_$f.txt") <(norm "$RG/R1_$f.txt") > /dev/null && echo 逐題相同 || echo 有差異)
  echo "$f：R0=$(tail -1 "$RG/R0_$f.txt")  R1=$(tail -1 "$RG/R1_$f.txt")  $same"
done
for db in pt1 rgw0 rgw1 rgm0 rgm1; do P -d postgres -c "DROP DATABASE IF EXISTS $db" > /dev/null 2>&1; done
