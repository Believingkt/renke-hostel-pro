
-- Revoke SELECT from anon role on sensitive tables containing PII
-- RLS already blocks anon access via policy scoping, but explicit REVOKE
-- adds defense-in-depth against accidental RLS misconfiguration

REVOKE SELECT ON public.customers FROM anon;
REVOKE SELECT ON public.orders FROM anon;
REVOKE SELECT ON public.profiles FROM anon;

-- orders still needs INSERT for public bookings (already has public INSERT policy)
-- SELECT/UPDATE/DELETE on orders is already restricted to authenticated via RLS policies
