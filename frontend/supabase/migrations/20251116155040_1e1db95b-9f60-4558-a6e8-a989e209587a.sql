-- Create backups storage bucket (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'backups',
  'backups',
  false,
  52428800, -- 50MB limit
  ARRAY['application/json', 'application/gzip']
);

-- RLS policies for backups bucket
CREATE POLICY "Only admins can upload backups"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'backups' AND
  (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'hotel_admin')
    )
  )
);

CREATE POLICY "Only admins can view backups"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'backups' AND
  (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'hotel_admin')
    )
  )
);

CREATE POLICY "Only admins can delete backups"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'backups' AND
  (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'hotel_admin')
    )
  )
);

-- Create backup_logs table to track backup history
CREATE TABLE IF NOT EXISTS public.backup_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id UUID NOT NULL REFERENCES accommodation_info(id),
  backup_type TEXT NOT NULL, -- 'manual' or 'auto'
  file_path TEXT NOT NULL,
  file_size BIGINT,
  orders_count INTEGER,
  customers_count INTEGER,
  status TEXT NOT NULL DEFAULT 'success', -- 'success', 'failed', 'restored'
  error_message TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on backup_logs
ALTER TABLE public.backup_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for backup_logs
CREATE POLICY "Admins can view backup logs in their accommodation"
ON public.backup_logs FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND accommodation_id = backup_logs.accommodation_id
    AND role IN ('super_admin', 'hotel_admin')
  )
);

CREATE POLICY "Admins can insert backup logs"
ON public.backup_logs FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND accommodation_id = backup_logs.accommodation_id
    AND role IN ('super_admin', 'hotel_admin')
  )
);

CREATE POLICY "Admins can update backup logs"
ON public.backup_logs FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND accommodation_id = backup_logs.accommodation_id
    AND role IN ('super_admin', 'hotel_admin')
  )
);

-- Create index for faster queries
CREATE INDEX idx_backup_logs_accommodation ON backup_logs(accommodation_id);
CREATE INDEX idx_backup_logs_created_at ON backup_logs(created_at DESC);

-- Add trigger for updated_at
CREATE TRIGGER update_backup_logs_updated_at
BEFORE UPDATE ON public.backup_logs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();