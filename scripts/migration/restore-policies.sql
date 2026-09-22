DROP POLICY IF EXISTS "Authenticated users can broadcast to scoped topics" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated users can subscribe to scoped topics" ON realtime.messages;
DROP POLICY IF EXISTS "Accommodation admins can delete OG images" ON storage.objects;
DROP POLICY IF EXISTS "Accommodation admins can update OG images" ON storage.objects;
DROP POLICY IF EXISTS "Accommodation admins can upload OG images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete custom section images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload custom section images" ON storage.objects;
DROP POLICY IF EXISTS "Admins delete backups of their accommodation" ON storage.objects;
DROP POLICY IF EXISTS "Admins upload backups to their accommodation" ON storage.objects;
DROP POLICY IF EXISTS "Admins view backups of their accommodation" ON storage.objects;
DROP POLICY IF EXISTS "Custom section images: read for anon by direct URL only" ON storage.objects;
DROP POLICY IF EXISTS "Custom section images: staff list/read" ON storage.objects;
DROP POLICY IF EXISTS "Guests upload receipts to own folder" ON storage.objects;
DROP POLICY IF EXISTS "Logos: read for anon by direct URL only" ON storage.objects;
DROP POLICY IF EXISTS "Logos: staff list/read" ON storage.objects;
DROP POLICY IF EXISTS "Members can delete own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Members can read own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Members can update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Members can upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "OG images: read for anon by direct URL only" ON storage.objects;
DROP POLICY IF EXISTS "OG images: staff list/read" ON storage.objects;
DROP POLICY IF EXISTS "Room photos: read for anon by direct URL only" ON storage.objects;
DROP POLICY IF EXISTS "Room photos: staff list/read" ON storage.objects;
DROP POLICY IF EXISTS "Staff can view transfer receipts" ON storage.objects;
DROP POLICY IF EXISTS "Upload transfer receipts with valid path" ON storage.objects;
DROP POLICY IF EXISTS "Uploaders can view their own transfer receipts" ON storage.objects;
DROP POLICY IF EXISTS "ai-assets admin delete" ON storage.objects;
DROP POLICY IF EXISTS "ai-assets admin insert" ON storage.objects;
DROP POLICY IF EXISTS "ai-assets admin update" ON storage.objects;
DROP POLICY IF EXISTS "ai-assets public read" ON storage.objects;
DROP POLICY IF EXISTS logos_delete_with_access ON storage.objects;
DROP POLICY IF EXISTS logos_insert_with_access ON storage.objects;
DROP POLICY IF EXISTS logos_update_with_access ON storage.objects;
DROP POLICY IF EXISTS og_images_delete_with_access ON storage.objects;
DROP POLICY IF EXISTS og_images_insert_with_access ON storage.objects;
DROP POLICY IF EXISTS og_images_update_with_access ON storage.objects;
DROP POLICY IF EXISTS room_photos_delete_with_access ON storage.objects;
DROP POLICY IF EXISTS room_photos_insert_with_access ON storage.objects;
DROP POLICY IF EXISTS room_photos_update_with_access ON storage.objects;

--
-- PostgreSQL database dump
--

\restrict lcc5YVm8tcSc6oO1nbOeDvsHRMLYfe26G9uN6VJxD47EHbIcKvuaPcHr0JbKLTd

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: messages Authenticated users can broadcast to scoped topics; Type: POLICY; Schema: realtime; Owner: -
--

CREATE POLICY "Authenticated users can broadcast to scoped topics" ON realtime.messages FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'super_admin'::public.app_role)))) OR (EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.accommodation_id IS NOT NULL) AND (realtime.topic() ~~ ('%'::text || (ur.accommodation_id)::text))))) OR (realtime.topic() ~~ ('%'::text || (auth.uid())::text))));


--
-- Name: messages Authenticated users can subscribe to scoped topics; Type: POLICY; Schema: realtime; Owner: -
--

