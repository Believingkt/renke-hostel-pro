-- 創建折扣代碼表
CREATE TABLE IF NOT EXISTS public.discount_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id UUID NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'amount')),
  discount_value INTEGER NOT NULL CHECK (discount_value > 0),
  usage_limit INTEGER NOT NULL CHECK (usage_limit > 0),
  used_count INTEGER NOT NULL DEFAULT 0,
  valid_from TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  valid_until TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 啟用 RLS
ALTER TABLE public.discount_codes ENABLE ROW LEVEL SECURITY;

-- 創建索引
CREATE INDEX idx_discount_codes_accommodation ON public.discount_codes(accommodation_id);
CREATE INDEX idx_discount_codes_code ON public.discount_codes(code);
CREATE INDEX idx_discount_codes_valid_dates ON public.discount_codes(valid_from, valid_until);

-- RLS 政策：公開可查看（用於前台訂單）
CREATE POLICY "Public can view active discount codes"
ON public.discount_codes
FOR SELECT
USING (is_active = true AND (valid_until IS NULL OR valid_until > NOW()));

-- RLS 政策：管理員可以管理
CREATE POLICY "Admins can insert discount codes"
ON public.discount_codes
FOR INSERT
WITH CHECK (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) OR 
  user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

CREATE POLICY "Admins can update discount codes"
ON public.discount_codes
FOR UPDATE
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) OR 
  user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

CREATE POLICY "Admins can delete discount codes"
ON public.discount_codes
FOR DELETE
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) OR 
  user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

-- 管理員可以查看所有折扣碼
CREATE POLICY "Admins can view all discount codes"
ON public.discount_codes
FOR SELECT
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) OR 
  user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

-- 創建觸發器自動更新 updated_at
CREATE TRIGGER update_discount_codes_updated_at
BEFORE UPDATE ON public.discount_codes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 創建函數檢查折扣碼有效性
CREATE OR REPLACE FUNCTION public.validate_discount_code(
  p_code TEXT,
  p_accommodation_id UUID
)
RETURNS TABLE (
  is_valid BOOLEAN,
  discount_type TEXT,
  discount_value INTEGER,
  message TEXT
) AS $$
DECLARE
  v_discount_code public.discount_codes;
BEGIN
  -- 查找折扣碼
  SELECT * INTO v_discount_code
  FROM public.discount_codes
  WHERE code = UPPER(p_code)
    AND accommodation_id = p_accommodation_id
    AND is_active = true;
  
  -- 檢查是否存在
  IF v_discount_code.id IS NULL THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::INTEGER, '折扣碼不存在或已停用'::TEXT;
    RETURN;
  END IF;
  
  -- 檢查是否已過期
  IF v_discount_code.valid_until IS NOT NULL AND v_discount_code.valid_until < NOW() THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::INTEGER, '折扣碼已過期'::TEXT;
    RETURN;
  END IF;
  
  -- 檢查是否未生效
  IF v_discount_code.valid_from > NOW() THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::INTEGER, '折扣碼尚未生效'::TEXT;
    RETURN;
  END IF;
  
  -- 檢查使用次數
  IF v_discount_code.used_count >= v_discount_code.usage_limit THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::INTEGER, '折扣碼使用次數已達上限'::TEXT;
    RETURN;
  END IF;
  
  -- 有效
  RETURN QUERY SELECT 
    true, 
    v_discount_code.discount_type, 
    v_discount_code.discount_value,
    '折扣碼有效'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;