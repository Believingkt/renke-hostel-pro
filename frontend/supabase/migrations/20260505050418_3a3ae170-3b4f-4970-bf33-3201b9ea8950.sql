ALTER TABLE public.booking_settings 
  ADD COLUMN IF NOT EXISTS bank_account_info text;
COMMENT ON COLUMN public.booking_settings.bank_account_info IS '轉帳匯款帳號資訊（顯示於前台付款步驟）';