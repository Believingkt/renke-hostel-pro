import { useEffect, useState } from "react";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { openFrontendBooking } from "@/lib/frontendUrl";
import { isPmsMode, pmsHref } from "@/lib/appMode";
import { LAST_PROPERTY_ALIAS_KEY } from "@/pages/PmsLogin";
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

// 一律導向新版包棟訂房頁（共用邏輯見 src/lib/frontendUrl.ts）



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
      // 過濾掉 accommodation_id 為 null 的 team 角色（admin / franchise / scout 等）
      const accommodationIds = Array.from(
        new Set(
          userAccommodations
            .map((ua) => ua.accommodation_id)
            .filter((id): id is string => !!id)
        )
      );

      if (accommodationIds.length === 0) {
        console.log('[AccommodationSelector] No accommodation-bound roles');
        setIsLoading(false);
        return;
      }

      console.log('[AccommodationSelector] Loading accommodations:', accommodationIds);

      const { data, error } = await supabase
        .from('accommodation_info')
        .select('id, name, short_url_alias, custom_domain, display_order')
        .in('id', accommodationIds)
        .order('display_order', { ascending: true, nullsFirst: false })
        .order('name', { ascending: true });

      if (error) throw error;

      // PMS 網域：後台 context 由網址代號決定，沒有代號的民宿無法進入 → 排除
      const list = (data || []).filter(
        (acc) => !isPmsMode() || !!acc.short_url_alias?.trim()
      );

      console.log('[AccommodationSelector] Loaded accommodation info:', list);
      setAccommodations(list);

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
              className="inline-flex h-9 w-9"
              onClick={() =>
                openFrontendBooking(
                  { accommodationId: accommodations[0].id, customDomain: accommodations[0].custom_domain },
                  { newTab: true },
                )
              }
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

  const handleSwitch = (id: string) => {
    if (isPmsMode()) {
      const target = accommodations.find((a) => a.id === id);
      const alias = target?.short_url_alias?.trim().toLowerCase();
      if (alias) {
        try {
          localStorage.setItem("lastSelectedAccommodation", id);
          localStorage.setItem(LAST_PROPERTY_ALIAS_KEY, alias);
        } catch {
          /* ignore */
        }
        window.location.assign(pmsHref(`/${alias}/admin`));
        return;
      }
    }
    setCurrentAccommodationId(id);
  };

  return (
    <div className="flex items-center gap-1.5">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon"
              className="inline-flex h-9 w-9"
              onClick={() =>
                openFrontendBooking(
                  { accommodationId: currentAcc?.id, customDomain: currentAcc?.custom_domain },
                  { newTab: true },
                )
              }
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>開啟前台首頁</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Select value={currentAccommodationId || undefined} onValueChange={handleSwitch}>
        <SelectTrigger className="w-auto min-w-0 max-w-[45vw] sm:max-w-none sm:min-w-[180px] gap-1 overflow-hidden [&>svg]:flex-shrink-0 [&>span]:min-w-0 [&>span]:flex-1 [&>span]:overflow-hidden [&>span]:whitespace-nowrap [&>span]:text-ellipsis">
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
