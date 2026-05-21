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
  is_villa?: boolean;
}

function buildFrontendUrl(acc: Accommodation | undefined): string {
  if (!acc) return "/";

  const host = window.location.hostname.toLowerCase();
  const isLovablePreview =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.includes("lovableproject.com") ||
    host.includes("lovable.app");

  // 包區型民宿 → 直接帶到 /booking/villa/{accId}，跳過 alias 解析與中間轉導
  if (acc.is_villa) {
    const qs = `?accId=${acc.id}`;
    if (acc.custom_domain) {
      return `https://${acc.custom_domain.replace(/^https?:\/\//, "")}/booking/villa/${acc.id}${qs}`;
    }
    if (isLovablePreview) {
      return `${window.location.origin}/booking/villa/${acc.id}${qs}`;
    }
    return `https://booking.lakeze.com/booking/villa/${acc.id}${qs}`;
  }

  // 一般民宿：custom_domain > alias 首頁
  if (acc.custom_domain) {
    return `https://${acc.custom_domain.replace(/^https?:\/\//, "")}/`;
  }
  if (acc.short_url_alias) {
    if (isLovablePreview) {
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

      const [{ data, error }, { data: pkgRows }] = await Promise.all([
        supabase
          .from('accommodation_info')
          .select('id, name, short_url_alias, custom_domain')
          .in('id', accommodationIds),
        supabase
          .from('accommodation_packages')
          .select('accommodation_id')
          .in('accommodation_id', accommodationIds)
          .eq('enabled', true),
      ]);

      if (error) throw error;

      const villaSet = new Set((pkgRows || []).map((p: any) => p.accommodation_id));
      const enriched = (data || []).map((a) => ({ ...a, is_villa: villaSet.has(a.id) }));
      console.log('[AccommodationSelector] Loaded accommodation info:', enriched);
      setAccommodations(enriched);
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
          <SelectValue placeholder="切換民宿" />
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
