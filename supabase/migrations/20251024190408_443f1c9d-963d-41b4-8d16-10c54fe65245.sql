-- Create FAQ table
CREATE TABLE public.faqs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  accommodation_id UUID REFERENCES public.accommodation_info(id),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  is_published BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Public can view published FAQs" 
ON public.faqs 
FOR SELECT 
USING (is_published = true);

CREATE POLICY "Allow public to insert FAQs" 
ON public.faqs 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow public to update FAQs" 
ON public.faqs 
FOR UPDATE 
USING (true);

CREATE POLICY "Allow public to delete FAQs" 
ON public.faqs 
FOR DELETE 
USING (true);

-- Add trigger for automatic timestamp updates
CREATE TRIGGER update_faqs_updated_at
BEFORE UPDATE ON public.faqs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();