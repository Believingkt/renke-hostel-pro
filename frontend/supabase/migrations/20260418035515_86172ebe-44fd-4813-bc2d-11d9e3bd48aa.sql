-- 建立民宿 API Key 資料表
CREATE TABLE public.accommodation_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id UUID NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_accommodation_api_keys_accommodation ON public.accommodation_api_keys(accommodation_id);
CREATE INDEX idx_accommodation_api_keys_hash ON public.accommodation_api_keys(key_hash);

ALTER TABLE public.accommodation_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view their accommodation api keys"
  ON public.accommodation_api_keys FOR SELECT TO authenticated
  USING (user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
      OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role));

CREATE POLICY "Admins can insert api keys"
  ON public.accommodation_api_keys FOR INSERT TO authenticated
  WITH CHECK (user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
           OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role));

CREATE POLICY "Admins can update api keys"
  ON public.accommodation_api_keys FOR UPDATE TO authenticated
  USING (user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
      OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role));

CREATE POLICY "Admins can delete api keys"
  ON public.accommodation_api_keys FOR DELETE TO authenticated
  USING (user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
      OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role));

CREATE TRIGGER update_accommodation_api_keys_updated_at
  BEFORE UPDATE ON public.accommodation_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 驗證 API Key 並回傳 accommodation_id
CREATE OR REPLACE FUNCTION public.verify_accommodation_api_key(p_key_hash TEXT)
RETURNS TABLE(accommodation_id UUID, key_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT k.accommodation_id, k.id
  FROM public.accommodation_api_keys k
  WHERE k.key_hash = p_key_hash
    AND k.is_active = true
  LIMIT 1;

  -- 更新最後使用時間
  UPDATE public.accommodation_api_keys
  SET last_used_at = now()
  WHERE key_hash = p_key_hash AND is_active = true;
END;
$$;