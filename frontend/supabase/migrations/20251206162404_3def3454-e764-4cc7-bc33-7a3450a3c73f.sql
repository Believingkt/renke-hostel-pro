
-- =====================================================
-- 安全加固遷移
-- =====================================================

-- 1. 確保 password_reset_tokens 表的 RLS 完全啟用
-- 添加一個明確的服務端驗證策略說明（現有的已經禁止讀取）

-- 2. 為 discount_codes 的 api_key 欄位添加額外保護
-- 創建一個視圖，讓一般查詢不會意外暴露 api_key
CREATE OR REPLACE VIEW public.discount_codes_safe AS
SELECT 
  id,
  accommodation_id,
  name,
  code,
  discount_type,
  discount_value,
  usage_limit,
  used_count,
  valid_from,
  valid_until,
  is_active,
  min_order_amount,
  applicable_room_types,
  applicable_date_from,
  applicable_date_to,
  display_order,
  commission_rate,
  created_at,
  updated_at
  -- 故意排除 api_key 欄位
FROM public.discount_codes;

-- 3. 為視圖設置適當的權限
GRANT SELECT ON public.discount_codes_safe TO authenticated;

-- 4. 確保 profiles 表有適當的跨住宿保護
-- 檢查並添加更嚴格的政策
DO $$
BEGIN
  -- 刪除可能存在的過於寬鬆的政策
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Public profiles are viewable by everyone') THEN
    DROP POLICY "Public profiles are viewable by everyone" ON public.profiles;
  END IF;
END $$;

-- 5. 確保 profiles 只能被相關用戶查看
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can view profiles in their accommodation" ON public.profiles;
CREATE POLICY "Admins can view profiles in their accommodation" 
ON public.profiles 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur1
    WHERE ur1.user_id = auth.uid()
    AND ur1.role IN ('super_admin', 'hotel_admin')
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur2
      WHERE ur2.user_id = profiles.id
      AND ur2.accommodation_id = ur1.accommodation_id
    )
  )
);

-- 6. 確保 profiles 更新只能由本人進行
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" 
ON public.profiles 
FOR UPDATE 
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 7. 添加 commission_records 的跨住宿保護確認
-- 現有政策已經正確，但添加額外的 staff 查看政策（只讀）
DROP POLICY IF EXISTS "Staff can view commission records in their accommodation" ON public.commission_records;
CREATE POLICY "Staff can view commission records in their accommodation" 
ON public.commission_records 
FOR SELECT 
USING (user_has_access_to_accommodation(auth.uid(), accommodation_id));

-- 8. 為 backup_logs 添加更詳細的審計
COMMENT ON TABLE public.backup_logs IS '備份日誌表 - 僅管理員可存取，包含敏感的系統架構資訊';
COMMENT ON COLUMN public.backup_logs.file_path IS '備份檔案路徑 - 敏感資訊，不應暴露給非管理員';
COMMENT ON COLUMN public.backup_logs.error_message IS '錯誤訊息 - 可能包含敏感系統資訊';

-- 9. 創建安全審計函數
CREATE OR REPLACE FUNCTION public.check_rls_enabled()
RETURNS TABLE(table_name text, rls_enabled boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    relname::text as table_name,
    relrowsecurity as rls_enabled
  FROM pg_class
  WHERE relnamespace = 'public'::regnamespace
    AND relkind = 'r'
  ORDER BY relname;
$$;

-- 10. 確保所有敏感表都啟用了 RLS（雙重確認）
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discount_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
