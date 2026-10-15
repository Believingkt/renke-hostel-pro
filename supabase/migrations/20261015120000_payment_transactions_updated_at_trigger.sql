-- payment_transactions.updated_at 自動更新（沿用既有 public.update_updated_at_column()，只新增 trigger）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'update_payment_transactions_updated_at'
      AND tgrelid = 'public.payment_transactions'::regclass
  ) THEN
    CREATE TRIGGER update_payment_transactions_updated_at
      BEFORE UPDATE ON public.payment_transactions
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;
