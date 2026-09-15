-- Allow inserting historical test orders for analytics seeding
-- We treat orders with order_source = 'test' (or 'test_data') as seed data.

CREATE OR REPLACE FUNCTION public.validate_order_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_type RECORD;
  v_discount_result RECORD;
  v_calculated_discount INT := 0;
  v_day_price INT;
  v_calculated_total INT := 0;
  v_current_date DATE;
  v_inventory RECORD;
  v_nights INT;
BEGIN
  -- 1. Basic input validation
  IF NEW.guest_name IS NULL OR LENGTH(TRIM(NEW.guest_name)) < 1 THEN
    RAISE EXCEPTION 'Guest name is required';
  END IF;
  
  IF NEW.guest_phone IS NULL OR LENGTH(TRIM(NEW.guest_phone)) < 8 THEN
    RAISE EXCEPTION 'Valid phone number is required';
  END IF;
  
  IF NEW.check_in_date IS NULL OR NEW.check_out_date IS NULL THEN
    RAISE EXCEPTION 'Check-in and check-out dates are required';
  END IF;
  
  IF NEW.check_out_date <= NEW.check_in_date THEN
    RAISE EXCEPTION 'Check-out date must be after check-in date';
  END IF;
  
  -- Allow historical dates ONLY for test/seed orders
  IF NEW.check_in_date < CURRENT_DATE AND COALESCE(NEW.order_source, '') NOT IN ('test', 'test_data') THEN
    RAISE EXCEPTION 'Check-in date cannot be in the past';
  END IF;
  
  -- 2. Validate room type exists and get capacity
  IF NEW.room_type_id IS NOT NULL THEN
    SELECT * INTO v_room_type
    FROM room_types
    WHERE id = NEW.room_type_id
      AND accommodation_id = NEW.accommodation_id;
    
    IF v_room_type.id IS NULL THEN
      RAISE EXCEPTION 'Invalid room type';
    END IF;
    
    -- Validate guest count against room capacity
    IF NEW.guest_count > v_room_type.capacity THEN
      RAISE EXCEPTION 'Guest count (%) exceeds room capacity (%)', NEW.guest_count, v_room_type.capacity;
    END IF;
    
    -- 3. Calculate total price from inventory pricing
    v_nights := NEW.check_out_date - NEW.check_in_date;
    v_current_date := NEW.check_in_date;
    
    WHILE v_current_date < NEW.check_out_date LOOP
      -- Get price for this date
      SELECT price, available_rooms, is_available INTO v_inventory
      FROM room_inventory_pricing
      WHERE room_type_id = NEW.room_type_id
        AND date = v_current_date;
      
      IF v_inventory IS NULL THEN
        -- Use base price from room type if no inventory record
        v_day_price := v_room_type.base_price;
      ELSIF v_inventory.is_available = FALSE THEN
        RAISE EXCEPTION 'Room not available on %', v_current_date;
      ELSIF v_inventory.available_rooms <= 0 THEN
        RAISE EXCEPTION 'No rooms available on %', v_current_date;
      ELSE
        v_day_price := v_inventory.price;
      END IF;
      
      v_calculated_total := v_calculated_total + v_day_price;
      v_current_date := v_current_date + 1;
    END LOOP;
    
    -- Add meal plan total if provided
    IF NEW.meal_plan_total IS NOT NULL AND NEW.meal_plan_total > 0 THEN
      v_calculated_total := v_calculated_total + NEW.meal_plan_total;
    END IF;
    
    -- Add pet plan price if provided
    IF NEW.pet_plan_price IS NOT NULL AND NEW.pet_plan_price > 0 THEN
      v_calculated_total := v_calculated_total + NEW.pet_plan_price;
    END IF;
    
    -- Use server-calculated total price
    NEW.total_price := v_calculated_total;
  END IF;
  
  -- 4. Validate and recalculate discount if provided
  IF NEW.discount_code IS NOT NULL AND LENGTH(TRIM(NEW.discount_code)) > 0 THEN
    -- Use existing validate_discount_code function
    SELECT * INTO v_discount_result
    FROM validate_discount_code(
      NEW.discount_code,
      NEW.accommodation_id,
      NEW.total_price,
      NEW.room_type_id,
      NEW.check_in_date
    );
    
    IF v_discount_result IS NULL OR v_discount_result.is_valid = FALSE THEN
      -- Invalid discount code - clear it and proceed without discount
      NEW.discount_code := NULL;
      NEW.discount_amount := 0;
    ELSE
      -- Recalculate discount server-side
      IF v_discount_result.discount_type = 'percentage' THEN
        v_calculated_discount := ROUND((NEW.total_price * v_discount_result.discount_value / 100.0)::numeric);
      ELSE
        -- Fixed amount discount
        v_calculated_discount := v_discount_result.discount_value;
      END IF;
      
      -- Ensure discount doesn't exceed total price
      IF v_calculated_discount > NEW.total_price THEN
        v_calculated_discount := NEW.total_price;
      END IF;
      
      -- Override client-supplied discount amount with server-calculated value
      NEW.discount_amount := v_calculated_discount;
    END IF;
  ELSE
    NEW.discount_code := NULL;
    NEW.discount_amount := 0;
  END IF;
  
  -- 5. Recalculate final price server-side
  NEW.final_price := NEW.total_price - COALESCE(NEW.discount_amount, 0);
  
  -- Ensure final price is not negative
  IF NEW.final_price < 0 THEN
    NEW.final_price := 0;
  END IF;
  
  -- 6. Set default values
  NEW.order_status := COALESCE(NEW.order_status, 'pending');
  NEW.payment_status := COALESCE(NEW.payment_status, 'unpaid');
  NEW.order_source := COALESCE(NEW.order_source, 'website');
  NEW.guest_count := COALESCE(NEW.guest_count, 2);
  
  RETURN NEW;
END;
$$;

-- Recreate trigger to ensure it's attached to the updated function
DROP TRIGGER IF EXISTS validate_order_before_insert_trigger ON orders;
CREATE TRIGGER validate_order_before_insert_trigger
BEFORE INSERT ON orders
FOR EACH ROW
EXECUTE FUNCTION validate_order_before_insert();

COMMENT ON FUNCTION validate_order_before_insert() IS 'Server-side validation for order creation: validates guest info, dates, room capacity, calculates prices from inventory, and recalculates discounts to prevent client-side manipulation. Allows historical dates for test orders (order_source=test/test_data).';