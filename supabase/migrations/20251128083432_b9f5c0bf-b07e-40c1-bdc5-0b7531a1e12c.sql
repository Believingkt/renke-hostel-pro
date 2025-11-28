-- Create pricing rules table for automatic price application based on day types
CREATE TABLE public.pricing_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  accommodation_id UUID NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  room_type_id UUID NOT NULL REFERENCES public.room_types(id) ON DELETE CASCADE,
  rule_name TEXT NOT NULL,
  day_type TEXT NOT NULL CHECK (day_type IN ('weekday', 'weekend', 'holiday', 'compensatory_day_off', 'work_on_weekend')),
  price INTEGER,
  price_2_meals INTEGER,
  price_3_meals INTEGER,
  available_rooms INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pricing_rules IS 'Automatic pricing rules based on day types';
COMMENT ON COLUMN public.pricing_rules.day_type IS 'Type of day: weekday (平日), weekend (週末), holiday (國定假日), compensatory_day_off (補休), work_on_weekend (補班)';
COMMENT ON COLUMN public.pricing_rules.priority IS 'Higher priority rules override lower priority ones';

-- Create index for better query performance
CREATE INDEX idx_pricing_rules_accommodation_room ON public.pricing_rules(accommodation_id, room_type_id);
CREATE INDEX idx_pricing_rules_active ON public.pricing_rules(is_active) WHERE is_active = true;

-- Add updated_at trigger
CREATE TRIGGER update_pricing_rules_updated_at
  BEFORE UPDATE ON public.pricing_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies
ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active pricing rules"
  ON public.pricing_rules
  FOR SELECT
  USING (is_active = true);

CREATE POLICY "Only admins can insert pricing rules"
  ON public.pricing_rules
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM room_types rt
      WHERE rt.id = pricing_rules.room_type_id
      AND (
        user_has_role(auth.uid(), rt.accommodation_id, 'super_admin'::app_role)
        OR user_has_role(auth.uid(), rt.accommodation_id, 'hotel_admin'::app_role)
      )
    )
  );

CREATE POLICY "Only admins can update pricing rules"
  ON public.pricing_rules
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM room_types rt
      WHERE rt.id = pricing_rules.room_type_id
      AND (
        user_has_role(auth.uid(), rt.accommodation_id, 'super_admin'::app_role)
        OR user_has_role(auth.uid(), rt.accommodation_id, 'hotel_admin'::app_role)
      )
    )
  );

CREATE POLICY "Only admins can delete pricing rules"
  ON public.pricing_rules
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM room_types rt
      WHERE rt.id = pricing_rules.room_type_id
      AND (
        user_has_role(auth.uid(), rt.accommodation_id, 'super_admin'::app_role)
        OR user_has_role(auth.uid(), rt.accommodation_id, 'hotel_admin'::app_role)
      )
    )
  );
