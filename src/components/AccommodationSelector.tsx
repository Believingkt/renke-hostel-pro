import { useEffect, useState } from "react";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Accommodation {
  id: string;
  name: string;
}

export function AccommodationSelector() {
  const { currentAccommodationId, setCurrentAccommodationId, userAccommodations } = useAccommodation();
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadAccommodations();
  }, [userAccommodations]);

  const loadAccommodations = async () => {
    try {
      if (userAccommodations.length === 0) {
        setIsLoading(false);
        return;
      }

      const accommodationIds = userAccommodations.map(ua => ua.accommodation_id);

      const { data, error } = await supabase
        .from('accommodation_info')
        .select('id, name')
        .in('id', accommodationIds);

      if (error) throw error;

      setAccommodations(data || []);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error loading accommodations:', error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading || accommodations.length === 0) {
    return null;
  }

  // If only one accommodation, show it as label instead of selector
  if (accommodations.length === 1) {
    return (
      <Button 
        variant="ghost" 
        className="font-medium text-sm hover:bg-accent"
        onClick={() => navigate('/')}
      >
        {accommodations[0].name}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button 
        variant="ghost" 
        size="sm"
        className="font-medium"
        onClick={() => navigate('/')}
      >
        {accommodations.find(a => a.id === currentAccommodationId)?.name || "前往首頁"}
      </Button>
      <Select value={currentAccommodationId || undefined} onValueChange={setCurrentAccommodationId}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="切換旅館" />
        </SelectTrigger>
        <SelectContent>
          {accommodations.map((accommodation) => (
            <SelectItem key={accommodation.id} value={accommodation.id}>
              {accommodation.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
