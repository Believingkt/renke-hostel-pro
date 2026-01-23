-- 在 split_rules 表新增手續費百分比欄位
ALTER TABLE public.split_rules
ADD COLUMN IF NOT EXISTS transaction_fee_percentage NUMERIC(5,2) NOT NULL DEFAULT 0.00;

-- 新增欄位註解
COMMENT ON COLUMN public.split_rules.transaction_fee_percentage IS '請款時扣除的手續費百分比 (0-100)';