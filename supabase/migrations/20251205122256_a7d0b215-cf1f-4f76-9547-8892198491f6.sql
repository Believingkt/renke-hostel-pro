-- Create password reset tokens table
CREATE TABLE public.password_reset_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- Allow public insert (for creating tokens)
CREATE POLICY "Allow public insert for password reset"
ON public.password_reset_tokens
FOR INSERT
WITH CHECK (true);

-- Allow public select to verify tokens
CREATE POLICY "Allow public select for token verification"
ON public.password_reset_tokens
FOR SELECT
USING (true);

-- Allow public update to mark tokens as used
CREATE POLICY "Allow public update for token usage"
ON public.password_reset_tokens
FOR UPDATE
USING (true);

-- Create index for faster token lookup
CREATE INDEX idx_password_reset_tokens_token ON public.password_reset_tokens(token);
CREATE INDEX idx_password_reset_tokens_email ON public.password_reset_tokens(email);