CREATE POLICY "Authenticated users can subscribe to scoped topics" ON realtime.messages FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'super_admin'::public.app_role)))) OR (EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.accommodation_id IS NOT NULL) AND (realtime.topic() ~~ ('%'::text || (ur.accommodation_id)::text))))) OR (realtime.topic() ~~ ('%'::text || (auth.uid())::text))));


--
-- Name: objects Accommodation admins can delete OG images; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Accommodation admins can delete OG images" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'og-images'::text) AND public.user_has_storage_access(name)));


--
-- Name: objects Accommodation admins can update OG images; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Accommodation admins can update OG images" ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'og-images'::text) AND public.user_has_storage_access(name)));


--
-- Name: objects Accommodation admins can upload OG images; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Accommodation admins can upload OG images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'og-images'::text) AND public.user_has_storage_access(name)));


--
-- Name: objects Admins can delete custom section images; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Admins can delete custom section images" ON storage.objects FOR DELETE USING (((bucket_id = 'custom-sections'::text) AND public.user_has_storage_access(name)));


--
-- Name: objects Admins can upload custom section images; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Admins can upload custom section images" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'custom-sections'::text) AND public.user_has_storage_access(name)));


--
-- Name: objects Admins delete backups of their accommodation; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Admins delete backups of their accommodation" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'backups'::text) AND (EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['super_admin'::public.app_role, 'hotel_admin'::public.app_role])) AND ((ur.role = 'super_admin'::public.app_role) OR ((ur.accommodation_id)::text = (storage.foldername(objects.name))[1])))))));


--
-- Name: objects Admins upload backups to their accommodation; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Admins upload backups to their accommodation" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'backups'::text) AND (EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['super_admin'::public.app_role, 'hotel_admin'::public.app_role])) AND ((ur.role = 'super_admin'::public.app_role) OR ((ur.accommodation_id)::text = (storage.foldername(objects.name))[1])))))));


--
-- Name: objects Admins view backups of their accommodation; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Admins view backups of their accommodation" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'backups'::text) AND (EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['super_admin'::public.app_role, 'hotel_admin'::public.app_role])) AND ((ur.role = 'super_admin'::public.app_role) OR ((ur.accommodation_id)::text = (storage.foldername(objects.name))[1])))))));


--
-- Name: objects Custom section images: read for anon by direct URL only; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Custom section images: read for anon by direct URL only" ON storage.objects FOR SELECT TO anon USING (((bucket_id = 'custom-sections'::text) AND ((storage.foldername(name))[1] IS NOT NULL)));


--
-- Name: objects Custom section images: staff list/read; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Custom section images: staff list/read" ON storage.objects FOR SELECT TO authenticated USING ((bucket_id = 'custom-sections'::text));


--
-- Name: objects Guests upload receipts to own folder; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Guests upload receipts to own folder" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'transfer-receipts'::text) AND ((storage.foldername(name))[2] = (auth.uid())::text) AND (EXISTS ( SELECT 1
   FROM public.accommodation_info ai
  WHERE (((ai.id)::text = (storage.foldername(objects.name))[1]) AND (ai.is_active = true))))));


--
-- Name: objects Logos: read for anon by direct URL only; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Logos: read for anon by direct URL only" ON storage.objects FOR SELECT TO anon USING (((bucket_id = 'logos'::text) AND ((storage.foldername(name))[1] IS NOT NULL)));


--
-- Name: objects Logos: staff list/read; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Logos: staff list/read" ON storage.objects FOR SELECT TO authenticated USING ((bucket_id = 'logos'::text));


--
-- Name: objects Members can delete own avatar; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Members can delete own avatar" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'member-avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));


--
-- Name: objects Members can read own avatars; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Members can read own avatars" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'member-avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));


--
-- Name: objects Members can update own avatar; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Members can update own avatar" ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'member-avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));


--
-- Name: objects Members can upload own avatar; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Members can upload own avatar" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'member-avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));


