-- Step 3.6: pricing_templates.default_package_id as the single source of truth for template -> package mapping.

ALTER TABLE public.pricing_templates
  ADD COLUMN IF NOT EXISTS default_package_id uuid
    REFERENCES public.accommodation_packages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pricing_templates_default_package_id
  ON public.pricing_templates(default_package_id);

-- 1) Best-effort: link templates to packages by exact name within the same accommodation.
UPDATE public.pricing_templates t
SET default_package_id = p.id
FROM public.accommodation_packages p
WHERE t.default_package_id IS NULL
  AND p.accommodation_id = t.accommodation_id
  AND p.name = t.template_name;

-- 2) BEFORE INSERT/UPDATE trigger: auto-fill orders.package_id from the resolved
--    pricing_template's default_package_id. Covers every code path that writes
--    to orders (frontend booking, admin create, walk-in, edit, etc.).
CREATE OR REPLACE FUNCTION public.fn_orders_autofill_package_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tpl_id uuid;
  v_pkg_id uuid;
BEGIN
  -- Respect explicit value if caller already set package_id.
  IF NEW.package_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.meal_plan IS NULL OR NEW.meal_plan = '' THEN
    RETURN NEW;
  END IF;

  -- (a) meal_plan may store a pricing_template UUID
  IF NEW.meal_plan ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT id INTO v_tpl_id
    FROM public.pricing_templates
    WHERE id = NEW.meal_plan::uuid
      AND accommodation_id = NEW.accommodation_id;
  END IF;

  -- (b) Otherwise treat meal_plan as template_name
  IF v_tpl_id IS NULL THEN
    SELECT id INTO v_tpl_id
    FROM public.pricing_templates
    WHERE accommodation_id = NEW.accommodation_id
      AND template_name = NEW.meal_plan
    LIMIT 1;
  END IF;

  IF v_tpl_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT default_package_id INTO v_pkg_id
  FROM public.pricing_templates
  WHERE id = v_tpl_id;

  IF v_pkg_id IS NOT NULL THEN
    NEW.package_id := v_pkg_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_autofill_package_id ON public.orders;
CREATE TRIGGER trg_orders_autofill_package_id
  BEFORE INSERT OR UPDATE OF meal_plan, package_id, accommodation_id
  ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_orders_autofill_package_id();

-- 3) Re-backfill existing orders using template -> default_package_id.
--    Only fills rows that are still null (Step 3.5 already filled 51 by direct name match).
UPDATE public.orders o
SET package_id = t.default_package_id
FROM public.pricing_templates t
WHERE o.package_id IS NULL
  AND t.default_package_id IS NOT NULL
  AND t.accommodation_id = o.accommodation_id
  AND (
    (o.meal_plan ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       AND t.id = o.meal_plan::uuid)
    OR t.template_name = o.meal_plan
  );
