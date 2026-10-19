#!/usr/bin/env bash
# 2d 回歸：A＝前一批狀態（hq3＋120000～120002）、B＝加上之後所有 migration（含 2d）；兩邊跑同一批測試再比對
# 用法：sudo -u postgres bash docs/onboarding-4/localtest/regression.sh   （先跑 rebuild_hq3.sh 建 hq3）
set -uo pipefail
REPO=/app; T=$REPO/docs; L=$T/onboarding-4/localtest/regression; mkdir -p "$L"
MIG=$REPO/supabase/migrations
A="20261018120000_onboarding_wizard_state 20261018120001_onboarding_wizard_rpcs 20261018120002_m3_first_activation_guard"
B="$A 20261018130000_payuni_refunds 20261020090000_payuni_reconcile 20261021090000_team_am_onboarding"
P() { psql -X -q "$@"; }
mk() { P -d postgres -c "DROP DATABASE IF EXISTS $1" -c "CREATE DATABASE $1 TEMPLATE hq3"; [ "$2" = seed ] && P -d "$1" -v ON_ERROR_STOP=1 -f "$T/onboarding-3/localtest/seed_venues.sql" > /dev/null; true; }
ap() { local db=$1; shift; for m in "$@"; do P -d "$db" -v ON_ERROR_STOP=1 -f "$MIG/$m.sql" > /dev/null 2>&1 || echo "套用失敗 $m"; done; }
run() { P -d "$1" -At -F' | ' -f "$2" 2>&1 | grep -vE "^(BEGIN|ROLLBACK|SET|RESET|CREATE FUNCTION|GRANT|CREATE TABLE)$|^psql:.*NOTICE"; }
# A
mk wza seed; ap wza $A; run wza $T/onboarding-3/localtest/wizard_tests.sql > "$L/A_wizard_tests.txt"
mk wzra none; ap wzra $A; for m in m1 m2 m3; do run wzra $T/onboarding-2/localtest/${m}_tests.sql > "$L/A_$m.txt"; done
# B
mk wzb seed; ap wzb $B
echo "== 2d precheck（套用前，每列應為 t）"; P -d wzb -At -F' | ' -f "$T/onboarding-4/precheck_20261022090000.sql"
ap wzb 20261022090000_onboarding_wizard_2d
echo "== 2d postcheck（套用後，每列應為 t）"; P -d wzb -At -F' | ' -f "$T/onboarding-4/postcheck_20261022090000.sql"
run wzb $T/onboarding-3/localtest/wizard_tests.sql > "$L/B_wizard_tests.txt"
mk wzrb none; ap wzrb $B 20261022090000_onboarding_wizard_2d; for m in m1 m2 m3; do run wzrb $T/onboarding-2/localtest/${m}_tests.sql > "$L/B_$m.txt"; done
for f in wizard_tests m1 m2 m3; do echo "$f：A=$(tail -1 "$L/A_$f.txt")  B=$(tail -1 "$L/B_$f.txt")"; done
# B'：同 B，只把測試資料的介紹改為 30 字以上（wizard_tests.sql 第 90、127 行；原文 4、5 字，不符 2d 新規則），用來確認其餘差異只來自 OTA 規則變更
sed -e "90s/description = '測試介紹'/description = '測試介紹：這是一段超過三十個字的民宿介紹文字，用來符合上架精靈第 2d 批的新規則。'/" \
    -e "127s/description = '多房型測試'/description = '多房型測試：這是一段超過三十個字的民宿介紹文字，用來符合上架精靈第 2d 批的新規則。'/" \
    "$T/onboarding-3/localtest/wizard_tests.sql" > /tmp/wizard_tests_2d_desc.sql
mk wzc seed; ap wzc $B 20261022090000_onboarding_wizard_2d
run wzc /tmp/wizard_tests_2d_desc.sql > "$L/B2_wizard_tests_desc30.txt"
echo "wizard_tests（B'，介紹改 30 字以上）：$(tail -1 "$L/B2_wizard_tests_desc30.txt")"
# B''：B' 再把 4 題「測 OTA 舊規則」的題目換成 2d 規則的對應題（其餘 72 題原封不動），確認除規則本身外沒有其他行為改變
#   F21 原：不勾 OTA 送審被擋（22023）→ 2d：業主 precheck 不含 OTA 資訊（不送審，避免改變後續題目的前置狀態）
#   M05 原：OwlTing 未對應 → 紅色 ota_mapping → 2d：red_ok=true 且紅色無 ota_mapping
#   M06 原：OTA 紅色不能送審 → 2d：OTA 未對應仍 red_ok=true（不送審，留給 M08）
#   M07 原：Hotelnabe 列在黃色 → 2d：黃色為空、業主看不到 ota_status
sed -e "92s/.*/SELECT pg_temp.chk('F21(2d) 業主 precheck 不含 OTA 資訊', 'OK false|0', pg_temp.try(:hT, \$\$SELECT (p ? 'ota_status')::text||'|'||jsonb_array_length(p -> 'yellow') FROM public.wizard_precheck('ea55e271-15f8-4e63-9c4f-69fbd2022bc5') p\$\$));/" \
    -e "129s/.*/SELECT pg_temp.chk('M05(2d) OwlTing 未對應不列紅色', 'OK true|0', pg_temp.try(:hM, \$\$SELECT (p ->> 'red_ok')||'|'||(SELECT count(*) FROM jsonb_array_elements(p -> 'red') e WHERE e ->> 'key'='ota_mapping') FROM public.wizard_precheck('d0000000-0000-0000-0000-00000000000d') p\$\$));/" \
    -e "130s/.*/SELECT pg_temp.chk('M06(2d) OTA 未對應仍可送審（red_ok）', 'OK true', pg_temp.try(:hM, \$\$SELECT public.wizard_precheck('d0000000-0000-0000-0000-00000000000d') ->> 'red_ok'\$\$));/" \
    -e "133s/.*/SELECT pg_temp.chk('M07(2d) 黃色為空、業主看不到 ota_status', 'OK 0|false', pg_temp.try(:hM, \$\$SELECT jsonb_array_length(p -> 'yellow')||'|'||(p ? 'ota_status')::text FROM public.wizard_precheck('d0000000-0000-0000-0000-00000000000d') p\$\$));/" \
    /tmp/wizard_tests_2d_desc.sql > /tmp/wizard_tests_2d_rules.sql
mk wzd seed; ap wzd $B 20261022090000_onboarding_wizard_2d
run wzd /tmp/wizard_tests_2d_rules.sql > "$L/B3_wizard_tests_2d_rules.txt"
echo "wizard_tests（B''，介紹 30 字＋4 題換成 2d 規則）：$(tail -1 "$L/B3_wizard_tests_2d_rules.txt")"
cp /tmp/wizard_tests_2d_desc.sql "$L/wizard_tests_variant_desc30.sql"; cp /tmp/wizard_tests_2d_rules.sql "$L/wizard_tests_variant_2d_rules.sql"
