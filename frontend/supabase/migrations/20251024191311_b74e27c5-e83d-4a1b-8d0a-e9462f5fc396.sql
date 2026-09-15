-- Update RLS policy to allow viewing all FAQs (including unpublished ones)
DROP POLICY IF EXISTS "Public can view published FAQs" ON public.faqs;

CREATE POLICY "Allow public to view all FAQs"
ON public.faqs
FOR SELECT
USING (true);