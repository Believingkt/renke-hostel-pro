
REVOKE EXECUTE ON FUNCTION public.verify_owlting_service_account(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_room_type_by_numeric_code(UUID, BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_pricing_template_by_numeric_code(UUID, BIGINT) FROM PUBLIC, anon, authenticated;
