-- 上架引導第一批 ③：自動建專案取價規則測試（BEGIN…ROLLBACK）
-- 用法：psql -v ON_ERROR_STOP=1 -f 11_price_fallback_tests.sql
\set QUIET 1
\pset pager off
BEGIN;

CREATE TEMP TABLE t_result (seq serial, case_no text, expect text, actual text, pass boolean);

INSERT INTO public.accommodation_info (id, name, is_active) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000f1', '取價測試館', false);
INSERT INTO public.accommodation_info_flags (accommodation_id, new_price_ui_enabled, price_sync_mode, auto_template_enabled)
VALUES ('aaaaaaaa-0000-0000-0000-0000000000f1', true, 'package_original', true);

INSERT INTO public.accommodation_packages (id, accommodation_id, name, sale_price, original_price, tier_prices, included_guest_count) VALUES
  ('cccccccc-0000-0000-0000-0000000000f1', 'aaaaaaaa-0000-0000-0000-0000000000f1', '(a) 只有空的平日', 50000, 50000,
   '{"weekday":{"sale":0,"original":null}}', 2),
  ('cccccccc-0000-0000-0000-0000000000f2', 'aaaaaaaa-0000-0000-0000-0000000000f1', '(b) 三日型完整', 3000, 3600,
   '{"weekday":{"sale":3000,"original":3600},"friday_sunday":{"sale":3400,"original":4000},"weekend":{"sale":3800,"original":4500}}', 2),
  ('cccccccc-0000-0000-0000-0000000000f3', 'aaaaaaaa-0000-0000-0000-0000000000f1', '(c) 沒有分日價', 3000, 3500, '{}', 2),
  ('cccccccc-0000-0000-0000-0000000000f4', 'aaaaaaaa-0000-0000-0000-0000000000f1', '(d) 方案原價 0、售價 3000', 3000, 0, '{}', 2),
  ('cccccccc-0000-0000-0000-0000000000f5', 'aaaaaaaa-0000-0000-0000-0000000000f1', '(f) 平日只有售價、週六原價 0 售價有值', 2000, 2500,
   '{"weekday":{"sale":2800,"original":null},"weekend":{"sale":3300,"original":0}}', 2);

INSERT INTO t_result (case_no, expect, actual)
SELECT p.name,
       e.expect,
       t.weekday_price || '/' || t.peak_price || '/' || t.weekend_price || ' 開啟 '
         || t.weekday_enabled::text::char || t.peak_enabled::text::char || t.weekend_enabled::text::char
         || ' price=' || t.price
FROM public.accommodation_packages p
JOIN public.pricing_templates t ON t.default_package_id = p.id
JOIN (VALUES
  ('cccccccc-0000-0000-0000-0000000000f1'::uuid, '50000/50000/50000 開啟 ttt price=50000'),
  ('cccccccc-0000-0000-0000-0000000000f2'::uuid, '3600/4000/4500 開啟 ttt price=3600'),
  ('cccccccc-0000-0000-0000-0000000000f3'::uuid, '3500/3500/3500 開啟 ttt price=3500'),
  ('cccccccc-0000-0000-0000-0000000000f4'::uuid, '3000/3000/3000 開啟 ttt price=3000'),
  ('cccccccc-0000-0000-0000-0000000000f5'::uuid, '2800/2500/3300 開啟 ttt price=2800')
) AS e(pkg, expect) ON e.pkg = p.id
ORDER BY p.name;

UPDATE t_result SET pass = (actual = expect);

SELECT case_no AS "案例", expect AS "預期", actual AS "實際", CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END AS "結果"
FROM t_result ORDER BY case_no;
SELECT count(*) FILTER (WHERE pass) AS pass, count(*) FILTER (WHERE NOT pass) AS fail, count(*) AS total FROM t_result;

ROLLBACK;
