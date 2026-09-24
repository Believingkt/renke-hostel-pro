import { useEffect, useState } from "react";
import { useAccommodation } from "@lakeze/shared/contexts/AccommodationContext";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { openFrontendBooking } from "@lakeze/shared/lib/frontendUrl";
import { isPmsMode, pmsHref, normalizePmsPath, LAST_PROPERTY_ALIAS_KEY } from "@lakeze/shared/lib/appMode";
import { GLOBAL_VIEWER_ROLES } from "@lakeze/shared/lib/globalViewerRoles";

import { Button } from "@lakeze/shared/components/ui/button";
import { ExternalLink, Loader2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@lakeze/shared/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@lakeze/shared/components/ui/select";

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
  const [aliasMissingOnly, setAliasMissingOnly] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);


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

      // 全域角色（會計 finance / 全域 super_admin）：不綁館別，但可跨館唯讀查詢
      // → 館別切換器應列出所有啟用中的民宿，而非只有另外綁定的那一館
      let isGlobalViewer = false;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const { data: globalRoles } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', session.user.id)
            .is('accommodation_id', null)
            .in('role', GLOBAL_VIEWER_ROLES as unknown as never[]);
          isGlobalViewer = (globalRoles?.length ?? 0) > 0;
        }
      } catch {
        /* 取不到全域角色時退回原本行為 */
      }

      if (accommodationIds.length === 0 && !isGlobalViewer) {
        console.log('[AccommodationSelector] No accommodation-bound roles');
        setIsLoading(false);
        return;
      }

      console.log('[AccommodationSelector] Loading accommodations:', {
        accommodationIds,
        isGlobalViewer,
      });

      let query = supabase
        .from('accommodation_info')
        .select('id, name, short_url_alias, custom_domain, display_order');

      if (isGlobalViewer) {
        query = query.eq('is_active', true);
      } else {
        query = query.in('id', accommodationIds);
      }

      const { data, error } = await query
        .order('display_order', { ascending: true, nullsFirst: false })
        .order('name', { ascending: true });

      if (error) throw error;


      // PMS 網域：後台 context 由網址代號決定，沒有代號的民宿無法進入 → 排除
      const list = (data || []).filter(
        (acc) => !isPmsMode() || !!acc.short_url_alias?.trim()
      );

      setAliasMissingOnly(
        isPmsMode() && (data?.length ?? 0) > 0 && list.length === 0
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
    if (aliasMissingOnly) {
      return (
        <span className="text-sm text-muted-foreground">
          此帳號的民宿尚未設定代號，請聯絡總部
        </span>
      );
    }
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
  const switchingAcc = accommodations.find(a => a.id === switchingId);

  const handleSwitch = (id: string) => {
    if (id === currentAccommodationId) return;
    if (isPmsMode()) {
      const target = accommodations.find((a) => a.id === id);
      const alias = target?.short_url_alias?.trim().toLowerCase();
      if (alias) {
        setSwitchingId(id);
        try {
          localStorage.setItem("lastSelectedAccommodation", id);
          localStorage.setItem(LAST_PROPERTY_ALIAS_KEY, alias);
        } catch {
          /* ignore */
        }
        // 保留目前所在的後台子路徑（例如 /admin/owner-settlement），
        // 否則切換館別會一律跳回後台首頁的營運分析
        const currentPath = normalizePmsPath(window.location.pathname);
        const subPath = currentPath.startsWith("/admin") ? currentPath : "/admin";
        window.location.assign(pmsHref(`/${alias}${subPath}`));
        return;
      }
    }
    setCurrentAccommodationId(id);
  };

  return (

    <div className="flex items-center gap-1.5">
      {switchingId && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-background">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            正在切換至{switchingAcc?.name ?? "民宿"}…
          </p>
        </div>
      )}

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
