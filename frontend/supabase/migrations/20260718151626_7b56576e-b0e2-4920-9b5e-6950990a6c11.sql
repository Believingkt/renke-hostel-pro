
CREATE INDEX IF NOT EXISTS idx_order_rooms_order_id ON public.order_rooms (order_id);
CREATE INDEX IF NOT EXISTS idx_order_rooms_unit_notnull ON public.order_rooms (room_unit_id) WHERE room_unit_id IS NOT NULL;
