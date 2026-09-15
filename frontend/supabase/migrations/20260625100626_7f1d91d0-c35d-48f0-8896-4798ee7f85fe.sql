CREATE TABLE public.villa_chat_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  accommodation_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX villa_chat_messages_user_acc_idx ON public.villa_chat_messages (user_id, accommodation_id, created_at);
GRANT SELECT, INSERT, DELETE ON public.villa_chat_messages TO authenticated;
GRANT ALL ON public.villa_chat_messages TO service_role;
ALTER TABLE public.villa_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own villa chat" ON public.villa_chat_messages FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own villa chat" ON public.villa_chat_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own villa chat" ON public.villa_chat_messages FOR DELETE TO authenticated USING (auth.uid() = user_id);