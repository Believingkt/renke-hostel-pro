-- Fix function search path security issue
-- This prevents search_path hijacking attacks by explicitly setting the search path

-- Drop the trigger first
DROP TRIGGER IF EXISTS update_room_inventory_pricing_updated_at_trigger ON public.room_inventory_pricing;

-- Drop and recreate the function with fixed search_path
DROP FUNCTION IF EXISTS public.update_room_inventory_pricing_updated_at();

CREATE OR REPLACE FUNCTION public.update_room_inventory_pricing_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- Recreate the trigger
CREATE TRIGGER update_room_inventory_pricing_updated_at_trigger
BEFORE UPDATE ON public.room_inventory_pricing
FOR EACH ROW
EXECUTE FUNCTION public.update_room_inventory_pricing_updated_at();