-- Create audit_logs table for recording important operations
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  accommodation_id UUID REFERENCES public.accommodation_info(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  user_email TEXT,
  action_type TEXT NOT NULL,
  action_category TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  entity_name TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only super_admins can view all audit logs
CREATE POLICY "Super admins can view all audit logs" 
ON public.audit_logs 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = 'super_admin'
  )
);

-- Hotel admins can view audit logs for their accommodation
CREATE POLICY "Hotel admins can view their accommodation audit logs" 
ON public.audit_logs 
FOR SELECT 
USING (
  accommodation_id IS NOT NULL AND
  user_has_role(auth.uid(), accommodation_id, 'hotel_admin')
);

-- Any authenticated user can insert audit logs
CREATE POLICY "Authenticated users can insert audit logs" 
ON public.audit_logs 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

-- Create index for faster queries
CREATE INDEX idx_audit_logs_accommodation_id ON public.audit_logs(accommodation_id);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_action_category ON public.audit_logs(action_category);
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);

-- Create system_settings table for global settings
CREATE TABLE public.system_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key TEXT NOT NULL UNIQUE,
  setting_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  updated_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Only super_admins can manage system settings
CREATE POLICY "Super admins can view system settings" 
ON public.system_settings 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = 'super_admin'
  )
);

CREATE POLICY "Super admins can update system settings" 
ON public.system_settings 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = 'super_admin'
  )
);

CREATE POLICY "Super admins can insert system settings" 
ON public.system_settings 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = 'super_admin'
  )
);

-- Insert default system settings
INSERT INTO public.system_settings (setting_key, setting_value, description)
VALUES 
  ('holiday_sync', '{"enabled": true, "last_sync": null, "auto_sync_interval_days": 30}'::jsonb, '國定假日自動同步設定'),
  ('backup_retention', '{"days": 90, "max_backups_per_accommodation": 10}'::jsonb, '備份保留設定'),
  ('notification_settings', '{"email_notifications": true, "system_alerts": true}'::jsonb, '通知設定');

-- Create function to update updated_at timestamp
CREATE TRIGGER update_system_settings_updated_at
  BEFORE UPDATE ON public.system_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();