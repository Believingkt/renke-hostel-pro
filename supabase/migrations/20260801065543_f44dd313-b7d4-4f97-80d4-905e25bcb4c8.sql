CREATE TABLE public.package_date_price_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id uuid NOT NULL,
  package_id uuid NOT NULL,
  date date NOT NULL,
  action text NOT NULL CHECK (action IN ('create','update','delete')),
  old_sale_price numeric,
  new_sale_price numeric,
  old_original_price numeric,
  new_original_price numeric,
  note text,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pdpl_acc_created ON public.package_date_price_logs (accommodation_id, created_at DESC);
CREATE INDEX idx_pdpl_pkg_date ON public.package_date_price_logs (package_id, date);

GRANT SELECT ON public.package_date_price_logs TO authenticated;
GRANT ALL ON public.package_date_price_logs TO service_role;

ALTER TABLE public.package_date_price_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view package date price logs"
ON public.package_date_price_logs FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.is_hotel_admin_of(accommodation_id)
  OR public.staff_can_view_module(accommodation_id, 'pricing')
);

CREATE OR REPLACE FUNCTION public.log_package_date_price_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.package_date_price_logs (accommodation_id, package_id, date, action, new_sale_price, new_original_price, note, changed_by)
    VALUES (NEW.accommodation_id, NEW.package_id, NEW.date, 'create', NEW.sale_price, NEW.original_price, NEW.note, auth.uid());
    RETURN NEW;
  ELSIF (TG_OP = 'UPDATE') THEN
    IF (NEW.sale_price IS DISTINCT FROM OLD.sale_price
        OR NEW.original_price IS DISTINCT FROM OLD.original_price
        OR NEW.note IS DISTINCT FROM OLD.note) THEN
      INSERT INTO public.package_date_price_logs (accommodation_id, package_id, date, action, old_sale_price, new_sale_price, old_original_price, new_original_price, note, changed_by)
      VALUES (NEW.accommodation_id, NEW.package_id, NEW.date, 'update', OLD.sale_price, NEW.sale_price, OLD.original_price, NEW.original_price, NEW.note, auth.uid());
    END IF;
    RETURN NEW;
  ELSE
    INSERT INTO public.package_date_price_logs (accommodation_id, package_id, date, action, old_sale_price, old_original_price, note, changed_by)
    VALUES (OLD.accommodation_id, OLD.package_id, OLD.date, 'delete', OLD.sale_price, OLD.original_price, OLD.note, auth.uid());
    RETURN OLD;
  END IF;
END;
$$;

CREATE TRIGGER trg_log_package_date_price_change
AFTER INSERT OR UPDATE OR DELETE ON public.package_date_prices
FOR EACH ROW EXECUTE FUNCTION public.log_package_date_price_change();