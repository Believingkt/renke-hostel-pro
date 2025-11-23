import * as React from "react";
import { supabase } from "@/integrations/supabase/client";

const { createContext, useContext, useState, useEffect } = React;

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

export function AccommodationProvider({ children }: { children: React.ReactNode }) {
  const [currentAccommodationId, setCurrentAccommodationId] = useState<string | null>(null);
  const [userAccommodations, setUserAccommodations] = useState<Array<{
    accommodation_id: string;
    role: string;
  }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [checkInDate, setCheckInDate] = useState<Date | undefined>();
  const [checkOutDate, setCheckOutDate] = useState<Date | undefined>();
  const [guests, setGuests] = useState({ adults: 2, children: 0 });

  useEffect(() => {
    loadUserAccommodations();

    // Listen to auth state changes to reload accommodations when user logs in
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        loadUserAccommodations();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const loadUserAccommodations = async () => {
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

      // Auto-select first accommodation if only one exists
      if (data && data.length === 1 && !currentAccommodationId) {
        console.log('[AccommodationContext] Auto-selecting accommodation:', data[0].accommodation_id);
        setCurrentAccommodationId(data[0].accommodation_id);
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
