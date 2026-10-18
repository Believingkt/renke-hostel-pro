-- 舊資料清理 步驟 3：執行拆分（由 build.sh 產生；請先確認 preview.csv 再執行）
-- 產生時間：__GENERATED_AT__　預計更新：__COUNT__ 筆
-- 逐筆處理，每筆都在自己的子交易裡：
--   ・掃描後主欄位或其他平台連結被改過 → 該筆略過
--   ・觸發器連動改到連結以外的欄位（名稱、合約歸戶…）→ 該筆還原並略過
--   ・其他錯誤 → 該筆還原並略過
-- 更新前的整筆資料備份在 public.kol_links_cleanup_backup_20261018（RLS 開啟、無 policy，前端讀不到）。
-- 注意：updated_by 會變成 NULL（SQL Editor 沒有登入者），代表系統清理。
-- 還原：03_rollback.sql

BEGIN;

CREATE TABLE IF NOT EXISTS public.kol_links_cleanup_backup_20261018 (
  id uuid PRIMARY KEY,
  row_data jsonb NOT NULL,
  new_ig text NOT NULL,
  new_url text,
  new_other text[] NOT NULL,
  backed_up_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.kol_links_cleanup_backup_20261018 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kol_links_cleanup_backup_20261018 FROM anon, authenticated;

CREATE TEMP TABLE _kol_links_plan (
  id uuid PRIMARY KEY,
  old_ig text,
  old_other text[] NOT NULL,
  new_ig text NOT NULL,
  new_url text,
  new_other text[] NOT NULL
) ON COMMIT DROP;

INSERT INTO _kol_links_plan (id, old_ig, old_other, new_ig, new_url, new_other) VALUES
__VALUES__;

DROP TABLE IF EXISTS _kol_links_result;
CREATE TEMP TABLE _kol_links_result (id uuid, result text, reason text);

DO $$
DECLARE
  p record;
  v_old jsonb;
  v_new jsonb;
  v_skip text[] := ARRAY['ig_handle', 'ig_url', 'other_links', 'other_links_text', 'updated_by', 'updated_at'];
BEGIN
  FOR p IN SELECT * FROM _kol_links_plan LOOP
    BEGIN
      SELECT to_jsonb(k) INTO v_old FROM public.kol_profiles k WHERE k.id = p.id FOR UPDATE;
      IF v_old IS NULL THEN
        INSERT INTO _kol_links_result VALUES (p.id, '略過', '紀錄已不存在');
        CONTINUE;
      END IF;
      IF (v_old->>'ig_handle') IS DISTINCT FROM p.old_ig
         OR ARRAY(SELECT jsonb_array_elements_text(v_old->'other_links')) IS DISTINCT FROM p.old_other THEN
        INSERT INTO _kol_links_result VALUES (p.id, '略過', '掃描後連結已被修改（或已清理過），請重新掃描');
        CONTINUE;
      END IF;

      UPDATE public.kol_profiles k
      SET ig_handle = p.new_ig, ig_url = p.new_url, other_links = p.new_other
      WHERE k.id = p.id
      RETURNING to_jsonb(k) INTO v_new;

      IF (v_new - v_skip) IS DISTINCT FROM (v_old - v_skip) THEN
        RAISE EXCEPTION '其他欄位會被系統連動修改：%',
          (SELECT string_agg(key, '、') FROM jsonb_each(v_new - v_skip) n
           WHERE n.value IS DISTINCT FROM (v_old - v_skip)->n.key);
      END IF;

      INSERT INTO public.kol_links_cleanup_backup_20261018 (id, row_data, new_ig, new_url, new_other)
      VALUES (p.id, v_old, p.new_ig, p.new_url, p.new_other);
      INSERT INTO _kol_links_result VALUES (p.id, '已更新', NULL);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO _kol_links_result VALUES (p.id, '略過（已還原這筆）', SQLERRM);
    END;
  END LOOP;
END $$;

COMMIT;

SELECT r.result AS 結果, k.name AS kol_名稱, k.ig_handle AS 目前主欄位, k.other_links AS 其他平台連結, r.reason AS 原因, r.id
FROM _kol_links_result r
LEFT JOIN public.kol_profiles k ON k.id = r.id
ORDER BY (r.result = '已更新'), k.name;
