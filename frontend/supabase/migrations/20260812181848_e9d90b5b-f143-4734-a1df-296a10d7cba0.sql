CREATE POLICY "HQ admins manage global prompts" ON public.ai_prompts FOR ALL TO authenticated USING (accommodation_id IS NULL AND public.is_admin_or_super()) WITH CHECK (accommodation_id IS NULL AND public.is_admin_or_super());

CREATE POLICY "HQ admins manage global knowledge" ON public.ai_knowledge FOR ALL TO authenticated USING (accommodation_id IS NULL AND public.is_admin_or_super()) WITH CHECK (accommodation_id IS NULL AND public.is_admin_or_super());

CREATE POLICY "HQ admins manage global examples" ON public.ai_examples FOR ALL TO authenticated USING (accommodation_id IS NULL AND public.is_admin_or_super()) WITH CHECK (accommodation_id IS NULL AND public.is_admin_or_super());

CREATE POLICY "HQ admins manage reply templates" ON public.ai_reply_templates FOR ALL TO authenticated USING (public.is_admin_or_super()) WITH CHECK (public.is_admin_or_super());

CREATE POLICY "HQ admins manage all ai api keys" ON public.accommodation_ai_api_keys FOR ALL TO authenticated USING (public.is_admin_or_super()) WITH CHECK (public.is_admin_or_super());