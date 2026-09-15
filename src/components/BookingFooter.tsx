import { Link } from "react-router-dom";
import { ArrowUp, Facebook, Instagram, Youtube, AtSign, Music2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import lokezeLogo from "@/assets/lakeze-portal-logo.png";
import { BrandLogoBar } from "@/components/BrandLogoBar";
import { useBookingLocale } from "@/contexts/BookingLocaleContext";

interface BookingFooterProps {
  lineId?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  threadsUrl?: string;
  youtubeUrl?: string;
  tiktokUrl?: string;
  /** 隱藏「技術合作」等合作品牌資訊（團購前台使用） */
  hidePartnershipInfo?: boolean;
  /** 團購前台：精簡連結（只留隱私政策，可另選是否保留客服入口） */
  compactLinks?: boolean;
  /** compactLinks 時是否保留「聯繫客服」（頁面前面已有客服 CTA 時請設為 false） */
  showSupportLink?: boolean;
}

const BookingFooter = ({
  lineId,
  facebookUrl,
  instagramUrl,
  threadsUrl,
  youtubeUrl,
  tiktokUrl,
  hidePartnershipInfo,
  compactLinks,
  showSupportLink,
}: BookingFooterProps = {}) => {
  // 顯示層語言（無 Provider 時安全回退中文；不影響任何導頁行為）
  const { t } = useBookingLocale();

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const socials = [
    { url: facebookUrl, label: "Facebook", Icon: Facebook },
    { url: instagramUrl, label: "Instagram", Icon: Instagram },
    { url: threadsUrl, label: "Threads", Icon: AtSign },
    { url: youtubeUrl, label: "YouTube", Icon: Youtube },
    { url: tiktokUrl, label: "TikTok", Icon: Music2 },
    { url: lineId ? `https://line.me/R/ti/p/${lineId}` : "", label: "LINE", Icon: AtSign },
  ].filter((s) => !!s.url);

  return (
    <footer
      data-site-chrome
      className="border-t border-border relative bg-white"
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-6 sm:py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-2 md:-ml-3">
            <img src={lokezeLogo} alt={t("booking.footer.logoAlt")} className="h-16 sm:h-24 object-contain" />
          </div>

          <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 sm:gap-x-6 text-sm text-muted-foreground">
            {!compactLinks && (
              <Link to="/member/auth" className="hover:text-foreground transition-colors">
                {t("booking.footer.member")}
              </Link>
            )}
            {/* 「關於我們」「聯繫客服」目前無對應頁面，原按鈕無 onClick 也無 href（假連結），依 SEO 規範移除 */}
            <Link to="/privacy" className="hover:text-foreground transition-colors">
              {t("booking.footer.privacy")}
            </Link>
            {!compactLinks && (
              <Link to="/data-deletion" className="hover:text-foreground transition-colors">
                {t("booking.footer.dataDeletion")}
              </Link>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {t("booking.footer.copyright", { year: new Date().getFullYear() })}
          </p>
        </div>

        {socials.length > 0 && (
          <div className="mt-4 flex justify-center md:justify-start gap-5">
            {socials.map(({ url, label, Icon }) => (
              <a
                key={label}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className={`hover:text-foreground transition-colors ${compactLinks ? "text-muted-foreground/60" : "text-muted-foreground"}`}
              >
                <Icon className="h-5 w-5" />
              </a>
            ))}
          </div>
        )}


        {/* 聯名合作夥伴 */}
        {!hidePartnershipInfo && (
          <BrandLogoBar
            scope="portal"
            hideMainLogo
            showPartnerLabels
            partnerLogoClassName="h-6 sm:h-7 w-auto"
            className="mt-4 pt-3 border-t border-border/50 justify-center sm:justify-end gap-2 opacity-80 hover:opacity-100 transition-opacity"
          />
        )}

      </div>

      {/* 返回頂部按鈕 */}
      <Button
        variant="outline"
        size="icon"
        onClick={scrollToTop}
        className="absolute right-6 -top-5 rounded-full h-10 w-10 bg-white border-border shadow-md hover:bg-accent"
        aria-label={t("booking.footer.backToTop")}
      >
        <ArrowUp className="h-4 w-4" />
      </Button>
    </footer>
  );
};

export default BookingFooter;
