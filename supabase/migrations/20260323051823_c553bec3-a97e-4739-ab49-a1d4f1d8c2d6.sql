
DO $$
DECLARE
  rec RECORD;
  new_num text;
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  digits text := '23456789';
  attempts integer;
BEGIN
  FOR rec IN SELECT id FROM public.orders ORDER BY created_at LOOP
    attempts := 0;
    LOOP
      new_num := '';
      new_num := new_num || substr(chars, floor(random() * length(chars) + 1)::int, 1);
      new_num := new_num || substr(chars, floor(random() * length(chars) + 1)::int, 1);
      new_num := new_num || substr(digits, floor(random() * length(digits) + 1)::int, 1);
      new_num := new_num || substr(chars, floor(random() * length(chars) + 1)::int, 1);
      new_num := new_num || substr(digits, floor(random() * length(digits) + 1)::int, 1);
      new_num := new_num || substr(digits, floor(random() * length(digits) + 1)::int, 1);
      new_num := new_num || substr(chars, floor(random() * length(chars) + 1)::int, 1);
      new_num := new_num || substr(digits, floor(random() * length(digits) + 1)::int, 1);

      IF NOT EXISTS (SELECT 1 FROM public.orders WHERE order_number = new_num) THEN
        UPDATE public.orders SET order_number = new_num WHERE id = rec.id;
        EXIT;
      END IF;

      attempts := attempts + 1;
      IF attempts > 100 THEN
        RAISE EXCEPTION 'Failed to generate unique order number for order %', rec.id;
      END IF;
    END LOOP;
  END LOOP;
END $$;
