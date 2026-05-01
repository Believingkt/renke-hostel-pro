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
  short_url_alias: string | null;
  custom_domain: string | null;
}

function buildFrontendUrl(acc: Accommodation | undefined): string {
  if (!acc) return "/";
  if (acc.custom_domain) {
    return `https://${acc.custom_domain.replace(/^https?:\/\//, "")}/`;
  }
  if (acc.short_url_alias) {
    const host = window.location.hostname.toLowerCase();
    const isLovablePreview =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.includes("lovableproject.com") ||
      host.includes("lovable.app");
    if (isLovablePreview) {
      // 預覽環境用 ?acc= 查詢參數
      return `${window.location.origin}/?acc=${acc.short_url_alias}`;
    }
    return `https://booking.lakeze.com/${acc.short_url_alias}`;
  }
  return "/";
}

export function AccommodationSelector() {
  const { currentAccommodationId, setCurrentAccommodationId, userAccommodations, isLoading: contextIsLoading } = useAccommodation();
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Wait for context to finish loading before loading accommodations
    if (!contextIsLoading) {
      loadAccommodations();
    }
  }, [userAccommodations, contextIsLoading]);

  const loadAccommodations = async () => {
    try {
      if (userAccommodations.length === 0) {
        console.log('[AccommodationSelector] No user accommodations available');
        setIsLoading(false);
        return;
      }

      const accommodationIds = userAccommodations.map(ua => ua.accommodation_id);
      console.log('[AccommodationSelector] Loading accommodations:', accommodationIds);

      const { data, error } = await supabase
        .from('accommodation_info')
        .select('id, name, short_url_alias, custom_domain')
        .in('id', accommodationIds);

      if (error) throw error;

      console.log('[AccommodationSelector] Loaded accommodation info:', data);
      setAccommodations(data || []);
    } catch (error) {
      console.error('[AccommodationSelector] Error loading accommodations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading state while either context or component is loading
  if (contextIsLoading || isLoading) {
    return null;
  }

  // If no accommodations available, don't render
  if (accommodations.length === 0) {
    return null;
  }

  // If only one accommodation, show it as label instead of selector
  if (accommodations.length === 1) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon"
              className="h-9 w-9"
              onClick={() => window.open(buildFrontendUrl(accommodations[0]), '_blank')}
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>開啟前台首頁</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const currentAcc = accommodations.find(a => a.id === currentAccommodationId);

  return (
    <div className="flex items-center gap-1.5">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon"
              className="h-9 w-9"
              onClick={() => window.open(buildFrontendUrl(currentAcc), '_blank')}
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
