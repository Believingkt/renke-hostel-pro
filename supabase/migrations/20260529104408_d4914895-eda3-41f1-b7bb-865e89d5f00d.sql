
-- Backfill: re-classify message_type from subject using current keyword set.
-- Only touches rows where subject contains known keywords but message_type/status are stale.
UPDATE public.owlting_email_orders_raw
SET
  message_type = CASE
    WHEN subject ~ '取消|cancel' THEN 'cancelled'
    WHEN subject ~ '修改|變更|更改|modif' THEN 'modified'
    WHEN subject ~ '訂單成立|成立通知|新訂單|新訂房|新的訂單' THEN 'new_order'
    ELSE message_type
  END,
  status = CASE
    WHEN status = 'failed'
      AND obe_number IS NOT NULL
      AND subject ~ '取消|cancel|修改|變更|更改|modif|訂單成立|成立通知|新訂單|新訂房|新的訂單'
      THEN 'parsed'
    ELSE status
  END,
  notes = CASE
    WHEN status = 'failed'
      AND obe_number IS NOT NULL
      AND subject ~ '取消|cancel|修改|變更|更改|modif|訂單成立|成立通知|新訂單|新訂房|新的訂單'
      THEN COALESCE(notes, '') || ' [backfilled 2026-05-29: subject re-classified]'
    ELSE notes
  END
WHERE from_domain LIKE '%owlting%' OR from_domain LIKE '%owlnest%';
