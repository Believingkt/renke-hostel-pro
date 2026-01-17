import * as React from "react";
import { supabase } from "@/integrations/supabase/client";

const { createContext, useContext, useState, useEffect, useRef } = React;

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
  const [currentAccommodationId, setCurrentAccommodationIdState] = useState<string | null>(null);
  const currentAccommodationIdRef = useRef<string | null>(null);

  const [userAccommodations, setUserAccommodations] = useState<Array<{
    accommodation_id: string;
    role: string;
  }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [checkInDate, setCheckInDate] = useState<Date | undefined>();
  const [checkOutDate, setCheckOutDate] = useState<Date | undefined>();
  const [guests, setGuests] = useState({ adults: 2, children: 0 });

  // Wrapper to save to localStorage when setting accommodation
  const setCurrentAccommodationId = (id: string | null) => {
    currentAccommodationIdRef.current = id;
    setCurrentAccommodationIdState(id);
    if (id) {
      try {
        localStorage.setItem(LAST_ACCOMMODATION_KEY, id);
      } catch (e) {
        console.error('[AccommodationContext] Failed to save to localStorage:', e);
      }
    }
  };

  useEffect(() => {
    // 初始載入時自動選擇民宿
    loadUserAccommodations(true);

    // Listen to auth state changes to reload accommodations when user logs in
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        // 登入時也要自動選擇
        loadUserAccommodations(true);
      } else if (event === 'TOKEN_REFRESHED') {
        // Token 刷新時只更新列表，不改變選擇
        loadUserAccommodations(false);
      }
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

      console.log('[AccommodationContext] Loading user accommodations for user:', session.user.id);

      // Use Promise to avoid blocking
      const { data, error } = await supabase
        .from('user_roles')
        .select('accommodation_id, role')
        .eq('user_id', session.user.id)
        .limit(10); // Add limit for faster query

      if (error) {
        console.error('[AccommodationContext] Error loading user accommodations:', error);
        setIsLoading(false);
        return;
      }

      console.log('[AccommodationContext] Loaded accommodations:', data);
      setUserAccommodations(data || []);

      // 只在 forceAutoSelect 時才自動選擇，否則保留現有選擇
      // 目標：使用者手動切換後，不要被任何重新載入流程覆蓋回預設民宿
      if (data && data.length > 0 && forceAutoSelect) {
        const currentId = currentAccommodationIdRef.current;
        const currentStillAccessible = currentId
          ? data.some(acc => acc.accommodation_id === currentId)
          : false;

        // 若目前已選擇且仍有權限，永遠不要覆蓋（避免自動切回）
        if (currentStillAccessible) {
          console.log('[AccommodationContext] Keeping current accommodation (do not override):', currentId);
        } else {
          // 否則優先使用 localStorage 儲存的選擇
          let savedAccommodationId: string | null = null;
          try {
            savedAccommodationId = localStorage.getItem(LAST_ACCOMMODATION_KEY);
          } catch (e) {
            console.error('[AccommodationContext] Failed to read from localStorage:', e);
          }

          const savedAccommodation = savedAccommodationId
            ? data.find(acc => acc.accommodation_id === savedAccommodationId)
            : null;

          if (savedAccommodation) {
            console.log('[AccommodationContext] Restoring last selected accommodation:', savedAccommodationId);
            setCurrentAccommodationId(savedAccommodationId);
          } else {
            // 若沒有可用的 saved 值，僅選第一個可用民宿（不再硬編碼回森山寫照）
            console.log('[AccommodationContext] Auto-selecting first available accommodation:', data[0].accommodation_id);
            setCurrentAccommodationId(data[0].accommodation_id);
          }
        }
      }
      
      setIsLoading(false);
    } catch (error) {
      console.error('[AccommodationContext] Error loading user accommodations:', error);
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
