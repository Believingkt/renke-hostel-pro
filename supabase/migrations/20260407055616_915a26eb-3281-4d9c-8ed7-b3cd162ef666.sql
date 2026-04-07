
-- 1. customers 表新增 member_id 欄位，關聯 platform_members
ALTER TABLE public.customers
ADD COLUMN member_id uuid REFERENCES public.platform_members(id) ON DELETE SET NULL;

-- 2. 建立索引加速查詢
CREATE INDEX idx_customers_member_id ON public.customers(member_id);
CREATE INDEX idx_orders_member_id ON public.orders(member_id);
CREATE INDEX idx_platform_members_email ON public.platform_members(email);
CREATE INDEX idx_platform_members_phone ON public.platform_members(phone);

-- 3. 觸發器函數：會員註冊時自動比對歷史顧客與訂單
CREATE OR REPLACE FUNCTION public.auto_link_member_to_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- 用 Email 或電話比對 customers 表，回填 member_id
  UPDATE public.customers
  SET member_id = NEW.id
  WHERE member_id IS NULL
    AND (
      (NEW.email IS NOT NULL AND email IS NOT NULL AND LOWER(TRIM(email)) = LOWER(TRIM(NEW.email)))
      OR
      (NEW.phone IS NOT NULL AND phone IS NOT NULL AND TRIM(phone) = TRIM(NEW.phone))
    );

  -- 用 Email 或電話比對 orders 表，回填 member_id
  UPDATE public.orders
  SET member_id = NEW.id
  WHERE member_id IS NULL
    AND (
      (NEW.email IS NOT NULL AND guest_email IS NOT NULL AND LOWER(TRIM(guest_email)) = LOWER(TRIM(NEW.email)))
      OR
      (NEW.phone IS NOT NULL AND guest_phone IS NOT NULL AND TRIM(guest_phone) = TRIM(NEW.phone))
    );

  RETURN NEW;
END;
$$;

-- 4. 綁定觸發器到 platform_members 的 INSERT
CREATE TRIGGER trg_auto_link_member_history
AFTER INSERT ON public.platform_members
FOR EACH ROW
EXECUTE FUNCTION public.auto_link_member_to_history();
