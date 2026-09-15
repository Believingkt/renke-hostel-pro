-- room_units: allow staff with editable "room_price" module to manage units
CREATE POLICY "Room price editors can insert room_units"
ON public.room_units FOR INSERT TO authenticated
WITH CHECK (staff_can_edit_module(accommodation_id, 'room_price'::text));

CREATE POLICY "Room price editors can update room_units"
ON public.room_units FOR UPDATE TO authenticated
USING (staff_can_edit_module(accommodation_id, 'room_price'::text))
WITH CHECK (staff_can_edit_module(accommodation_id, 'room_price'::text));

CREATE POLICY "Room price editors can delete room_units"
ON public.room_units FOR DELETE TO authenticated
USING (staff_can_edit_module(accommodation_id, 'room_price'::text));

-- pricing_template_availability: align with pricing_templates (room_price module)
CREATE POLICY "Room price editors manage template availability"
ON public.pricing_template_availability FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.pricing_templates pt
  WHERE pt.id = pricing_template_availability.template_id
    AND staff_can_edit_module(pt.accommodation_id, 'room_price'::text)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.pricing_templates pt
  WHERE pt.id = pricing_template_availability.template_id
    AND staff_can_edit_module(pt.accommodation_id, 'room_price'::text)
));