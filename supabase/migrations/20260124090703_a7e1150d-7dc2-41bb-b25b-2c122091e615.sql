-- Harden SECURITY DEFINER functions with explicit authorization checks to prevent misuse.

-- 1) user_has_role: restrict cross-user queries to super_admin only; require auth.
CREATE OR REPLACE FUNCTION public.user_has_role(
  _user_id uuid,
  _accommodation_id uuid,
  _role public.app_role
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Require authenticated caller
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  -- Only super_admin may query another user's roles
  IF _user_id IS DISTINCT FROM auth.uid() THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.user_roles me
      WHERE me.user_id = auth.uid()
        AND me.role = 'super_admin'::public.app_role
    ) THEN
      RETURN false;
    END IF;
  END IF;

  RETURN (
    EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = _user_id
        AND accommodation_id = _accommodation_id
        AND role = _role
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = _user_id
        AND role = 'super_admin'::public.app_role
    )
  );
END;
$$;

-- 2) user_has_access_to_accommodation: restrict cross-user queries; require auth.
CREATE OR REPLACE FUNCTION public.user_has_access_to_accommodation(
  _user_id uuid,
  _accommodation_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  IF _user_id IS DISTINCT FROM auth.uid() THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.user_roles me
      WHERE me.user_id = auth.uid()
        AND me.role = 'super_admin'::public.app_role
    ) THEN
      RETURN false;
    END IF;
  END IF;

  RETURN (
    EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = _user_id
        AND accommodation_id = _accommodation_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = _user_id
        AND role = 'super_admin'::public.app_role
    )
  );
END;
$$;

-- 3) is_user_admin: require auth; restrict cross-user queries.
CREATE OR REPLACE FUNCTION public.is_user_admin(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  IF _user_id IS DISTINCT FROM auth.uid() THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.user_roles me
      WHERE me.user_id = auth.uid()
        AND me.role = 'super_admin'::public.app_role
    ) THEN
      RETURN false;
    END IF;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('super_admin'::public.app_role, 'hotel_admin'::public.app_role)
  );
END;
$$;

-- 4) is_admin: require auth; restrict cross-user queries.
CREATE OR REPLACE FUNCTION public.is_admin(user_id_param uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  IF user_id_param IS DISTINCT FROM auth.uid() THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.user_roles me
      WHERE me.user_id = auth.uid()
        AND me.role = 'super_admin'::public.app_role
    ) THEN
      RETURN false;
    END IF;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = user_id_param
      AND role IN ('super_admin'::public.app_role, 'hotel_admin'::public.app_role)
  );
END;
$$;

-- 5) user_has_storage_access: require auth.
CREATE OR REPLACE FUNCTION public.user_has_storage_access(file_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND (
        accommodation_id::text = split_part(file_path, '/', 1)
        OR role = 'super_admin'::public.app_role
      )
  );
$$;

-- 6) can_view_user_roles: require auth.
CREATE OR REPLACE FUNCTION public.can_view_user_roles(_accommodation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = auth.uid()
        AND accommodation_id = _accommodation_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role = 'super_admin'::public.app_role
    )
  );
$$;

-- 7) check_rls_enabled: restrict to super_admin only.
CREATE OR REPLACE FUNCTION public.check_rls_enabled()
RETURNS TABLE(table_name text, rls_enabled boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'super_admin'::public.app_role
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT 
    relname::text AS table_name,
    relrowsecurity AS rls_enabled
  FROM pg_class
  WHERE relnamespace = 'public'::regnamespace
    AND relkind = 'r'
  ORDER BY relname;
END;
$$;

-- 8) get_discount_code_secrets: restrict to admins of the discount code's accommodation.
CREATE OR REPLACE FUNCTION public.get_discount_code_secrets(p_discount_code_id uuid)
RETURNS TABLE(api_key text, webhook_url text, webhook_secret text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_accommodation_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT dc.accommodation_id
  INTO v_accommodation_id
  FROM public.discount_codes dc
  WHERE dc.id = p_discount_code_id;

  IF v_accommodation_id IS NULL THEN
    RAISE EXCEPTION 'Discount code not found';
  END IF;

  IF NOT (
    public.user_has_role(auth.uid(), v_accommodation_id, 'super_admin'::public.app_role)
    OR public.user_has_role(auth.uid(), v_accommodation_id, 'hotel_admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT s.api_key, s.webhook_url, s.webhook_secret
  FROM public.discount_code_secrets s
  WHERE s.discount_code_id = p_discount_code_id;
END;
$$;
