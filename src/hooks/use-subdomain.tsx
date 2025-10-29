import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useSubdomain() {
  const [accommodationId, setAccommodationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAccommodationFromSubdomain();
  }, []);

  const loadAccommodationFromSubdomain = async () => {
    try {
      // Get subdomain from hostname
      const hostname = window.location.hostname;
      const parts = hostname.split('.');
      
      // For development (localhost), use the first accommodation
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        const { data, error } = await supabase
          .from('accommodation_info')
          .select('id')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error('Error loading accommodation:', error);
          setError('載入旅館資訊失敗');
          setIsLoading(false);
          return;
        }

        if (!data) {
          setError('找不到旅館資料');
          setIsLoading(false);
          return;
        }

        setAccommodationId(data.id);
        setIsLoading(false);
        return;
      }

      // Extract subdomain (first part of hostname)
      const subdomain = parts.length > 2 ? parts[0] : null;

      if (!subdomain) {
        setError('無效的子域名');
        setIsLoading(false);
        return;
      }

      // Query accommodation by short_url_alias
      const { data, error } = await supabase
        .from('accommodation_info')
        .select('id')
        .eq('short_url_alias', subdomain)
        .maybeSingle();

      if (error) {
        console.error('Error querying accommodation:', error);
        setError('載入旅館資訊失敗');
        setIsLoading(false);
        return;
      }

      if (!data) {
        setError('找不到對應的旅館');
        setIsLoading(false);
        return;
      }

      setAccommodationId(data.id);
    } catch (err) {
      console.error('Error loading accommodation from subdomain:', err);
      setError('載入旅館資訊失敗');
    } finally {
      setIsLoading(false);
    }
  };

  return { accommodationId, isLoading, error };
}
