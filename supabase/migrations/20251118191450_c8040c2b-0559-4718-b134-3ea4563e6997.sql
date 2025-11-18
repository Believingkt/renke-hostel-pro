-- 修改佣金記錄創建函數，支援在訂單創建時（pending 狀態）就創建佣金記錄
CREATE OR REPLACE FUNCTION public.create_commission_record()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_discount_code public.discount_codes;
  v_commission_amount numeric;
BEGIN
  -- 只在訂單有折扣碼時處理
  IF NEW.discount_code IS NOT NULL THEN
    -- 獲取折扣碼資訊
    SELECT * INTO v_discount_code
    FROM public.discount_codes
    WHERE code = NEW.discount_code
      AND accommodation_id = NEW.accommodation_id;
    
    -- 只在折扣碼有佣金率時創建佣金記錄
    IF v_discount_code.commission_rate > 0 THEN
      -- 計算佣金金額（基於折扣金額）
      v_commission_amount := ROUND((NEW.discount_amount * v_discount_code.commission_rate / 100)::numeric, 0);
      
      -- 檢查是否已存在此訂單的佣金記錄
      IF NOT EXISTS (
        SELECT 1 FROM public.commission_records WHERE order_id = NEW.id
      ) THEN
        -- 插入新的佣金記錄
        INSERT INTO public.commission_records (
          accommodation_id,
          discount_code_id,
          order_id,
          order_total,
          discount_amount,
          commission_rate,
          commission_amount,
          settlement_status
        ) VALUES (
          NEW.accommodation_id,
          v_discount_code.id,
          NEW.id,
          NEW.total_price,
          NEW.discount_amount,
          v_discount_code.commission_rate,
          v_commission_amount,
          'pending'
        );
        
        RAISE NOTICE '已為訂單 % 創建佣金記錄，佣金金額: %', NEW.order_number, v_commission_amount;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 添加註解說明
COMMENT ON FUNCTION public.create_commission_record() IS '當訂單創建或更新時，自動創建對應的佣金記錄（如果有使用折扣碼且折扣碼有設定佣金率）';