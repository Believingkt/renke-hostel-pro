
-- 建立觸發器：新用戶完成 Email 驗證後，自動在 platform_members 建立會員資料
CREATE OR REPLACE FUNCTION public.auto_create_platform_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- 當用戶的 email_confirmed_at 從 NULL 變為有值時（代表驗證完成）
  -- 或者是 OAuth 登入（email_confirmed_at 直接有值）
  IF (NEW.email_confirmed_at IS NOT NULL AND (OLD.email_confirmed_at IS NULL OR TG_OP = 'INSERT')) THEN
    -- 檢查是否已有 platform_members 記錄
    IF NOT EXISTS (SELECT 1 FROM public.platform_members WHERE user_id = NEW.id) THEN
      -- 只為非管理員用戶建立（檢查是否有 user_roles 記錄）
      IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.id) THEN
        INSERT INTO public.platform_members (user_id, name, email, phone)
        VALUES (
          NEW.id,
          COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
          NEW.email,
          COALESCE(NEW.raw_user_meta_data->>'phone', NULL)
        );
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 在 auth.users 上建立觸發器
CREATE TRIGGER on_auth_user_verified
  AFTER INSERT OR UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_platform_member();
