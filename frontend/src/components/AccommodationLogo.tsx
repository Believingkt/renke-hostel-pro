import { cn } from "@/lib/utils";
import { useAccommodationLogo } from "@/hooks/use-accommodation-logo";

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
  // 使用統一的 logo 載入 hook
  const { logoUrl, isLoaded } = useAccommodationLogo({
    variant,
    externalLogoUrl,
    externalIsLoaded,
  });

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
