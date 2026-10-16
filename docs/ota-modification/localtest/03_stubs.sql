-- HotelNabe／奧丁丁推送 trigger 函式在本機換成空殼（正式庫會寫推送佇列）
CREATE FUNCTION public.fn_hotelnabe_enqueue_from_order_rooms() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RETURN COALESCE(NEW, OLD); END $$;
CREATE FUNCTION public.fn_order_rooms_owlting_enqueue() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RETURN COALESCE(NEW, OLD); END $$;
