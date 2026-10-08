-- 旅客標籤清洗備份表：正式清洗前保存原始 interest_tags / custom_needs / ai_keywords，可依 batch_id 還原。
-- RLS 開啟但不建任何 policy → 僅 service role（繞過 RLS）可讀寫；前端/一般角色無法存取。
CREATE TABLE IF NOT EXISTS public.traveler_profiles_cleanup_backup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  interest_tags text[],
  custom_needs text[],
  ai_keywords text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tpcb_batch_id ON public.traveler_profiles_cleanup_backup (batch_id);
CREATE INDEX IF NOT EXISTS idx_tpcb_profile_id ON public.traveler_profiles_cleanup_backup (profile_id);

ALTER TABLE public.traveler_profiles_cleanup_backup ENABLE ROW LEVEL SECURITY;
