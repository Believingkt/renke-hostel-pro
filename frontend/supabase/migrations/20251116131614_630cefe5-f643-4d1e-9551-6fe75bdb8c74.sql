-- Enable realtime for accommodation_info table
ALTER TABLE public.accommodation_info REPLICA IDENTITY FULL;

-- Add the table to the supabase_realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.accommodation_info;