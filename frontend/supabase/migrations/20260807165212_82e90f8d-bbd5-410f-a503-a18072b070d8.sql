UPDATE public.owlting_email_orders_raw
SET status = 'processed',
    processed_at = now(),
    ingest_outcome = 'noop_modification',
    ingest_outcome_at = now(),
    ingest_outcome_detail = jsonb_build_object(
      'reason', 'manual_review',
      'note', '原始訂單與修改後內容完全相同（日期、金額、房型、數量、旅客資訊皆未變），判定為旅客更改金流付款方式',
      'existing_order_id', '64186074-de55-4d8e-967b-ce9b90744da6',
      'existing_order_number', 'PM3L28W8'
    ),
    notes = coalesce(notes || E'\n', '') || '[' || to_char(now(), 'YYYY-MM-DD') || '] 人工確認：修改通知無實質差異，沿用既有訂單 PM3L28W8，不建立新訂單。'
WHERE id = '1681a109-c554-46e1-b22f-6e7b4c0ef135';

UPDATE public.owlting_email_parsed_staging
SET review_status = 'ignored',
    modification_diff_status = 'compared',
    modification_diff = jsonb_build_object('changes', '[]'::jsonb, 'is_noop', true),
    review_notes = '人工確認：原始 vs 修改後所有欄位一致，無需異動既有訂單 PM3L28W8 (OBE67870218226072001)',
    reviewed_at = now(),
    promoted_order_id = '64186074-de55-4d8e-967b-ce9b90744da6',
    updated_at = now()
WHERE id = '2f4fc8f3-1edb-49cf-9af0-7c755d89d031';