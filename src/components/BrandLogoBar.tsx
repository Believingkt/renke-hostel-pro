import lokezeLogo from "@/assets/lokeze-logo.png";
import { useBrandPartners, type BrandPartnerScope } from "@/hooks/useBrandPartners";
import { cn } from "@/lib/utils";

interface BrandLogoBarProps {
  /** 顯示範圍，決定要撈哪些夥伴 logo */
  scope: BrandPartnerScope;
  /** 主 logo 右側文字標註（例如「行銷團隊」「總部」） */
  label?: string;
  /** 自訂主 logo（訂房前台使用 portal 版） */
  mainLogoSrc?: string;
  mainLogoAlt?: string;
  /** 主 logo 高度 class */
  mainLogoClassName?: string;
  /** 夥伴 logo 高度 class */
  partnerLogoClassName?: string;
  /** 不顯示主 logo（例如訂房前台頁尾僅顯示合作夥伴） */
  hideMainLogo?: boolean;
  /** 是否顯示夥伴的文字標註（例如「技術合作」）；側邊欄預設不顯示 */
  showPartnerLabels?: boolean;
  /** 最多顯示幾個夥伴 logo */
  maxPartners?: number;
  className?: string;
}

/**
 * 共用品牌列：Lakeze 主 logo + 文字標註 + 依 scope 動態顯示的合作夥伴 logo。
 * 夥伴清單由總部「品牌夥伴」設定頁維護，一處增刪全站同步。
 */
export function BrandLogoBar({
  scope,
  label,
  mainLogoSrc = lokezeLogo,
  mainLogoAlt = "Lakeze 人客多",
  mainLogoClassName = "h-8",
  partnerLogoClassName = "h-8",
  hideMainLogo,
  showPartnerLabels = false,
  maxPartners = 8,
  className,
}: BrandLogoBarProps) {
  const { data: partners = [] } = useBrandPartners(scope);
  const visible = partners.slice(0, maxPartners);

  return (
    <div className={cn("flex items-center gap-2 min-w-0", className)}>
      {!hideMainLogo && (
        <img
          src={mainLogoSrc}
          alt={mainLogoAlt}
          className={cn("object-contain shrink-0", mainLogoClassName)}
        />
      )}
      {label && (
        <span className="text-sm font-medium text-muted-foreground whitespace-nowrap shrink-0">
          {label}
        </span>
      )}
      {visible.length > 0 && (
        <div
          className="flex items-center gap-2 min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          title={visible.map((p) => p.name).join("、")}
        >
          {visible.map((p, i) => {
            const logo = (
              <span className="flex items-center gap-1.5 shrink-0">
                {(!hideMainLogo || i > 0) && (
                  <span className="h-5 w-px bg-border/60 shrink-0" aria-hidden />
                )}
                {showPartnerLabels && p.label && (
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium whitespace-nowrap">
                    {p.label}
                  </span>
                )}
                <img
                  src={p.logo_url}
                  alt={p.name}
                  loading="lazy"
                  className={cn(
                    "object-contain shrink-0 opacity-80 hover:opacity-100 transition-opacity",
                    partnerLogoClassName
                  )}
                />
              </span>
            );
            return p.link_url ? (
              <a
                key={p.id}
                href={p.link_url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0"
              >
                {logo}
              </a>
            ) : (
              <span key={p.id} className="contents">
                {logo}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default BrandLogoBar;
