import { useNavigate } from "react-router-dom";
import { ArrowUp, Facebook, Instagram, Youtube, AtSign, Music2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import lokezeLogo from "@/assets/lakeze-portal-logo.png";
import owlnestLogo from "@/assets/owlnest-logo.png";

interface BookingFooterProps {
  lineId?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  threadsUrl?: string;
  youtubeUrl?: string;
  tiktokUrl?: string;
}

const BookingFooter = ({
  lineId,
  facebookUrl,
  instagramUrl,
  threadsUrl,
  youtubeUrl,
  tiktokUrl,
}: BookingFooterProps = {}) => {
  const navigate = useNavigate();

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
      className="border-t border-border relative bg-white"
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-6 sm:py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-2 md:-ml-3">
            <img src={lokezeLogo} alt="Lakeze 人客多" className="h-16 sm:h-24 object-contain" />
          </div>

          <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 sm:gap-x-6 text-sm text-muted-foreground">
            <button onClick={() => navigate("/member/auth")} className="hover:text-foreground transition-colors">
              會員中心
            </button>
            <button className="hover:text-foreground transition-colors">關於我們</button>
            <button className="hover:text-foreground transition-colors">聯繫客服</button>
            <button onClick={() => navigate("/privacy")} className="hover:text-foreground transition-colors">
              隱私政策
            </button>
            <button onClick={() => navigate("/data-deletion")} className="hover:text-foreground transition-colors">
              資料刪除
            </button>
          </div>
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} 人客多. All rights reserved.
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
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <Icon className="h-5 w-5" />
              </a>
            ))}
          </div>
        )}


        {/* 聯名合作夥伴 */}
        <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-center sm:justify-end gap-2 opacity-80 hover:opacity-100 transition-opacity">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground/70 font-semibold">
            技術合作
          </span>
          <div className="h-3 w-px bg-border" />
          <img
            src={owlnestLogo}
            alt="OwlNest"
            className="h-6 sm:h-7 w-auto object-contain"
            loading="lazy"
          />
        </div>
      </div>

      {/* 返回頂部按鈕 */}
      <Button
        variant="outline"
        size="icon"
        onClick={scrollToTop}
        className="absolute right-6 -top-5 rounded-full h-10 w-10 bg-white border-border shadow-md hover:bg-accent"
        aria-label="返回頂部"
      >
        <ArrowUp className="h-4 w-4" />
      </Button>
    </footer>
  );
};

export default BookingFooter;
