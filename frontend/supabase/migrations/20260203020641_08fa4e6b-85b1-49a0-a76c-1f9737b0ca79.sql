-- Tighten access to user profiles and ensure only authenticated users/admins can read them
-- (Hardening against accidental exposure via views or misconfiguration)

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Remove duplicated/over-broad policies (we re-create with explicit role scoping)
DROP POLICY IF EXISTS "Hotel admins can view profiles in their accommodation" ON public.profiles;
DROP POLICY IF EXISTS "Super admins can view profiles in their accommodation" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- Users can read their own profile
CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Hotel admins can view profiles of users who share an accommodation with them
CREATE POLICY "Hotel admins can view profiles in their accommodation"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur_admin
    WHERE ur_admin.user_id = auth.uid()
      AND ur_admin.role = 'hotel_admin'::public.app_role
      AND EXISTS (
        SELECT 1
        FROM public.user_roles ur_target
        WHERE ur_target.user_id = public.profiles.id
          AND ur_target.accommodation_id = ur_admin.accommodation_id
      )
  )
);

-- Super admins can view all profiles
CREATE POLICY "Super admins can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur_admin
    WHERE ur_admin.user_id = auth.uid()
      AND ur_admin.role = 'super_admin'::public.app_role
  )
);
