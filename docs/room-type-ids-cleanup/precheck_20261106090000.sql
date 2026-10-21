-- 20261106090000 precheck（唯讀，正式庫可直接執行）
-- P1 欄位型別：room_type_ids 兩列都應為 uuid[]；room_type_id、primary_room_type_id、room_types.id 應為 uuid
SELECT c.relname AS tbl, a.attname AS col, format_type(a.atttypid, a.atttypmod) AS col_type, a.attnotnull AS not_null FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND ((c.relname IN ('pricing_templates', 'accommodation_packages') AND a.attname IN ('room_type_ids', 'room_type_id', 'primary_room_type_id')) OR (c.relname = 'room_types' AND a.attname = 'id')) AND a.attnum > 0 AND NOT a.attisdropped ORDER BY 1, 2;

-- P2 殘留清單：應剛好 4 列，且 tbl／id／missing_room_type_id 與已查證值一致；valid_left = 清理後還剩幾個有效房型
SELECT 'accommodation_packages' AS tbl, p.id, p.accommodation_id, p.name AS row_name, x AS missing_room_type_id, p.primary_room_type_id AS single_id, cardinality(p.room_type_ids) AS total_ids, (SELECT count(*) FROM unnest(p.room_type_ids) AS y WHERE EXISTS (SELECT 1 FROM public.room_types r WHERE r.id = y)) AS valid_left FROM public.accommodation_packages p CROSS JOIN LATERAL unnest(p.room_type_ids) AS x WHERE NOT EXISTS (SELECT 1 FROM public.room_types r WHERE r.id = x)
UNION ALL
SELECT 'pricing_templates', t.id, t.accommodation_id, t.template_name, x, t.room_type_id, cardinality(t.room_type_ids), (SELECT count(*) FROM unnest(t.room_type_ids) AS y WHERE EXISTS (SELECT 1 FROM public.room_types r WHERE r.id = y)) FROM public.pricing_templates t CROSS JOIN LATERAL unnest(t.room_type_ids) AS x WHERE NOT EXISTS (SELECT 1 FROM public.room_types r WHERE r.id = x)
ORDER BY 1, 2;

-- P3 尚未套用：三欄都應為 true
SELECT to_regprocedure('public.room_types_detach_from_plans_before_delete()') IS NULL AS fn_absent, to_regclass('public.room_type_ids_cleanup_backup_20261106') IS NULL AS backup_absent, NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = 'public.room_types'::regclass AND t.tgname = 'trg_room_types_detach_from_plans') AS trigger_absent;

-- P4 room_types 既有觸發器（只看，不改；確認沒有別的 BEFORE DELETE 會互相影響）
SELECT t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) AS def FROM pg_trigger t WHERE t.tgrelid = 'public.room_types'::regclass AND NOT t.tgisinternal ORDER BY 1;

-- P5 所有用 FK 參照 room_types 的表與 ON DELETE 行為（只列出，不改）
SELECT c.conrelid::regclass AS referencing_table, a.attname AS col, c.conname, CASE c.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS on_delete FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey) WHERE c.contype = 'f' AND c.confrelid = 'public.room_types'::regclass ORDER BY 1, 2;

-- P6 專案／方案表上會被 UPDATE 觸發的觸發器（確認清理只改 room_type_ids 不會連動價格重建）
SELECT t.tgrelid::regclass AS tbl, t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) AS def FROM pg_trigger t WHERE t.tgrelid IN ('public.pricing_templates'::regclass, 'public.accommodation_packages'::regclass) AND NOT t.tgisinternal ORDER BY 1, 2;

-- P7 兩館是否開啟自動專案同步（影響刪房型時方案主房型改變的連動）
SELECT f.accommodation_id, f.auto_template_enabled FROM public.accommodation_info_flags f WHERE f.accommodation_id IN ('74d064f4-1f8c-47e8-9be0-f0a596bbe6f8', 'a4bacadc-9b7a-4110-ac04-a1cc6248c822');
