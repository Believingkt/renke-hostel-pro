import { useEffect, useState } from "react";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2 } from "lucide-react";

interface Accommodation {
  id: string;
  name: string;
}

export function AccommodationSelector() {
  const { currentAccommodationId, setCurrentAccommodationId, userAccommodations } = useAccommodation();
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
      console.error('Error loading accommodations:', error);
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
      <div className="flex items-center gap-2 px-3 py-2 text-sm">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{accommodations[0].name}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3">
      <Building2 className="h-4 w-4 text-muted-foreground" />
      <Select value={currentAccommodationId || undefined} onValueChange={setCurrentAccommodationId}>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="選擇旅館" />
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
