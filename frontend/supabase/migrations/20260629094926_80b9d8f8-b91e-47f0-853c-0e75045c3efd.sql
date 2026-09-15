
-- Add mapping_meta to push log for outbound canonical mapping audit
ALTER TABLE public.owlting_order_push_log
  ADD COLUMN IF NOT EXISTS mapping_meta jsonb;

-- C1: a room_type can only ever be a member of ONE group
ALTER TABLE public.owlting_room_type_group_members
  DROP CONSTRAINT IF EXISTS owlting_room_type_group_members_room_type_id_key;
ALTER TABLE public.owlting_room_type_group_members
  ADD CONSTRAINT owlting_room_type_group_members_room_type_id_key UNIQUE (room_type_id);

-- C2+C3: validate accommodation consistency + canonical-not-member rule
CREATE OR REPLACE FUNCTION public.validate_owlting_group_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_acc uuid;
  v_canonical uuid;
  v_canonical_acc uuid;
  v_member_room_acc uuid;
  v_member_tpl_acc uuid;
BEGIN
  SELECT g.accommodation_id, g.canonical_room_type_id
    INTO v_group_acc, v_canonical
  FROM public.owlting_room_type_groups g
  WHERE g.id = NEW.group_id;

  IF v_group_acc IS NULL THEN
    RAISE EXCEPTION 'group % not found', NEW.group_id;
  END IF;

  SELECT accommodation_id INTO v_canonical_acc FROM public.room_types WHERE id = v_canonical;
  SELECT accommodation_id INTO v_member_room_acc FROM public.room_types WHERE id = NEW.room_type_id;
  SELECT accommodation_id INTO v_member_tpl_acc  FROM public.pricing_templates WHERE id = NEW.rate_plan_template_id;

  IF v_canonical_acc <> v_group_acc THEN
    RAISE EXCEPTION 'canonical room_type accommodation mismatch';
  END IF;
  IF v_member_room_acc <> v_group_acc THEN
    RAISE EXCEPTION 'member room_type accommodation mismatch (member=% group=%)', v_member_room_acc, v_group_acc;
  END IF;
  IF v_member_tpl_acc <> v_group_acc THEN
    RAISE EXCEPTION 'member rate_plan_template accommodation mismatch';
  END IF;

  -- canonical of this group cannot be a member of ANY group
  IF EXISTS (
    SELECT 1 FROM public.owlting_room_type_group_members m
    WHERE m.room_type_id = v_canonical
  ) THEN
    RAISE EXCEPTION 'canonical room_type % cannot also be a member of any group', v_canonical;
  END IF;

  -- this new member room_type cannot itself be a canonical of any group
  IF EXISTS (
    SELECT 1 FROM public.owlting_room_type_groups g2
    WHERE g2.canonical_room_type_id = NEW.room_type_id
      AND g2.id <> NEW.group_id
  ) THEN
    -- allow when this member IS the canonical of its own group (canonical-as-member identity)
    -- but per spec we forbid this entirely
    RAISE EXCEPTION 'room_type % is canonical of another group; cannot be a member', NEW.room_type_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_owlting_group_member ON public.owlting_room_type_group_members;
CREATE TRIGGER trg_validate_owlting_group_member
  BEFORE INSERT OR UPDATE ON public.owlting_room_type_group_members
  FOR EACH ROW EXECUTE FUNCTION public.validate_owlting_group_member();

-- also validate when group canonical changes
CREATE OR REPLACE FUNCTION public.validate_owlting_group_canonical()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_canonical_acc uuid;
BEGIN
  SELECT accommodation_id INTO v_canonical_acc FROM public.room_types WHERE id = NEW.canonical_room_type_id;
  IF v_canonical_acc IS NULL THEN
    RAISE EXCEPTION 'canonical room_type % not found', NEW.canonical_room_type_id;
  END IF;
  IF v_canonical_acc <> NEW.accommodation_id THEN
    RAISE EXCEPTION 'canonical room_type accommodation mismatch';
  END IF;
  -- canonical must not be a member of any group
  IF EXISTS (
    SELECT 1 FROM public.owlting_room_type_group_members m
    WHERE m.room_type_id = NEW.canonical_room_type_id
  ) THEN
    RAISE EXCEPTION 'canonical room_type % is already a member of a group', NEW.canonical_room_type_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_owlting_group_canonical ON public.owlting_room_type_groups;
CREATE TRIGGER trg_validate_owlting_group_canonical
  BEFORE INSERT OR UPDATE ON public.owlting_room_type_groups
  FOR EACH ROW EXECUTE FUNCTION public.validate_owlting_group_canonical();
