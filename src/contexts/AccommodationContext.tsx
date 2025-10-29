import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

interface AccommodationContextType {
  currentAccommodationId: string | null;
  setCurrentAccommodationId: (id: string | null) => void;
  userAccommodations: Array<{
    accommodation_id: string;
    role: string;
  }>;
  isLoading: boolean;
}

const AccommodationContext = createContext<AccommodationContextType | undefined>(undefined);

export function AccommodationProvider({ children }: { children: ReactNode }) {
  const [currentAccommodationId, setCurrentAccommodationId] = useState<string | null>(null);
  const [userAccommodations, setUserAccommodations] = useState<Array<{
    accommodation_id: string;
    role: string;
  }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadUserAccommodations();
  }, []);

  const loadUserAccommodations = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('user_roles')
        .select('accommodation_id, role')
        .eq('user_id', session.user.id);

      if (error) throw error;

      setUserAccommodations(data || []);

      // Auto-select first accommodation if only one exists
      if (data && data.length === 1 && !currentAccommodationId) {
        setCurrentAccommodationId(data[0].accommodation_id);
      }
    } catch (error) {
      console.error('Error loading user accommodations:', error);
    } finally {
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
