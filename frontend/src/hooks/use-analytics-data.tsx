import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays } from 'date-fns';

interface AnalyticsSummary {
  total_pageviews: number;
  unique_visitors: number;
  top_pages: Array<{ page_path: string; views: number }>;
  top_referrers: Array<{ source: string; views: number }>;
  traffic_sources: Array<{ source: string; views: number }>;
  daily_views: Array<{ date: string; views: number; visitors: number }>;
}

interface UseAnalyticsDataOptions {
  accommodationId: string | null;
  startDate?: Date;
  endDate?: Date;
}

export const useAnalyticsData = ({ 
  accommodationId, 
  startDate = subDays(new Date(), 30),
  endDate = new Date()
}: UseAnalyticsDataOptions) => {
  return useQuery({
    queryKey: ['analytics', accommodationId, format(startDate, 'yyyy-MM-dd'), format(endDate, 'yyyy-MM-dd')],
    queryFn: async (): Promise<AnalyticsSummary> => {
      if (!accommodationId) {
        throw new Error('Accommodation ID is required');
      }
      
      const { data, error } = await supabase.rpc('get_analytics_summary', {
        p_accommodation_id: accommodationId,
        p_start_date: format(startDate, 'yyyy-MM-dd'),
        p_end_date: format(endDate, 'yyyy-MM-dd'),
      });
      
      if (error) {
        console.error('Analytics fetch error:', error);
        throw error;
      }
      
      if (!data || data.length === 0) {
        return {
          total_pageviews: 0,
          unique_visitors: 0,
          top_pages: [],
          top_referrers: [],
          traffic_sources: [],
          daily_views: [],
        };
      }
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = data[0] as any;
      return {
        total_pageviews: Number(result.total_pageviews) || 0,
        unique_visitors: Number(result.unique_visitors) || 0,
        top_pages: result.top_pages || [],
        top_referrers: result.top_referrers || [],
        traffic_sources: result.traffic_sources || [],
        daily_views: result.daily_views || [],
      };
    },
    enabled: !!accommodationId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export default useAnalyticsData;
