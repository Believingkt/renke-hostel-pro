#!/usr/bin/env bash
# 補件 2：舊寫法操作在 R0（未套用本批）與 R1（已套用）結果完全相同
# 補件 3：模擬 sync-taiwan-holidays（每館 1 次刪除＋1 次 upsert，各自一個交易）20 館 × 一年份假日的耗時
# 前置：run.sh 建好的 pbase
set -uo pipefail
REPO=/app; L=$REPO/docs/pricing-2/localtest; NEW=$REPO/supabase/migrations/20261026090000_pricing_v2_batch1.sql
P() { sudo -u postgres psql -X -q "$@"; }
mk() { P -d postgres -c "DROP DATABASE IF EXISTS $1" -c "CREATE DATABASE $1 TEMPLATE pbase" 2>&1 | grep -v NOTICE; }

echo "== 補件 2：舊寫法操作前後指紋（R0＝未套用本批、R1＝已套用）"
for v in 0 1; do
  mk inv$v; P -d inv$v -v ON_ERROR_STOP=1 -f "$L/seed_pre.sql" > /dev/null
  [ $v = 1 ] && P -d inv$v -v ON_ERROR_STOP=1 -f "$NEW" > /dev/null
  P -d inv$v -At -F' | ' -f "$L/fingerprint.sql" > "$L/inv_R${v}_before.txt"
  P -d inv$v -v ON_ERROR_STOP=1 -At -f "$L/invariance_ops.sql" > /dev/null || echo "R$v 操作失敗"
  P -d inv$v -At -F' | ' -f "$L/fingerprint.sql" > "$L/inv_R${v}_after.txt"
done
echo "-- R1 操作後指紋："; cat "$L/inv_R1_after.txt"
echo "操作前 R0＝R1：$(diff -q "$L/inv_R0_before.txt" "$L/inv_R1_before.txt" > /dev/null && echo t || echo f)"
echo "操作後 R0＝R1：$(diff -q "$L/inv_R0_after.txt" "$L/inv_R1_after.txt" > /dev/null && echo t || echo f)"
diff "$L/inv_R0_after.txt" "$L/inv_R1_after.txt"
P -d inv1 -At -c "SELECT 'R1 新表全部 0 筆、方案單日價全部 manual：' || ((SELECT count(*) FROM package_seasons) + (SELECT count(*) FROM accommodation_day_tier_overrides)
  + (SELECT count(*) FROM pricing_template_groups) + (SELECT count(*) FROM discount_code_template_groups) + (SELECT count(*) FROM discount_code_group_synced_templates) = 0
  AND NOT EXISTS (SELECT 1 FROM package_date_prices WHERE source <> 'manual'))"

