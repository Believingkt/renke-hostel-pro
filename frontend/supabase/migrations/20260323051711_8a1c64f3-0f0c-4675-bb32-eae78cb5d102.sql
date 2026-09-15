
CREATE OR REPLACE FUNCTION public.generate_order_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_order_number text;
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  digits text := '23456789';
  i integer;
  attempts integer := 0;
BEGIN
  LOOP
    -- Format: [Letter][Letter][Digit][Letter][Digit][Digit][Letter][Digit]
    -- Example: RK5M72B9 — looks random, 8 chars
    new_order_number := '';
    
    -- Mix letters and digits in a non-obvious pattern
    new_order_number := new_order_number || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    new_order_number := new_order_number || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    new_order_number := new_order_number || substr(digits, floor(random() * length(digits) + 1)::int, 1);
    new_order_number := new_order_number || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    new_order_number := new_order_number || substr(digits, floor(random() * length(digits) + 1)::int, 1);
    new_order_number := new_order_number || substr(digits, floor(random() * length(digits) + 1)::int, 1);
    new_order_number := new_order_number || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    new_order_number := new_order_number || substr(digits, floor(random() * length(digits) + 1)::int, 1);
    
    -- Check uniqueness
    IF NOT EXISTS (SELECT 1 FROM public.orders WHERE order_number = new_order_number) THEN
      RETURN new_order_number;
    END IF;
    
    attempts := attempts + 1;
    IF attempts > 100 THEN
      RAISE EXCEPTION 'Unable to generate unique order number after 100 attempts';
    END IF;
  END LOOP;
END;
$function$;
