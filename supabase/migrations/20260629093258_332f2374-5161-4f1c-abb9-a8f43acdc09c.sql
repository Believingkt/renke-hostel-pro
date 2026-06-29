
CREATE TABLE public.owlting_room_type_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id uuid NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  canonical_room_type_id uuid NOT NULL REFERENCES public.room_types(id) ON DELETE CASCADE,
  canonical_name text NOT NULL,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (accommodation_id, canonical_room_type_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.owlting_room_type_groups TO authenticated;
GRANT ALL ON public.owlting_room_type_groups TO service_role;
ALTER TABLE public.owlting_room_type_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_manage_owlting_groups"
  ON public.owlting_room_type_groups FOR ALL
  TO authenticated
  USING (public.user_has_role(auth.uid(), accommodation_id, 'super_admin'::public.app_role)
      OR public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::public.app_role))
  WITH CHECK (public.user_has_role(auth.uid(), accommodation_id, 'super_admin'::public.app_role)
      OR public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::public.app_role));

CREATE TABLE public.owlting_room_type_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.owlting_room_type_groups(id) ON DELETE CASCADE,
  room_type_id uuid NOT NULL REFERENCES public.room_types(id) ON DELETE CASCADE,
  rate_plan_template_id uuid NOT NULL REFERENCES public.pricing_templates(id) ON DELETE CASCADE,
  rate_plan_name text NOT NULL,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, room_type_id),
  UNIQUE (group_id, rate_plan_template_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.owlting_room_type_group_members TO authenticated;
GRANT ALL ON public.owlting_room_type_group_members TO service_role;
ALTER TABLE public.owlting_room_type_group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_manage_owlting_group_members"
  ON public.owlting_room_type_group_members FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.owlting_room_type_groups g
    WHERE g.id = group_id
      AND (public.user_has_role(auth.uid(), g.accommodation_id, 'super_admin'::public.app_role)
        OR public.user_has_role(auth.uid(), g.accommodation_id, 'hotel_admin'::public.app_role))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.owlting_room_type_groups g
    WHERE g.id = group_id
      AND (public.user_has_role(auth.uid(), g.accommodation_id, 'super_admin'::public.app_role)
        OR public.user_has_role(auth.uid(), g.accommodation_id, 'hotel_admin'::public.app_role))
  ));

CREATE INDEX idx_owlting_group_members_group ON public.owlting_room_type_group_members(group_id);
CREATE INDEX idx_owlting_groups_acc ON public.owlting_room_type_groups(accommodation_id);

CREATE TRIGGER trg_owlting_groups_updated
  BEFORE UPDATE ON public.owlting_room_type_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_owlting_group_members_updated
  BEFORE UPDATE ON public.owlting_room_type_group_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DO $$
DECLARE
  v_acc uuid;
  v_grp uuid;
  v_rt_18 uuid := '0b66c218-d211-4bb2-83f3-745d8205eb67';
  v_rt_16 uuid := '83f6c7b7-b30d-4c54-ac01-5ddd02c31275';
  v_rt_14 uuid := '958731dc-54d2-4087-b116-4b967a4923cf';
  v_rt_12 uuid := '57861c83-09ae-4366-9ad5-56c0d511bbf3';
  v_pt_18 uuid := '5be61ac0-e9ce-44ca-825c-e00d3d992e4c';
  v_pt_16 uuid := '7bf4151a-0c46-461b-ac86-a3809b1fd41f';
  v_pt_14 uuid := '0330da2f-ea46-4510-ba10-acc6310dd6b6';
  v_pt_12 uuid := '14b063fb-87ff-4319-99a0-abd295f9e583';
BEGIN
  SELECT accommodation_id INTO v_acc FROM public.room_types WHERE id = v_rt_18;
  INSERT INTO public.owlting_room_type_groups (accommodation_id, canonical_room_type_id, canonical_name, display_order)
  VALUES (v_acc, v_rt_18, '包區', 0)
  RETURNING id INTO v_grp;

  INSERT INTO public.owlting_room_type_group_members (group_id, room_type_id, rate_plan_template_id, rate_plan_name, display_order)
  VALUES
    (v_grp, v_rt_12, v_pt_12, '12人・一泊二食', 1),
    (v_grp, v_rt_14, v_pt_14, '14人・一泊二食', 2),
    (v_grp, v_rt_16, v_pt_16, '16人・一泊二食', 3),
    (v_grp, v_rt_18, v_pt_18, '18人・一泊二食', 4);
END $$;
