-- Add compression-related columns to backup_logs table
ALTER TABLE public.backup_logs 
ADD COLUMN IF NOT EXISTS uncompressed_size BIGINT,
ADD COLUMN IF NOT EXISTS compression_ratio NUMERIC(5,2),
ADD COLUMN IF NOT EXISTS is_compressed BOOLEAN DEFAULT true;

-- Update existing records to mark them as uncompressed
UPDATE public.backup_logs 
SET is_compressed = false 
WHERE uncompressed_size IS NULL;