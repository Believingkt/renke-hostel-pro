-- 舊資料清理 步驟 1：掃描（唯讀，不會修改任何資料）
-- 找出「網紅帳號連結」主欄位塞了多個連結、或帶「IG：」等標籤的紀錄。
-- 需先套用 20261018110000（other_links 欄位）。
-- 用法：在 Supabase SQL Editor 執行，第 1 段看筆數；第 2 段把 scan_json 整格內容複製存成 scan.json。

SELECT count(*) AS n_candidates
FROM public.kol_profiles k
WHERE k.ig_handle ~ '\s'
   OR regexp_count(k.ig_handle, '(https?://|(^|[^/])www\.)', 1, 'i') >= 2
   OR k.ig_handle ~* '(ig|instagram|fb|facebook|yt|youtube|tiktok|threads|抖音|脆)\s*[:：]'
   OR k.ig_handle ~ '[,，、；;|｜。]';

SELECT coalesce(
  json_agg(
    json_build_object(
      'id', k.id,
      'name', k.name,
      'venue', coalesce(a.name, k.venue_name),
      'check_in_date', k.check_in_date,
      'is_error', k.is_error,
      'ig_handle', k.ig_handle,
      'ig_url', k.ig_url,
      'other_links', k.other_links
    ) ORDER BY k.created_at
  ),
  '[]'::json
) AS scan_json
FROM public.kol_profiles k
LEFT JOIN public.accommodation_info a ON a.id = k.accommodation_id
WHERE k.ig_handle ~ '\s'
   OR regexp_count(k.ig_handle, '(https?://|(^|[^/])www\.)', 1, 'i') >= 2
   OR k.ig_handle ~* '(ig|instagram|fb|facebook|yt|youtube|tiktok|threads|抖音|脆)\s*[:：]'
   OR k.ig_handle ~ '[,，、；;|｜。]';
