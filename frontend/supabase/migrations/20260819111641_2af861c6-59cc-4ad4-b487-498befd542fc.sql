DELETE FROM public.order_rooms WHERE order_id IN (SELECT id FROM public.orders WHERE notes ILIKE '%DEMO_SEED%');
DELETE FROM public.orders WHERE notes ILIKE '%DEMO_SEED%';
DELETE FROM public.kol_referrals WHERE invite_code ILIKE 'DEMO%';
DELETE FROM public.discount_code_secrets WHERE discount_code_id IN (SELECT id FROM public.discount_codes WHERE code ILIKE 'DEMO%');
DELETE FROM public.scout_discount_codes WHERE discount_code ILIKE 'DEMO%';
DELETE FROM public.discount_codes WHERE code ILIKE 'DEMO%';
DELETE FROM public.kol_profiles WHERE name ILIKE '示範%';