-- 舊資料清理：事後檢查（唯讀）
-- 預期：n_still_multi 只剩 02_apply 結果中「略過」的筆數；n_backup = 已更新筆數；n_other_in_main = 0
SELECT count(*) AS n_still_multi
FROM public.kol_profiles k
WHERE k.ig_handle ~* '(https?://|www\.).*(https?://|www\.)'
   OR k.ig_handle ~* '(ig|instagram|fb|facebook|yt|youtube|tiktok|threads|抖音|脆)\s*[:：]';

SELECT count(*) AS n_backup FROM public.kol_links_cleanup_backup_20261018;

-- 清理過的紀錄，主欄位不應再含空白
SELECT count(*) AS n_other_in_main
FROM public.kol_profiles k
JOIN public.kol_links_cleanup_backup_20261018 b ON b.id = k.id
WHERE k.ig_handle ~ '\s';
