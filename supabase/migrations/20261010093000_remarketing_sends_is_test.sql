-- E2 測試發送：remarketing_sends 加 is_test 旗標；唯一索引改為僅對正式列生效，
-- 讓測試列（is_test=true）可重複寫入且不覆蓋正式發送列。
ALTER TABLE public.remarketing_sends
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

DROP INDEX IF EXISTS public.remarketing_sends_campaign_traveler_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS remarketing_sends_campaign_traveler_uidx
  ON public.remarketing_sends (campaign_id, traveler_profile_id)
  WHERE is_test = false;

CREATE INDEX IF NOT EXISTS remarketing_sends_is_test_idx
  ON public.remarketing_sends (is_test);
