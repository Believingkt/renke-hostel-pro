-- 創建函數：當訂單狀態變更時更新佣金記錄狀態
CREATE OR REPLACE FUNCTION public.update_commission_status_on_order_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- 只在訂單狀態實際改變時處理
  IF OLD.order_status IS DISTINCT FROM NEW.order_status THEN
    
    -- 當訂單狀態變為已退房時，自動核准佣金
    IF NEW.order_status = 'checked_out' THEN
      UPDATE public.commission_records
      SET 
        settlement_status = 'approved',
        settlement_date = CASE 
          WHEN settlement_date IS NULL THEN NOW()
          ELSE settlement_date
        END,
        updated_at = NOW()
      WHERE order_id = NEW.id
        AND settlement_status = 'pending';
      
      RAISE NOTICE '訂單 % 已退房，佣金記錄已自動核准', NEW.order_number;
    END IF;
    
    -- 當訂單被取消時，取消對應的佣金記錄
    IF NEW.order_status = 'cancelled' THEN
      UPDATE public.commission_records
      SET 
        settlement_status = 'cancelled',
        updated_at = NOW()
      WHERE order_id = NEW.id
        AND settlement_status != 'paid'; -- 已付款的佣金不能取消
      
      RAISE NOTICE '訂單 % 已取消，佣金記錄已自動取消', NEW.order_number;
    END IF;
    
  END IF;
  
  RETURN NEW;
END;
$$;

-- 創建觸發器：在訂單更新後執行
DROP TRIGGER IF EXISTS trigger_update_commission_on_order_change ON public.orders;

CREATE TRIGGER trigger_update_commission_on_order_change
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_commission_status_on_order_change();

-- 添加註解說明
COMMENT ON FUNCTION public.update_commission_status_on_order_change() IS '當訂單狀態變更時自動更新相關的佣金記錄狀態：已退房→核准佣金，已取消→取消佣金';
COMMENT ON TRIGGER trigger_update_commission_on_order_change ON public.orders IS '訂單狀態變更時自動更新佣金記錄狀態的觸發器';