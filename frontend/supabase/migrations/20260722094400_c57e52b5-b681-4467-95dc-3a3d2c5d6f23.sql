DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='order_rooms') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.order_rooms';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='room_inventory_pricing') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.room_inventory_pricing';
  END IF;
END $$;
ALTER TABLE public.order_rooms REPLICA IDENTITY FULL;
ALTER TABLE public.room_inventory_pricing REPLICA IDENTITY FULL;