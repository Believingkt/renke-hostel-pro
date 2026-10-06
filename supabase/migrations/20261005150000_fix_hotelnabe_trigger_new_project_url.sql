-- 遷移後修正：trigger_hotelnabe_push_worker 仍寫死舊專案（Lovable Cloud dmafqwfynatdvnaeovhz）網址，
-- 每次 hotelnabe_ari_push_queue 新增時會去叫醒「舊專案」的 worker（空跑），新專案只能靠每 5 分鐘的 cron 推送。
-- 改為呼叫新專案（opaphdargymfyrrzvozs）的 worker。
-- hotelnabe-push-inventory-worker 為 verify_jwt = false 且函式內不檢查 header，因此不需帶 apikey（也不再把 anon key 寫死在 DB 函式裡）。
CREATE OR REPLACE FUNCTION public.trigger_hotelnabe_push_worker()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Fire-and-forget async HTTP call; ignore errors so DML never fails.
  BEGIN
    PERFORM net.http_post(
      url := 'https://opaphdargymfyrrzvozs.supabase.co/functions/v1/hotelnabe-push-inventory-worker',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := jsonb_build_object('triggered_by','queue_insert','at', now())
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NULL;
END;
$$;
