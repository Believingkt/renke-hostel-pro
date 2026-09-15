-- Add column to store which exclusive packages a room is bound to
ALTER TABLE public.room_types 
ADD COLUMN IF NOT EXISTS bound_exclusive_ids uuid[] DEFAULT '{}';

-- Add comment for documentation
COMMENT ON COLUMN public.room_types.bound_exclusive_ids IS 'Array of room_type IDs (exclusive packages) that this room is bound to. Empty array or null means bound to all exclusive packages.';