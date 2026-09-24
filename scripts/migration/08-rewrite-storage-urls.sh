#!/usr/bin/env bash
# 把資料庫裡寫死的舊專案 storage URL（https://<OLD_REF>.supabase.co/storage/...）改成新專案。
# 發現於 9/24 本機測試：REST 全打新專案，但 room-photos 等圖片 URL 是存絕對路徑，仍指向舊專案。
# 掃 public schema 所有 text/varchar/json/jsonb 欄位；先印統計，回 yes 才改。冪等。
set -euo pipefail
cd "$(dirname "$0")"
set -a; source migration.env; set +a
OLD_HOST="${OLD_REF}.supabase.co"; NEW_HOST="${NEW_REF}.supabase.co"
echo "== 掃描含 ${OLD_HOST} 的欄位（public schema）"
psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 -Atq <<SQL | tee ./storage-url-scan.txt
CREATE TEMP TABLE _url_scan(tbl text, col text, typ text, hits bigint);
DO \$\$
DECLARE r record; n bigint; total bigint := 0;
BEGIN
  FOR r IN SELECT c.table_name, c.column_name, c.data_type FROM information_schema.columns c
           JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name
           WHERE c.table_schema='public' AND t.table_type='BASE TABLE'   -- 排除 view（view 不能 UPDATE）
             AND c.data_type IN ('text','character varying','json','jsonb') LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I::text LIKE %L', r.table_name, r.column_name, '%${OLD_HOST}%') INTO n;
    IF n > 0 THEN INSERT INTO _url_scan VALUES (r.table_name, r.column_name, r.data_type, n); total := total + n; END IF;
  END LOOP;
  RAISE NOTICE 'total rows with old host: %', total;
END \$\$;
SELECT tbl||'.'||col||' ('||typ||') '||hits FROM _url_scan ORDER BY hits DESC;
SQL
echo
read -r -p "把以上欄位裡的 ${OLD_HOST} 全部替換成 ${NEW_HOST}？(yes/no) " a; [ "$a" = yes ] || exit 0
psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 -q <<SQL
BEGIN;
SET session_replication_role = replica;  -- 不觸發 updated_at 等 trigger
DO \$\$
DECLARE r record; n bigint;
BEGIN
  FOR r IN SELECT c.table_name, c.column_name, c.data_type FROM information_schema.columns c
           JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name
           WHERE c.table_schema='public' AND t.table_type='BASE TABLE'   -- 排除 view（view 不能 UPDATE）
             AND c.data_type IN ('text','character varying','json','jsonb') LOOP
    IF r.data_type IN ('json','jsonb') THEN
      EXECUTE format('UPDATE public.%I SET %I = replace(%I::text, %L, %L)::%s WHERE %I::text LIKE %L',
        r.table_name, r.column_name, r.column_name, '${OLD_HOST}', '${NEW_HOST}', r.data_type, r.column_name, '%${OLD_HOST}%');
    ELSE
      EXECUTE format('UPDATE public.%I SET %I = replace(%I, %L, %L) WHERE %I LIKE %L',
        r.table_name, r.column_name, r.column_name, '${OLD_HOST}', '${NEW_HOST}', r.column_name, '%${OLD_HOST}%');
    END IF;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN RAISE NOTICE '% . % : % rows', r.table_name, r.column_name, n; END IF;
  END LOOP;
END \$\$;
COMMIT;
SQL
echo "== 複查（應為 0）"
psql "$NEW_DB_URL" -Atc "SELECT count(*) FROM accommodation_photos WHERE photo_url LIKE '%${OLD_HOST}%'"
