INSERT INTO public.staff_module_permissions (user_id, accommodation_id, module_key, permission_level)
SELECT p.user_id, p.accommodation_id, 'group_buy', p.permission_level
FROM public.staff_module_permissions p
WHERE p.module_key = 'orders'
ON CONFLICT (user_id, accommodation_id, module_key) DO NOTHING;

INSERT INTO public.staff_module_permissions (user_id, accommodation_id, module_key, permission_level)
SELECT p.user_id, p.accommodation_id, 'payment_audit', p.permission_level
FROM public.staff_module_permissions p
WHERE p.module_key = 'owner_settlement'
ON CONFLICT (user_id, accommodation_id, module_key) DO NOTHING;