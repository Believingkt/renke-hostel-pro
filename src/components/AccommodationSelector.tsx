import { useEffect, useState } from "react";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
      <div className="flex items-center gap-1.5">
        <span className="font-medium text-sm text-foreground">
          {accommodations[0].name}
        </span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon"
                className="h-9 w-9"
                onClick={() => window.open('/', '_blank')}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>開啟前台首頁</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="font-medium text-sm text-foreground">
        {accommodations.find(a => a.id === currentAccommodationId)?.name || "旅館"}
      </span>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon"
              className="h-9 w-9"
              onClick={() => window.open('/', '_blank')}
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>開啟前台首頁</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
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
