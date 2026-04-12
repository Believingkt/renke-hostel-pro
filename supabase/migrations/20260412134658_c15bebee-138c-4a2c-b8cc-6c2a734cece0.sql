
CREATE OR REPLACE FUNCTION public.create_commission_record()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    
    -- 只在折扣碼有佣金率時創建/更新佣金記錄
    IF v_discount_code.commission_rate > 0 THEN
      -- 計算佣金金額（基於實際付款金額 final_price）
      v_commission_amount := ROUND((NEW.final_price * v_discount_code.commission_rate / 100)::numeric, 0);
      
      -- 檢查是否已存在此訂單的佣金記錄
      IF EXISTS (
        SELECT 1 FROM public.commission_records WHERE order_id = NEW.id
      ) THEN
        -- 更新現有佣金記錄（折扣碼可能已變更）
        UPDATE public.commission_records
        SET
          discount_code_id = v_discount_code.id,
          order_total = NEW.total_price,
          discount_amount = NEW.discount_amount,
          commission_rate = v_discount_code.commission_rate,
          commission_amount = v_commission_amount
        WHERE order_id = NEW.id;
        
        RAISE NOTICE '已更新訂單 % 的佣金記錄，新折扣碼: %，佣金金額: %', NEW.order_number, NEW.discount_code, v_commission_amount;
      ELSE
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
    ELSE
      -- 新折扣碼沒有佣金率，刪除舊的佣金記錄（如果有的話）
      DELETE FROM public.commission_records WHERE order_id = NEW.id;
    END IF;
  ELSE
    -- 折扣碼被清除，刪除佣金記錄
    DELETE FROM public.commission_records WHERE order_id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$function$;
