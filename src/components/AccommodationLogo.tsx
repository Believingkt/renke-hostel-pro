import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { cn } from "@/lib/utils";

type LogoVariant = "header" | "footer";

interface AccommodationLogoProps {
  /** header: 白天模式 logo，footer: 深色背景 logo */
  variant?: LogoVariant;
  /** 住宿名稱，作為 alt 文字及無 logo 時的後備文字 */
  accommodationName?: string;
  /** 自訂 className */
  className?: string;
  /** 自訂圖片 className */
  imgClassName?: string;
  /** 自訂 skeleton className */
  skeletonClassName?: string;
  /** 自訂無 logo 時的文字 className */
  textClassName?: string;
  /** 是否顯示 loading skeleton，預設 true */
  showSkeleton?: boolean;
  /** 外部傳入的 logo URL（如已取得），可略過內部 fetch */
  logoUrl?: string | null;
  /** 外部傳入的 loading 狀態 */
  isLoaded?: boolean;
  /** 點擊事件 */
  onClick?: () => void;
}

const AccommodationLogo = ({
  variant = "header",
  accommodationName = "住宿",
  className,
  imgClassName,
  skeletonClassName,
  textClassName,
  showSkeleton = true,
  logoUrl: externalLogoUrl,
  isLoaded: externalIsLoaded,
  onClick,
}: AccommodationLogoProps) => {
  const { currentAccommodationId } = useAccommodation();
  const [internalLogoUrl, setInternalLogoUrl] = useState<string | null>(null);
  const [internalIsLoaded, setInternalIsLoaded] = useState(false);

  // 使用外部傳入或內部狀態
  const useExternalState = externalLogoUrl !== undefined && externalIsLoaded !== undefined;
  const logoUrl = useExternalState ? externalLogoUrl : internalLogoUrl;
  const isLoaded = useExternalState ? externalIsLoaded : internalIsLoaded;

  const logoField = variant === "header" ? "header_logo_url" : "footer_logo_url";
  const channelName = variant === "header" ? "accommodation-header-logo" : "accommodation-footer-logo";

  useEffect(() => {
    // 若使用外部狀態，不需內部 fetch
    if (useExternalState) return;

    const fetchLogo = async () => {
      if (!currentAccommodationId) return;

      // 切換住宿時重置狀態
      setInternalIsLoaded(false);
      setInternalLogoUrl(null);

      try {
        const { data, error } = await supabase
          .from("accommodation_info")
          .select(logoField)
          .eq("id", currentAccommodationId)
          .maybeSingle();

        if (error) throw error;

        setInternalLogoUrl((data as any)?.[logoField] ?? null);
        setInternalIsLoaded(true);
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error(`Error fetching ${variant} logo:`, error);
        }
        setInternalIsLoaded(true);
      }
    };

    fetchLogo();

    // 訂閱 realtime 更新
    const channel = supabase
      .channel(`${channelName}-${currentAccommodationId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "accommodation_info",
          filter: `id=eq.${currentAccommodationId}`,
        },
        (payload) => {
          if (Object.prototype.hasOwnProperty.call(payload.new, logoField)) {
            setInternalLogoUrl((payload.new as any)[logoField] ?? null);
            setInternalIsLoaded(true);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentAccommodationId, useExternalState, logoField, channelName, variant]);

  // 預設樣式
  const defaultImgClass =
    variant === "header"
      ? "h-14 w-auto object-contain"
      : "h-10 md:h-14 max-w-[200px] md:max-w-[260px] w-auto object-contain";

  const defaultSkeletonClass =
    variant === "header"
      ? "h-14 w-32 bg-muted/30 animate-pulse rounded"
      : "h-10 md:h-14 w-40 md:w-56 bg-white/10 animate-pulse rounded";

  const defaultTextClass =
    variant === "header"
      ? "text-base md:text-lg font-semibold"
      : "text-base md:text-lg font-semibold text-white";

  const containerProps = onClick
    ? { onClick, role: "button", tabIndex: 0, className: cn("cursor-pointer", className) }
    : { className };

  // Skeleton 狀態
  if (!isLoaded && showSkeleton) {
    return (
      <div {...containerProps}>
        <div className={cn(defaultSkeletonClass, skeletonClassName)} />
      </div>
    );
  }

  // 有 logo
  if (logoUrl) {
    return (
      <div {...containerProps}>
        <img
          src={logoUrl}
          alt={accommodationName}
          className={cn(defaultImgClass, imgClassName)}
          loading="lazy"
        />
      </div>
    );
  }

  // 無 logo，顯示文字
  return (
    <div {...containerProps}>
      <div className={cn("flex items-center", variant === "header" ? "h-14" : "h-10 md:h-14")}>
        <span className={cn(defaultTextClass, textClassName)}>{accommodationName}</span>
      </div>
    </div>
  );
};

export default AccommodationLogo;
