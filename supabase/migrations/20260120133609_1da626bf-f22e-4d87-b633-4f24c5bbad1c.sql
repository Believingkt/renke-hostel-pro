-- Security Fix: Isolate API credentials from discount_codes table
-- Create a separate secure table for discount code secrets with stricter access controls

-- 1. Create the discount_code_secrets table
CREATE TABLE IF NOT EXISTS public.discount_code_secrets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  discount_code_id uuid NOT NULL UNIQUE REFERENCES public.discount_codes(id) ON DELETE CASCADE,
  api_key text NULL,
  webhook_url text NULL,
  webhook_secret text NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 2. Enable RLS on the new table
ALTER TABLE public.discount_code_secrets ENABLE ROW LEVEL SECURITY;

-- 3. Create strict RLS policies - ONLY super_admin can access secrets
-- SELECT: Only super_admin can view secrets
CREATE POLICY "Only super_admin can view discount code secrets"
  ON public.discount_code_secrets
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'super_admin'
    )
  );

-- INSERT: Only super_admin can create secrets
CREATE POLICY "Only super_admin can create discount code secrets"
  ON public.discount_code_secrets
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'super_admin'
    )
  );

-- UPDATE: Only super_admin can update secrets
CREATE POLICY "Only super_admin can update discount code secrets"
  ON public.discount_code_secrets
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'super_admin'
    )
  );

-- DELETE: Only super_admin can delete secrets
CREATE POLICY "Only super_admin can delete discount code secrets"
  ON public.discount_code_secrets
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'super_admin'
    )
  );

-- 4. Migrate existing secrets from discount_codes to the new table
INSERT INTO public.discount_code_secrets (discount_code_id, api_key, webhook_url, webhook_secret, created_at, updated_at)
SELECT id, api_key, webhook_url, webhook_secret, now(), now()
FROM public.discount_codes
WHERE api_key IS NOT NULL OR webhook_url IS NOT NULL OR webhook_secret IS NOT NULL
ON CONFLICT (discount_code_id) DO NOTHING;

-- 5. Create trigger to auto-create secrets record when discount code is created
CREATE OR REPLACE FUNCTION public.create_discount_code_secrets()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.discount_code_secrets (discount_code_id, created_at, updated_at)
  VALUES (NEW.id, now(), now())
  ON CONFLICT (discount_code_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_create_discount_code_secrets ON public.discount_codes;

CREATE TRIGGER trigger_create_discount_code_secrets
  AFTER INSERT ON public.discount_codes
  FOR EACH ROW
  EXECUTE FUNCTION public.create_discount_code_secrets();

-- 6. Create a security definer function for edge functions to access secrets
-- Edge functions use service role key which bypasses RLS, but this provides a clean API
CREATE OR REPLACE FUNCTION public.get_discount_code_secrets(p_discount_code_id uuid)
RETURNS TABLE (
  api_key text,
  webhook_url text,
  webhook_secret text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT s.api_key, s.webhook_url, s.webhook_secret
  FROM public.discount_code_secrets s
  WHERE s.discount_code_id = p_discount_code_id;
END;
$$;

-- 7. Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_discount_code_secrets(uuid) TO authenticated;

-- 8. Create updated_at trigger for the secrets table
CREATE TRIGGER update_discount_code_secrets_updated_at
  BEFORE UPDATE ON public.discount_code_secrets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();