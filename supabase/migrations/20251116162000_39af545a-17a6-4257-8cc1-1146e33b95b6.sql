-- Add backup mode and base backup reference to backup_logs
ALTER TABLE public.backup_logs
ADD COLUMN backup_mode TEXT NOT NULL DEFAULT 'full' CHECK (backup_mode IN ('full', 'incremental')),
ADD COLUMN base_backup_id UUID REFERENCES public.backup_logs(id) ON DELETE SET NULL,
ADD COLUMN incremental_since TIMESTAMP WITH TIME ZONE;

-- Add comment for clarity
COMMENT ON COLUMN public.backup_logs.backup_mode IS 'full: complete backup, incremental: only changed data since last backup';
COMMENT ON COLUMN public.backup_logs.base_backup_id IS 'Reference to the full backup this incremental backup is based on';
COMMENT ON COLUMN public.backup_logs.incremental_since IS 'Timestamp of the last backup, used for incremental backups';