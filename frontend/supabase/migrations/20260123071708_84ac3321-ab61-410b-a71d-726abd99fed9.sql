-- Create page analytics table for basic traffic tracking
CREATE TABLE public.page_analytics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  accommodation_id UUID NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  page_url TEXT NOT NULL,
  page_path TEXT NOT NULL,
  referrer TEXT,
  referrer_domain TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  session_id TEXT NOT NULL,
  user_agent TEXT,
  device_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX idx_page_analytics_accommodation_id ON public.page_analytics(accommodation_id);
CREATE INDEX idx_page_analytics_created_at ON public.page_analytics(created_at DESC);
CREATE INDEX idx_page_analytics_session_id ON public.page_analytics(session_id);
CREATE INDEX idx_page_analytics_accommodation_date ON public.page_analytics(accommodation_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.page_analytics ENABLE ROW LEVEL SECURITY;

-- Allow public INSERT (tracking from public pages)
CREATE POLICY "Public can insert page analytics"
ON public.page_analytics
FOR INSERT
WITH CHECK (
  accommodation_id IS NOT NULL 
  AND page_url IS NOT NULL 
  AND session_id IS NOT NULL
);

-- Only admins can view analytics for their accommodation
CREATE POLICY "Admins can view their accommodation analytics"
ON public.page_analytics
FOR SELECT
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) 
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

-- Only super admins can delete analytics (for cleanup)
CREATE POLICY "Super admins can delete analytics"
ON public.page_analytics
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'super_admin'
  )
);

-- Create a function to get analytics summary
CREATE OR REPLACE FUNCTION public.get_analytics_summary(
  p_accommodation_id UUID,
  p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
  p_end_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  total_pageviews BIGINT,
  unique_visitors BIGINT,
  top_pages JSONB,
  top_referrers JSONB,
  traffic_sources JSONB,
  daily_views JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Verify caller has access
  IF NOT (
    user_has_role(auth.uid(), p_accommodation_id, 'super_admin'::app_role) 
    OR user_has_role(auth.uid(), p_accommodation_id, 'hotel_admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  WITH filtered_data AS (
    SELECT *
    FROM page_analytics
    WHERE accommodation_id = p_accommodation_id
      AND created_at >= p_start_date
      AND created_at < p_end_date + INTERVAL '1 day'
  ),
  pageviews AS (
    SELECT COUNT(*) as cnt FROM filtered_data
  ),
  visitors AS (
    SELECT COUNT(DISTINCT session_id) as cnt FROM filtered_data
  ),
  pages AS (
    SELECT jsonb_agg(row_to_json(t)) as data
    FROM (
      SELECT page_path, COUNT(*) as views
      FROM filtered_data
      GROUP BY page_path
      ORDER BY views DESC
      LIMIT 10
    ) t
  ),
  referrers AS (
    SELECT jsonb_agg(row_to_json(t)) as data
    FROM (
      SELECT 
        COALESCE(referrer_domain, '直接造訪') as source,
        COUNT(*) as views
      FROM filtered_data
      GROUP BY referrer_domain
      ORDER BY views DESC
      LIMIT 10
    ) t
  ),
  sources AS (
    SELECT jsonb_agg(row_to_json(t)) as data
    FROM (
      SELECT 
        COALESCE(utm_source, '直接/未知') as source,
        COUNT(*) as views
      FROM filtered_data
      GROUP BY utm_source
      ORDER BY views DESC
      LIMIT 10
    ) t
  ),
  daily AS (
    SELECT jsonb_agg(row_to_json(t) ORDER BY t.date) as data
    FROM (
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as views,
        COUNT(DISTINCT session_id) as visitors
      FROM filtered_data
      GROUP BY DATE(created_at)
      ORDER BY date
    ) t
  )
  SELECT 
    pageviews.cnt,
    visitors.cnt,
    COALESCE(pages.data, '[]'::jsonb),
    COALESCE(referrers.data, '[]'::jsonb),
    COALESCE(sources.data, '[]'::jsonb),
    COALESCE(daily.data, '[]'::jsonb)
  FROM pageviews, visitors, pages, referrers, sources, daily;
END;
$$;

-- Add comment for documentation
COMMENT ON TABLE public.page_analytics IS 'Tracks page views and traffic sources for accommodation websites';