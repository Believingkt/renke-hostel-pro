import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Accommodation {
  id: string;
  name: string;
  is_active?: boolean;
}

interface HQContextType {
  selectedAccommodation: string;
  setSelectedAccommodation: (id: string) => void;
  accommodations: Accommodation[];
  accommodationsLoading: boolean;
}

const HQContext = createContext<HQContextType | undefined>(undefined);

export function HQProvider({ children }: { children: ReactNode }) {
  const [selectedAccommodation, setSelectedAccommodation] = useState<string>("all");
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [accommodationsLoading, setAccommodationsLoading] = useState(true);

  useEffect(() => {
    loadAccommodations();
  }, []);

  const loadAccommodations = async () => {
    try {
      const { data, error } = await supabase
        .from("accommodation_info")
        .select("id, name, is_active")
        .order("name");

      if (error) throw error;
      setAccommodations(data || []);
    } catch (error) {
      console.error("Error loading accommodations:", error);
    } finally {
      setAccommodationsLoading(false);
    }
  };

  return (
    <HQContext.Provider
      value={{
        selectedAccommodation,
        setSelectedAccommodation,
        accommodations,
        accommodationsLoading,
      }}
    >
      {children}
    </HQContext.Provider>
  );
}

export function useHQ() {
  const context = useContext(HQContext);
  if (context === undefined) {
    throw new Error("useHQ must be used within a HQProvider");
  }
  return context;
}
