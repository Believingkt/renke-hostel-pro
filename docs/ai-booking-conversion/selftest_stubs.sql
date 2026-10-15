-- scratch 用最小 stub（模擬 Supabase auth 與相關既有表／函式；正式 DB 已存在，不會套用此檔）
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'owner', 'staff');
CREATE TABLE public.user_roles (user_id uuid, role public.app_role, accommodation_id uuid);
CREATE FUNCTION public.is_super_admin(_uid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role = 'super_admin') $$;
CREATE FUNCTION public.user_has_team_role(_uid uuid, _role public.app_role) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role = _role AND accommodation_id IS NULL) $$;
CREATE TABLE public.accommodation_info (id uuid PRIMARY KEY, name text NOT NULL, is_active boolean NOT NULL DEFAULT true);
CREATE TABLE public.orders (id uuid PRIMARY KEY, accommodation_id uuid, order_status text NOT NULL, order_source text NOT NULL DEFAULT 'website', guest_email text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.order_attributions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid, first_utm_source text, first_utm_content text, first_utm_campaign text, last_utm_source text, last_utm_content text, last_utm_campaign text);
CREATE TABLE public.traveler_profiles (id uuid PRIMARY KEY, email text);
CREATE TABLE public.remarketing_campaigns (id uuid PRIMARY KEY, content jsonb);
CREATE TABLE public.remarketing_sends (id uuid PRIMARY KEY, campaign_id uuid NOT NULL, traveler_profile_id uuid NOT NULL, channel text NOT NULL DEFAULT 'email', status text NOT NULL DEFAULT 'sent', is_test boolean NOT NULL DEFAULT false, recipient text, sent_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.ai_metric_exclusions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL, value text NOT NULL);
-- 以下三支函式與 20261012090000 / 20261015090000 原文相同
CREATE OR REPLACE FUNCTION public.ai_metric_require_hq() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('super_admin', 'admin')) THEN
    RAISE EXCEPTION 'forbidden: hq admin only' USING ERRCODE = '42501';
  END IF;
END; $$;
CREATE OR REPLACE FUNCTION public.ai_metric_excluded_emails() RETURNS SETOF text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT lower(trim(x.value)) FROM public.ai_metric_exclusions x WHERE x.kind = 'email'; $$;
CREATE OR REPLACE FUNCTION public.ai_metric_excluded_order_ids() RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id FROM public.orders o WHERE lower(o.guest_email) IN (SELECT public.ai_metric_excluded_emails()); $$;
CREATE OR REPLACE FUNCTION public.hq_shared_demo_can_read() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (public.is_super_admin(auth.uid()) OR public.user_has_team_role(auth.uid(), 'admin'::app_role)); $$;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
INSERT INTO public.user_roles VALUES
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'admin', NULL),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'super_admin', NULL),
  ('cccccccc-0000-4000-8000-00000000000c', 'owner', 'a0000000-0000-4000-8000-000000000001');