--
-- Name: objects OG images: read for anon by direct URL only; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "OG images: read for anon by direct URL only" ON storage.objects FOR SELECT TO anon USING (((bucket_id = 'og-images'::text) AND ((storage.foldername(name))[1] IS NOT NULL)));


--
-- Name: objects OG images: staff list/read; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "OG images: staff list/read" ON storage.objects FOR SELECT TO authenticated USING ((bucket_id = 'og-images'::text));


--
-- Name: objects Room photos: read for anon by direct URL only; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Room photos: read for anon by direct URL only" ON storage.objects FOR SELECT TO anon USING (((bucket_id = 'room-photos'::text) AND ((storage.foldername(name))[1] IS NOT NULL)));


--
-- Name: objects Room photos: staff list/read; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Room photos: staff list/read" ON storage.objects FOR SELECT TO authenticated USING ((bucket_id = 'room-photos'::text));


--
-- Name: objects Staff can view transfer receipts; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Staff can view transfer receipts" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'transfer-receipts'::text) AND public.user_has_storage_access(name)));


--
-- Name: objects Upload transfer receipts with valid path; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Upload transfer receipts with valid path" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'transfer-receipts'::text) AND ((storage.foldername(name))[1] IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.accommodation_info ai
  WHERE (((ai.id)::text = (storage.foldername(objects.name))[1]) AND (ai.is_active = true) AND (EXISTS ( SELECT 1
           FROM public.user_roles ur
          WHERE ((ur.user_id = auth.uid()) AND ((ur.accommodation_id = ai.id) OR (ur.role = 'super_admin'::public.app_role))))))))));


--
-- Name: objects Uploaders can view their own transfer receipts; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Uploaders can view their own transfer receipts" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'transfer-receipts'::text) AND (owner = auth.uid())));


--
-- Name: objects ai-assets admin delete; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "ai-assets admin delete" ON storage.objects FOR DELETE USING (((bucket_id = 'ai-assets'::text) AND public.is_admin_or_super()));


--
-- Name: objects ai-assets admin insert; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "ai-assets admin insert" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'ai-assets'::text) AND public.is_admin_or_super()));


--
-- Name: objects ai-assets admin update; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "ai-assets admin update" ON storage.objects FOR UPDATE USING (((bucket_id = 'ai-assets'::text) AND public.is_admin_or_super()));


--
-- Name: objects ai-assets public read; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "ai-assets public read" ON storage.objects FOR SELECT USING ((bucket_id = 'ai-assets'::text));


--
-- Name: objects logos_delete_with_access; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY logos_delete_with_access ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'logos'::text) AND public.user_has_storage_access(name)));


--
-- Name: objects logos_insert_with_access; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY logos_insert_with_access ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'logos'::text) AND public.user_has_storage_access(name)));


--
-- Name: objects logos_update_with_access; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY logos_update_with_access ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'logos'::text) AND public.user_has_storage_access(name)));


--
-- Name: objects og_images_delete_with_access; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY og_images_delete_with_access ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'og-images'::text) AND public.user_has_storage_access(name)));


--
-- Name: objects og_images_insert_with_access; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY og_images_insert_with_access ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'og-images'::text) AND public.user_has_storage_access(name)));


--
-- Name: objects og_images_update_with_access; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY og_images_update_with_access ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'og-images'::text) AND public.user_has_storage_access(name)));


--
-- Name: objects room_photos_delete_with_access; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY room_photos_delete_with_access ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'room-photos'::text) AND public.user_has_storage_access(name)));


--
-- Name: objects room_photos_insert_with_access; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY room_photos_insert_with_access ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'room-photos'::text) AND public.user_has_storage_access(name)));


--
-- Name: objects room_photos_update_with_access; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY room_photos_update_with_access ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'room-photos'::text) AND public.user_has_storage_access(name)));


--
-- PostgreSQL database dump complete
--

\unrestrict lcc5YVm8tcSc6oO1nbOeDvsHRMLYfe26G9uN6VJxD47EHbIcKvuaPcHr0JbKLTd

