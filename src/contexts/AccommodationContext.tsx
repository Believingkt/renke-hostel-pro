import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLocation, useSearchParams } from "react-router-dom";
import { isPmsHost, extractAliasFromPath } from "@/lib/appMode";

const { createContext, useContext, useState, useEffect, useRef, useCallback } = React;

const ACCOMMODATION_ID_PARAM = 'accId';

interface AccommodationContextType {
  currentAccommodationId: string | null;
  setCurrentAccommodationId: (id: string | null) => void;
  userAccommodations: Array<{
    accommodation_id: string;
    role: string;
  }>;
  isLoading: boolean;
  checkInDate: Date | undefined;
  setCheckInDate: (date: Date | undefined) => void;
  checkOutDate: Date | undefined;
  setCheckOutDate: (date: Date | undefined) => void;
  guests: { adults: number; children: number };
  setGuests: (guests: { adults: number; children: number }) => void;
}

const AccommodationContext = createContext<AccommodationContextType | undefined>(undefined);

const LAST_ACCOMMODATION_KEY = 'lastSelectedAccommodation';

export function AccommodationProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentAccommodationId, setCurrentAccommodationIdState] = useState<string | null>(null);
  const currentAccommodationIdRef = useRef<string | null>(null);
  const loadedForUserRef = useRef<string | null>(null);

  const [userAccommodations, setUserAccommodations] = useState<Array<{
    accommodation_id: string;
    role: string;
  }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [checkInDate, setCheckInDate] = useState<Date | undefined>();
  const [checkOutDate, setCheckOutDate] = useState<Date | undefined>();
  const [guests, setGuests] = useState({ adults: 2, children: 0 });

  // Wrapper to save to localStorage AND URL when setting accommodation
  const setCurrentAccommodationId = useCallback((id: string | null) => {
    const isSame = currentAccommodationIdRef.current === id;
    currentAccommodationIdRef.current = id;

    if (!isSame) {
      setCurrentAccommodationIdState(id);
    }

    if (id) {
      try {
        localStorage.setItem(LAST_ACCOMMODATION_KEY, id);
      } catch (e) {
        // silent
      }

      setSearchParams(
        (prev) => {
          const current = prev.get(ACCOMMODATION_ID_PARAM);
          if (current === id) return prev;
          const next = new URLSearchParams(prev);
          next.set(ACCOMMODATION_ID_PARAM, id);
          return next;
        },
        { replace: true }
      );
    }
  }, [setSearchParams]);

  const resolveDomainAccommodationId = useCallback(async (
    availableAccommodations: Array<{ accommodation_id: string; role: string }>
  ) => {
    if (typeof window === "undefined" || availableAccommodations.length === 0) {
      return null;
    }

    const hostname = window.location.hostname.toLowerCase();
    const isHQDomain = hostname === "hq.lakeze.com" || hostname === "www.hq.lakeze.com";
    const isBookingDomain = hostname === "booking.lakeze.com" || hostname === "www.booking.lakeze.com";
    const isDevOrPreview = hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.includes("lovableproject.com") ||
      hostname.includes("lovable.app");

    // ===== PMS 網域：一律以路徑首段 alias 為準（登入時輸入的民宿代號） =====
    if (isPmsHost(hostname)) {
      const pmsAlias = extractAliasFromPath(window.location.pathname);
      if (!pmsAlias) return null;
      const allowedIds = availableAccommodations.map((acc) => acc.accommodation_id);
      const { data, error } = await supabase
        .from("accommodation_info")
        .select("id, short_url_alias")
        .in("id", allowedIds)
        .eq("short_url_alias", pmsAlias)
        .maybeSingle();
      if (error || !data) return null;
      return data.id;
    }

    // ===== Booking 網域：解析路徑首段為 alias =====
    if (isBookingDomain) {
      const pathSegments = window.location.pathname.split("/").filter(Boolean);
      const reservedFirst = new Set([
        "booking", "book", "member", "order-search", "order-payment",
        "payment", "payment-result", "linepay", "public-payment",
        "ai-booking", "auth", "hq", "hq-auth", "headquarters", "admin",
        "pay", "profile", "reset-password", "change-password",
        "kol-api-docs", "points-api-docs", "og-preview", "payment-test", "__cb",
      ]);
      const pathAlias = pathSegments[0] && !reservedFirst.has(pathSegments[0])
        ? pathSegments[0] : null;
      if (!pathAlias) return null;

      const allowedAccommodationIds = availableAccommodations.map((acc) => acc.accommodation_id);
      const { data, error } = await supabase
        .from("accommodation_info")
        .select("id, short_url_alias")
        .in("id", allowedAccommodationIds)
        .eq("short_url_alias", pathAlias)
        .maybeSingle();
      if (error || !data) return null;
      return data.id;
    }

    if (isHQDomain || isDevOrPreview) {
      return null;
    }

    const normalizedDomain = hostname.startsWith("www.") ? hostname.substring(4) : hostname;
    const subdomain = hostname.split(".").length > 2 ? hostname.split(".")[0] : null;
    let queryFilter = `custom_domain.eq.${normalizedDomain},custom_domain.eq.www.${normalizedDomain}`;

    if (subdomain) {
      queryFilter += `,short_url_alias.eq.${subdomain}`;
    }

    const allowedAccommodationIds = availableAccommodations.map((acc) => acc.accommodation_id);
    const { data, error } = await supabase
      .from("accommodation_info")
      .select("id, short_url_alias, custom_domain")
      .in("id", allowedAccommodationIds)
      .or(queryFilter);

    if (error || !data?.length) {
      return null;
    }

    const domainMatch = data.find(
      (acc) => acc.custom_domain === normalizedDomain || acc.custom_domain === `www.${normalizedDomain}`
    );
    const subdomainMatch = subdomain
      ? data.find((acc) => acc.short_url_alias === subdomain)
      : null;

    return domainMatch?.id || subdomainMatch?.id || null;
  }, []);

  const isCustomDomainContext = useCallback(() => {
    if (typeof window === "undefined") {
      return false;
    }

    const hostname = window.location.hostname.toLowerCase();
    const isHQDomain = hostname === "hq.lakeze.com" || hostname === "www.hq.lakeze.com";
    const isBookingDomain = hostname === "booking.lakeze.com" || hostname === "www.booking.lakeze.com";
    const isDevOrPreview = hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.includes("lovableproject.com") ||
      hostname.includes("lovable.app");

    // Booking 網域帶有 alias 路徑時也視為「自訂網域 context」
    if (isBookingDomain) {
      const pathSegments = window.location.pathname.split("/").filter(Boolean);
      const reservedFirst = new Set([
        "booking", "book", "member", "order-search", "order-payment",
        "payment", "payment-result", "linepay", "public-payment",
        "ai-booking", "auth", "hq", "hq-auth", "headquarters", "admin",
        "pay", "profile", "reset-password", "change-password",
        "kol-api-docs", "points-api-docs", "og-preview", "payment-test", "__cb",
      ]);
      return Boolean(pathSegments[0] && !reservedFirst.has(pathSegments[0]));
    }

    return !isHQDomain && !isDevOrPreview;
  }, []);

  const isAdminPath = useCallback(() => {
    const segments = location.pathname.split("/").filter(Boolean);
    const first = segments[0];
    const normalizedFirst = first && ![
      "admin", "auth", "hq", "hq-auth", "headquarters", "booking", "book",
      "member", "ai-booking", "order-search", "profile", "payment-test",
      "kol-api-docs", "points-api-docs", "pay", "payment-result",
      "reset-password", "change-password", "og-preview", "__cb", "team", "team-auth",
    ].includes(first)
      ? segments[1]
      : first;

    return normalizedFirst === "admin";
  }, [location.pathname]);

  useEffect(() => {
    loadUserAccommodations(true);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        // 只在使用者變更時重新載入，避免重複呼叫
        if (loadedForUserRef.current !== session.user.id) {
          loadUserAccommodations(true);
        }
      }
      // TOKEN_REFRESHED 不再重複載入，減少不必要的 API 呼叫
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const loadUserAccommodations = async (forceAutoSelect = false) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setIsLoading(false);
        return;
      }

      // 避免同一使用者重複載入
      if (loadedForUserRef.current === session.user.id && !forceAutoSelect) {
        setIsLoading(false);
        return;
      }

      if (import.meta.env.DEV) {
        console.log('[AccommodationContext] Loading accommodations for:', session.user.id);
      }

      const { data, error } = await supabase
        .from('user_roles')
        .select('accommodation_id, role')
        .eq('user_id', session.user.id)
        .not('accommodation_id', 'is', null)
        .limit(1000);

      if (error) {
        if (import.meta.env.DEV) console.error('[AccommodationContext] Error:', error);
        setIsLoading(false);
        return;
      }

      loadedForUserRef.current = session.user.id;
      setUserAccommodations(data || []);

      if (data && data.length > 0 && forceAutoSelect) {
        const domainAccommodationId = await resolveDomainAccommodationId(data);

        // 1. 優先從 URL query 讀取
        const urlAccommodationId = searchParams.get(ACCOMMODATION_ID_PARAM);
        const urlAccommodation = urlAccommodationId
          ? data.find(acc => acc.accommodation_id === urlAccommodationId)
          : null;

        if (urlAccommodation) {
          currentAccommodationIdRef.current = urlAccommodationId;
          setCurrentAccommodationIdState(urlAccommodationId);
          try {
            localStorage.setItem(LAST_ACCOMMODATION_KEY, urlAccommodationId);
          } catch (e) { /* silent */ }
          setIsLoading(false);
          return;
        }

        // 2. 非後台的自訂網域 / alias 頁面仍以網域旅宿為準，避免前台被後台上次選擇污染
        if (domainAccommodationId && isCustomDomainContext() && !isAdminPath()) {
          setCurrentAccommodationId(domainAccommodationId);
          setIsLoading(false);
          return;
        }

        // 3. 若目前已選擇且仍有權限，不要覆蓋
        const currentId = currentAccommodationIdRef.current;
        const currentStillAccessible = currentId
          ? data.some(acc => acc.accommodation_id === currentId)
          : false;

        if (!currentStillAccessible) {
          // 4. 後台頁面優先使用 localStorage 儲存的跨民宿選擇，避免自訂網域重整時覆蓋回網域本身民宿
          let savedAccommodationId: string | null = null;
          try {
            savedAccommodationId = localStorage.getItem(LAST_ACCOMMODATION_KEY);
          } catch (e) { /* silent */ }

          const savedAccommodation = savedAccommodationId
            ? data.find(acc => acc.accommodation_id === savedAccommodationId)
            : null;

          if (savedAccommodation) {
            setCurrentAccommodationId(savedAccommodationId);
          } else if (domainAccommodationId) {
            setCurrentAccommodationId(domainAccommodationId);
          } else {
            setCurrentAccommodationId(data[0].accommodation_id);
          }
        }
      }
      
      setIsLoading(false);
    } catch (error) {
      if (import.meta.env.DEV) console.error('[AccommodationContext] Error:', error);
      setIsLoading(false);
    }
  };

  return (
    <AccommodationContext.Provider
      value={{
        currentAccommodationId,
        setCurrentAccommodationId,
        userAccommodations,
        isLoading,
        checkInDate,
        setCheckInDate,
        checkOutDate,
        setCheckOutDate,
        guests,
        setGuests,
      }}
    >
      {children}
    </AccommodationContext.Provider>
  );
}

export function useAccommodation() {
  const context = useContext(AccommodationContext);
  if (context === undefined) {
    throw new Error('useAccommodation must be used within AccommodationProvider');
  }
  return context;
}
