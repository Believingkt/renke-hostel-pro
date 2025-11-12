-- Create public_holidays table for managing national holidays
CREATE TABLE public.public_holidays (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  accommodation_id UUID NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  holiday_date DATE NOT NULL,
  holiday_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX idx_public_holidays_accommodation_id ON public.public_holidays(accommodation_id);
CREATE INDEX idx_public_holidays_date ON public.public_holidays(holiday_date);

-- Enable RLS
ALTER TABLE public.public_holidays ENABLE ROW LEVEL SECURITY;

-- RLS Policies for public_holidays
CREATE POLICY "Public holidays are viewable by everyone"
ON public.public_holidays
FOR SELECT
USING (true);

CREATE POLICY "Only admins can insert public holidays"
ON public.public_holidays
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND accommodation_id = public.public_holidays.accommodation_id
    AND role IN ('super_admin', 'hotel_admin')
  )
);

CREATE POLICY "Only admins can update public holidays"
ON public.public_holidays
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND accommodation_id = public.public_holidays.accommodation_id
    AND role IN ('super_admin', 'hotel_admin')
  )
);

CREATE POLICY "Only admins can delete public holidays"
ON public.public_holidays
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND accommodation_id = public.public_holidays.accommodation_id
    AND role IN ('super_admin', 'hotel_admin')
  )
);

-- Add trigger for updated_at
CREATE TRIGGER update_public_holidays_updated_at
BEFORE UPDATE ON public.public_holidays
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();