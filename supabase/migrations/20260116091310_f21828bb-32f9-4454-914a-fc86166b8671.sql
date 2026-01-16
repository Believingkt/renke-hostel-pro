-- 擴展 split_records 表以支援完整請款流程
-- settlement_status 狀態變更：pending → requested → approved → paid

-- 新增請款相關欄位
ALTER TABLE public.split_records
ADD COLUMN IF NOT EXISTS requested_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS requested_by UUID,
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS approved_by UUID,
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS payment_method TEXT,
ADD COLUMN IF NOT EXISTS payment_reference TEXT;

-- 更新 settlement_status 欄位說明
COMMENT ON COLUMN public.split_records.settlement_status IS '結算狀態：pending=待請款, requested=已請款, approved=已審核, paid=已撥款';

-- 更新 RLS 策略 - 允許民宿管理員提交請款申請（更新 settlement_status 為 requested）
CREATE POLICY "Hotel admins can request settlement"
  ON public.split_records FOR UPDATE
  USING (user_has_access_to_accommodation(auth.uid(), accommodation_id))
  WITH CHECK (
    user_has_access_to_accommodation(auth.uid(), accommodation_id) 
    AND settlement_status IN ('requested')
  );

-- 新增索引以優化查詢
CREATE INDEX IF NOT EXISTS idx_split_records_requested_at ON public.split_records(requested_at);
CREATE INDEX IF NOT EXISTS idx_split_records_paid_at ON public.split_records(paid_at);