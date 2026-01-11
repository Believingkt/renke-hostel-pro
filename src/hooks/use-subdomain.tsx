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
      
      // For development (localhost) and Lovable preview, check for query parameter first
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.includes('lovableproject.com') || hostname.includes('lovable.app')) {
        // Check for ?acc= query parameter (supports alias or id)
        const urlParams = new URLSearchParams(window.location.search);
        const accParam = urlParams.get('acc');
        
        if (accParam) {
          // Try to find by short_url_alias first, then by id
          const { data: aliasData, error: aliasError } = await supabase
            .from('accommodation_info')
            .select('id')
            .eq('short_url_alias', accParam)
            .maybeSingle();
          
          if (!aliasError && aliasData) {
            setAccommodationId(aliasData.id);
            setIsLoading(false);
            return;
          }
          
          // Try by ID if alias not found
          const { data: idData, error: idError } = await supabase
            .from('accommodation_info')
            .select('id')
            .eq('id', accParam)
            .maybeSingle();
          
          if (!idError && idData) {
            setAccommodationId(idData.id);
            setIsLoading(false);
            return;
          }
        }
        
        // Fallback to first accommodation
        const { data, error } = await supabase
          .from('accommodation_info')
          .select('id')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (error) {
          if (import.meta.env.DEV) {
            console.error('Error loading accommodation:', error);
          }
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

      // If no subdomain, use the first accommodation (for custom domains without subdomains)
      if (!subdomain) {
        const { data, error } = await supabase
          .from('accommodation_info')
          .select('id')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (error) {
          if (import.meta.env.DEV) {
            console.error('Error loading accommodation:', error);
          }
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

      // Query accommodation by short_url_alias
      const { data, error } = await supabase
        .from('accommodation_info')
        .select('id')
        .eq('short_url_alias', subdomain)
        .maybeSingle();

      if (error) {
        if (import.meta.env.DEV) {
          console.error('Error querying accommodation:', error);
        }
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
      if (import.meta.env.DEV) {
        console.error('Error loading accommodation from subdomain:', err);
      }
      setError('載入旅館資訊失敗');
    } finally {
      setIsLoading(false);
    }
  };

  return { accommodationId, isLoading, error };
}
