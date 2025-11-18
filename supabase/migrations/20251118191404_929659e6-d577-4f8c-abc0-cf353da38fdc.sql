-- 修改資料庫觸發器，確保在訂單創建時立即創建佣金記錄
DROP TRIGGER IF EXISTS trigger_create_commission_on_order_insert ON public.orders;

CREATE TRIGGER trigger_create_commission_on_order_insert
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.create_commission_record();

-- 添加註解
COMMENT ON TRIGGER trigger_create_commission_on_order_insert ON public.orders IS '訂單創建時自動創建佣金記錄的觸發器';