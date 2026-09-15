-- Create role enum for user permissions
CREATE TYPE public.app_role AS ENUM ('super_admin', 'hotel_admin', 'staff');

-- Create user_roles table to manage user permissions for different accommodations
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  accommodation_id UUID REFERENCES public.accommodation_info(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'staff',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, accommodation_id)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check if user has access to accommodation
CREATE OR REPLACE FUNCTION public.user_has_access_to_accommodation(_user_id UUID, _accommodation_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND accommodation_id = _accommodation_id
  ) OR EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'super_admin'
  );
$$;

-- Create function to check if user has specific role for accommodation
CREATE OR REPLACE FUNCTION public.user_has_role(_user_id UUID, _accommodation_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND accommodation_id = _accommodation_id
      AND role = _role
  ) OR EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'super_admin'
  );
$$;

-- Create function to get user's accommodations
CREATE OR REPLACE FUNCTION public.get_user_accommodations(_user_id UUID)
RETURNS TABLE (
  accommodation_id UUID,
  role app_role
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT accommodation_id, role
  FROM public.user_roles
  WHERE user_id = _user_id;
$$;

-- RLS policies for user_roles table
CREATE POLICY "Users can view their own roles"
  ON public.user_roles
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage roles"
  ON public.user_roles
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND (ur.role = 'super_admin' OR ur.role = 'hotel_admin')
    )
  );

-- Update RLS policies for accommodation_info
DROP POLICY IF EXISTS "Authenticated users can update accommodation info" ON public.accommodation_info;
CREATE POLICY "Users with access can update accommodation info"
  ON public.accommodation_info
  FOR UPDATE
  USING (public.user_has_access_to_accommodation(auth.uid(), id))
  WITH CHECK (public.user_has_access_to_accommodation(auth.uid(), id));

-- Update RLS policies for accommodation_facilities
DROP POLICY IF EXISTS "Authenticated users can insert facilities" ON public.accommodation_facilities;
DROP POLICY IF EXISTS "Authenticated users can update facilities" ON public.accommodation_facilities;
DROP POLICY IF EXISTS "Authenticated users can delete facilities" ON public.accommodation_facilities;

CREATE POLICY "Users with access can insert facilities"
  ON public.accommodation_facilities
  FOR INSERT
  WITH CHECK (public.user_has_access_to_accommodation(auth.uid(), accommodation_id));

CREATE POLICY "Users with access can update facilities"
  ON public.accommodation_facilities
  FOR UPDATE
  USING (public.user_has_access_to_accommodation(auth.uid(), accommodation_id))
  WITH CHECK (public.user_has_access_to_accommodation(auth.uid(), accommodation_id));

CREATE POLICY "Users with access can delete facilities"
  ON public.accommodation_facilities
  FOR DELETE
  USING (public.user_has_access_to_accommodation(auth.uid(), accommodation_id));

-- Update RLS policies for booking_settings
DROP POLICY IF EXISTS "Authenticated users can update booking settings" ON public.booking_settings;
CREATE POLICY "Users with access can update booking settings"
  ON public.booking_settings
  FOR UPDATE
  USING (public.user_has_access_to_accommodation(auth.uid(), accommodation_id))
  WITH CHECK (public.user_has_access_to_accommodation(auth.uid(), accommodation_id));

-- Update RLS policies for location_info
DROP POLICY IF EXISTS "Authenticated users can insert location info" ON public.location_info;
DROP POLICY IF EXISTS "Authenticated users can update location info" ON public.location_info;

CREATE POLICY "Users with access can insert location info"
  ON public.location_info
  FOR INSERT
  WITH CHECK (public.user_has_access_to_accommodation(auth.uid(), accommodation_id));

CREATE POLICY "Users with access can update location info"
  ON public.location_info
  FOR UPDATE
  USING (public.user_has_access_to_accommodation(auth.uid(), accommodation_id))
  WITH CHECK (public.user_has_access_to_accommodation(auth.uid(), accommodation_id));

-- Update RLS policies for FAQs
DROP POLICY IF EXISTS "Authenticated users can insert FAQs" ON public.faqs;
DROP POLICY IF EXISTS "Authenticated users can update FAQs" ON public.faqs;
DROP POLICY IF EXISTS "Authenticated users can delete FAQs" ON public.faqs;

CREATE POLICY "Users with access can insert FAQs"
  ON public.faqs
  FOR INSERT
  WITH CHECK (public.user_has_access_to_accommodation(auth.uid(), accommodation_id));

CREATE POLICY "Users with access can update FAQs"
  ON public.faqs
  FOR UPDATE
  USING (public.user_has_access_to_accommodation(auth.uid(), accommodation_id))
  WITH CHECK (public.user_has_access_to_accommodation(auth.uid(), accommodation_id));

CREATE POLICY "Users with access can delete FAQs"
  ON public.faqs
  FOR DELETE
  USING (public.user_has_access_to_accommodation(auth.uid(), accommodation_id));

-- Create trigger for user_roles updated_at
CREATE TRIGGER update_user_roles_updated_at
  BEFORE UPDATE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();