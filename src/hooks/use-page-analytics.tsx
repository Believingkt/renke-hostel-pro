import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { captureTouch } from '@/lib/attribution';


// Generate or retrieve session ID from sessionStorage
const getSessionId = (): string => {
  const key = 'analytics_session_id';
  let sessionId = sessionStorage.getItem(key);
  
  if (!sessionId) {
    sessionId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    sessionStorage.setItem(key, sessionId);
  }
  
  return sessionId;
};

// Extract domain from URL
const extractDomain = (url: string | null): string | null => {
  if (!url) return null;
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return null;
  }
};

// Detect device type from user agent
const getDeviceType = (): string => {
  const ua = navigator.userAgent;
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
    return 'tablet';
  }
  if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
    return 'mobile';
  }
  return 'desktop';
};

// Get UTM parameters from URL
const getUtmParams = () => {
  const params = new URLSearchParams(window.location.search);
  return {
    utm_source: params.get('utm_source'),
    utm_medium: params.get('utm_medium'),
    utm_campaign: params.get('utm_campaign'),
  };
};

interface UsePageAnalyticsOptions {
  accommodationId: string | null;
  enabled?: boolean;
}

export const usePageAnalytics = ({ accommodationId, enabled = true }: UsePageAnalyticsOptions) => {
  const trackedRef = useRef<string | null>(null);
  
  useEffect(() => {
    if (!enabled || !accommodationId) return;
    
    // Prevent duplicate tracking for same page
    const currentPath = window.location.pathname + window.location.search;
    if (trackedRef.current === currentPath) return;
    
    const trackPageView = async () => {
      try {
        const utmParams = getUtmParams();
        const referrer = document.referrer;
        
        const payload = {
          accommodation_id: accommodationId,
          page_url: window.location.href,
          page_path: window.location.pathname,
          referrer: referrer || null,
          referrer_domain: extractDomain(referrer),
          utm_source: utmParams.utm_source,
          utm_medium: utmParams.utm_medium,
          utm_campaign: utmParams.utm_campaign,
          session_id: getSessionId(),
          user_agent: navigator.userAgent,
          device_type: getDeviceType(),
        };
        
        const { error } = await supabase
          .from('page_analytics')
          .insert(payload);
        
        if (error) {
          console.error('Analytics tracking error:', error);
        } else {
          trackedRef.current = currentPath;
        }
      } catch (err) {
        console.error('Analytics tracking failed:', err);
      }
    };
    
    // Small delay to ensure page is loaded
    const timeoutId = setTimeout(trackPageView, 100);
    
    return () => clearTimeout(timeoutId);
  }, [accommodationId, enabled]);
};

export default usePageAnalytics;
