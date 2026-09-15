-- Add show_custom_images_section column to accommodation_info
ALTER TABLE public.accommodation_info 
ADD COLUMN IF NOT EXISTS show_custom_images_section boolean NOT NULL DEFAULT true;