echo "== 補件 3：20 館 × 一年份假日批次寫入"
PERF=$(mktemp)
cat > "$PERF" <<'SQL'
SET session_replication_role = replica;
INSERT INTO auth.users (id, email) SELECT ('99000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, 'perf' || n || '@t' FROM generate_series(1, 20) n;
INSERT INTO accommodation_info (id, name, is_active, short_url_alias)
SELECT ('9a000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, '效能館' || n, true, 'perf-' || n FROM generate_series(1, 20) n;
INSERT INTO accommodation_packages (id, accommodation_id, name, sale_price, original_price, included_guest_count, tier_prices, enabled)
SELECT ('9b000000-0000-0000-' || lpad(n::text, 4, '0') || '-' || lpad(k::text, 12, '0'))::uuid, ('9a000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
       '方案' || k, 10000, 12000, 4,
       '{"weekday":{"sale":10000,"original":12000},"friday_sunday":{"sale":11000,"original":13000},"weekend":{"sale":14000,"original":16000}}', true
FROM generate_series(1, 20) n, generate_series(1, 8) k;
SET session_replication_role = origin;
SQL
chmod 644 "$PERF"
for v in 0 1; do
  mk perf$v; P -d perf$v -v ON_ERROR_STOP=1 -f "$PERF" > /dev/null
  if [ $v = 1 ]; then
    P -d perf$v -v ON_ERROR_STOP=1 -f "$NEW" > /dev/null
    # 最壞情況：每館 8 個方案都有涵蓋整年的季節區段＋每週六整欄日型例外，並先展開
    P -d perf$v -v ON_ERROR_STOP=1 -q <<'SQL' > /dev/null
INSERT INTO package_seasons (accommodation_id, package_id, name, date_from, date_to, tier_prices)
SELECT p.accommodation_id, p.id, '全年', CURRENT_DATE, CURRENT_DATE + 364,
       '{"weekday":{"sale":20000,"original":24000},"friday_sunday":{"sale":21000,"original":25000},"weekend":{"sale":22000,"original":26000}}'
FROM accommodation_packages p WHERE p.accommodation_id::text LIKE '9a000000%';
INSERT INTO accommodation_day_tier_overrides (accommodation_id, date, tier)
SELECT a.id, d::date, 'weekend' FROM accommodation_info a, generate_series(CURRENT_DATE, CURRENT_DATE + 364, interval '1 day') d
WHERE a.id::text LIKE '9a000000%' AND extract(dow FROM d) = 6;
SELECT count(*) FROM (SELECT public.pricing_v2_rebuild_pdp(a.id, NULL, CURRENT_DATE, CURRENT_DATE + 364, true) FROM accommodation_info a WHERE a.id::text LIKE '9a000000%') x;
SQL
    echo "R1 展開後方案單日價：$(P -d perf$v -At -c "SELECT count(*) FROM package_date_prices")（20 館 × 8 方案 × 365 天）"
  fi
  for rows in 365 30; do
    for round in 1 2; do
      OUT=$(mktemp); : > "$OUT"
      for n in $(seq 1 20); do
        acc="9a000000-0000-0000-0000-$(printf %012d $n)"
        # 與 sync-taiwan-holidays 相同的兩個語句：刪除不在來源的非自訂假日、再 upsert（每個語句各自一個交易）
        P -d perf$v -At -c "\\timing on" \
          -c "DELETE FROM public_holidays WHERE accommodation_id = '$acc' AND is_custom = false AND holiday_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 364 AND holiday_date NOT IN (SELECT CURRENT_DATE + g * (365 / $rows) FROM generate_series(0, $rows - 1) g)" \
          -c "INSERT INTO public_holidays (accommodation_id, holiday_date, holiday_name, holiday_type, is_custom) SELECT '$acc', CURRENT_DATE + g * (365 / $rows), '效能假日' || g || '-$round', 'holiday', false FROM generate_series(0, $rows - 1) g ON CONFLICT (accommodation_id, holiday_date) DO UPDATE SET holiday_name = EXCLUDED.holiday_name, holiday_type = EXCLUDED.holiday_type, is_custom = EXCLUDED.is_custom" \
 2>> "$L/output_supplement_errors.txt" \
          | grep -oE "Time: [0-9.]+" | awk '{print $2}' >> "$OUT"
      done
      label=$([ $round = 1 ] && echo "第一次匯入" || echo "重跑同一年（全部 upsert 更新）")
      echo "R$v 每館 $rows 天、$label：40 個語句總計 $(awk '{s+=$1} END {printf "%.0f", s}' "$OUT") ms，單一語句最長 $(sort -n "$OUT" | tail -1) ms"
      rm -f "$OUT"
    done
    P -d perf$v -q -c "DELETE FROM public_holidays WHERE accommodation_id::text LIKE '9a000000%'" > /dev/null
  done
done
[ -n "$(P -d perf1 -At -c "SELECT 1 FROM package_date_prices WHERE source = 'manual' AND accommodation_id::text LIKE '9a000000%' LIMIT 1")" ] && echo "R1 有展開列被誤標 manual" || echo "R1 展開列沒有被誤標 manual"
rm -f "$PERF"
for db in inv0 inv1 perf0 perf1; do P -d postgres -c "DROP DATABASE IF EXISTS $db" > /dev/null 2>&1; done
