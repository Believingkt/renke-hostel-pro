BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true) \g /dev/null
SELECT 'red_ok=' || (public.wizard_precheck('00000000-0000-0000-0000-00000000000a') ->> 'red_ok')
  || '；未通過=' || COALESCE((SELECT string_agg(e ->> 'key', ',') FROM jsonb_array_elements(public.wizard_precheck('00000000-0000-0000-0000-00000000000a') -> 'red') e WHERE (e ->> 'ok')::boolean IS NOT TRUE), '無')
  || '；送審不勾 OTA → ' || (SELECT CASE WHEN true THEN '（見下一行）' END);
ROLLBACK;
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true) \g /dev/null
\set ON_ERROR_STOP 0
SELECT public.wizard_submit('00000000-0000-0000-0000-00000000000a', false);
ROLLBACK;
