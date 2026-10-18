-- 舊資料清理：還原（把 02_apply.sql 改過的紀錄恢復成清理前的主欄位／連結）
-- 只還原「清理後沒有再被人改過連結」的紀錄；清理後有人改過的會列出來、不動。
-- 還原成功的紀錄會從備份表移除，之後可以重新掃描、重新執行。

BEGIN;

DROP TABLE IF EXISTS _kol_links_rollback_result;
CREATE TEMP TABLE _kol_links_rollback_result (id uuid, result text, reason text);

DO $$
DECLARE
  b record;
  k record;
BEGIN
  IF to_regclass('public.kol_links_cleanup_backup_20261018') IS NULL THEN
    RAISE EXCEPTION '找不到備份表 kol_links_cleanup_backup_20261018，沒有可還原的資料';
  END IF;
  FOR b IN SELECT * FROM public.kol_links_cleanup_backup_20261018 LOOP
    BEGIN
      SELECT ig_handle, ig_url, other_links INTO k FROM public.kol_profiles WHERE id = b.id FOR UPDATE;
      IF NOT FOUND THEN
        INSERT INTO _kol_links_rollback_result VALUES (b.id, '略過', '紀錄已不存在');
        CONTINUE;
      END IF;
      IF k.ig_handle IS DISTINCT FROM b.new_ig OR k.ig_url IS DISTINCT FROM b.new_url OR k.other_links IS DISTINCT FROM b.new_other THEN
        INSERT INTO _kol_links_rollback_result VALUES (b.id, '略過', '清理後連結已被修改，為避免蓋掉新資料不還原');
        CONTINUE;
      END IF;
      UPDATE public.kol_profiles
      SET ig_handle = b.row_data->>'ig_handle',
          ig_url = b.row_data->>'ig_url',
          other_links = ARRAY(SELECT jsonb_array_elements_text(b.row_data->'other_links'))
      WHERE id = b.id;
      DELETE FROM public.kol_links_cleanup_backup_20261018 WHERE id = b.id;
      INSERT INTO _kol_links_rollback_result VALUES (b.id, '已還原', NULL);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO _kol_links_rollback_result VALUES (b.id, '略過（錯誤）', SQLERRM);
    END;
  END LOOP;
END $$;

COMMIT;

SELECT r.result AS 結果, k.name AS kol_名稱, k.ig_handle AS 目前主欄位, r.reason AS 原因, r.id
FROM _kol_links_rollback_result r
LEFT JOIN public.kol_profiles k ON k.id = r.id
ORDER BY (r.result = '已還原'), k.name;
