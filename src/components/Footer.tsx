import { Separator } from "@/components/ui/separator";
import { MapPin, Phone, Mail, Facebook, Instagram, Youtube, ChevronUp } from "lucide-react";
import lakezeLogoWhite from "@/assets/lakeze-logo-white.png";
import AccommodationLogo from "@/components/AccommodationLogo";

interface FooterProps {
  accommodationName?: string;
  address?: string;
  phone?: string;
  email?: string;
  lineId?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  threadsUrl?: string;
  youtubeUrl?: string;
  tiktokUrl?: string;
}

const Footer = ({ accommodationName, address, phone, email, lineId, facebookUrl, instagramUrl, threadsUrl, youtubeUrl, tiktokUrl }: FooterProps) => {
  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <footer className="bg-[hsl(var(--footer-background))] text-white py-8 md:py-16">
      <div className="container mx-auto px-4">
        <div className="max-w-6xl mx-auto">
          {/* 手機版：改為單欄垂直排列，更緊湊的佈局 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 mb-8 md:mb-12">
            
            {/* Logo 與社交媒體 */}
            <div className="text-center md:text-left order-1">
              <div className="mb-4 md:mb-6 flex justify-center md:justify-start">
                <AccommodationLogo
                  variant="footer"
                  accommodationName={accommodationName}
                />
              </div>
              <div className="flex gap-5 justify-center md:justify-start">
                {facebookUrl && (
                  <a 
                    href={facebookUrl} 
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white/70 hover:text-white transition-colors" 
                    aria-label="Facebook"
                  >
                    <Facebook className="h-5 w-5 md:h-5 md:w-5" />
                  </a>
                )}
                {instagramUrl && (
                  <a 
                    href={instagramUrl} 
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white/70 hover:text-white transition-colors" 
                    aria-label="Instagram"
                  >
                    <Instagram className="h-5 w-5 md:h-5 md:w-5" />
                  </a>
                )}
                {lineId && (
                  <a 
                    href={`https://line.me/R/ti/p/${lineId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white/70 hover:text-white transition-colors" 
                    aria-label="LINE"
                  >
                    <svg 
                      className="h-5 w-5" 
                      viewBox="0 0 24 24" 
                      fill="currentColor"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
                    </svg>
                  </a>
                )}
                {threadsUrl && (
                  <a 
                    href={threadsUrl} 
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white/70 hover:text-white transition-colors" 
                    aria-label="Threads"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 192 192" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                      <path d="M141.537 88.9883C140.71 88.5919 139.87 88.2104 139.019 87.8451C137.537 60.5382 122.616 44.905 97.5619 44.745C97.4484 44.7443 97.3355 44.7443 97.222 44.7443C82.2364 44.7443 69.7731 51.1409 62.102 62.7807L75.881 72.2328C81.6116 63.5383 90.6052 61.6848 97.2286 61.6848C97.3051 61.6848 97.3819 61.6848 97.4576 61.6855C105.707 61.7381 111.932 64.1366 115.961 68.814C118.893 72.2193 120.854 76.925 121.825 82.8638C114.511 81.6207 106.601 81.2385 98.145 81.7233C74.3247 83.0954 59.0111 96.9879 60.0396 116.292C60.5615 126.084 65.4397 134.508 73.775 140.011C80.8224 144.663 89.899 146.938 99.3323 146.423C111.79 145.74 121.563 140.987 128.381 132.296C133.559 125.696 136.834 117.143 138.28 106.366C144.217 109.949 148.617 114.664 151.047 120.332C155.179 129.967 155.42 145.8 142.501 158.708C131.182 170.016 117.576 174.908 97.0135 175.059C74.2042 174.89 56.9538 167.575 45.7381 153.317C35.2355 139.966 29.8077 120.682 29.6052 96C29.8077 71.3178 35.2355 52.0336 45.7381 38.6827C56.9538 24.4249 74.2039 17.11 97.0132 16.9405C119.988 17.1113 137.539 24.4614 149.184 38.788C154.894 45.8136 159.199 54.6488 162.037 64.9503L178.184 60.6422C174.744 47.9622 169.331 37.0357 161.965 27.974C147.036 9.60668 125.202 0.195148 97.0695 0H96.9569C68.8816 0.19447 47.2921 9.6418 32.7883 28.0793C19.8819 44.4864 13.2244 67.3157 13.0007 95.9325L13 96L13.0007 96.0675C13.2244 124.684 19.8819 147.514 32.7883 163.921C47.2921 182.358 68.8816 191.806 96.9569 192H97.0695C122.03 191.827 139.624 185.292 154.118 170.811C173.081 151.866 172.51 128.119 166.26 113.541C161.776 103.087 153.227 94.5962 141.537 88.9883ZM98.4405 129.507C88.0005 130.095 77.1544 125.409 76.6196 115.372C76.2232 107.93 81.9158 99.626 99.0812 98.6368C101.047 98.5234 102.976 98.468 104.871 98.468C111.106 98.468 116.939 99.0737 122.242 100.233C120.264 124.935 108.662 128.946 98.4405 129.507Z"/>
                    </svg>
                  </a>
                )}
                {youtubeUrl && (
                  <a 
                    href={youtubeUrl} 
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white/70 hover:text-white transition-colors" 
                    aria-label="YouTube"
                  >
                    <Youtube className="h-5 w-5 md:h-5 md:w-5" />
                  </a>
                )}
                {tiktokUrl && (
                  <a 
                    href={tiktokUrl} 
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white/70 hover:text-white transition-colors" 
                    aria-label="TikTok"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
                    </svg>
                  </a>
                )}
              </div>
            </div>

            {/* 聯絡資訊 - 手機版放在第二個 */}
            <div className="text-center md:text-left order-2 md:order-3">
              <h4 className="text-base md:text-lg font-semibold mb-4 md:mb-6">聯絡資訊</h4>
              <ul className="space-y-3 md:space-y-4 flex flex-col items-center md:items-start">
                <li>
                  <a 
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address || "台灣南投縣信義鄉東埔村開高巷123號")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-start gap-2.5 text-sm md:text-base text-white/70 hover:text-white transition-colors"
                  >
                    <MapPin className="h-4 w-4 md:h-5 md:w-5 flex-shrink-0 mt-0.5" />
                    <span className="text-left">{address || "台灣南投縣信義鄉東埔村開高巷123號"}</span>
                  </a>
                </li>
                {phone && (
                  <li>
                    <a 
                      href={`tel:${phone.replace(/\s/g, '')}`}
                      className="inline-flex items-center gap-2.5 text-sm md:text-base text-white/70 hover:text-white transition-colors"
                    >
                      <Phone className="h-4 w-4 md:h-5 md:w-5 flex-shrink-0" />
                      <span>{phone}</span>
                    </a>
                  </li>
                )}
                {lineId && (
                  <li>
                    <a 
                      href={`https://line.me/R/ti/p/${lineId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2.5 text-sm md:text-base text-white/70 hover:text-white transition-colors"
                    >
                      <svg 
                        className="h-4 w-4 md:h-5 md:w-5 flex-shrink-0" 
                        viewBox="0 0 24 24" 
                        fill="currentColor"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
                      </svg>
                      <span>{lineId}</span>
                    </a>
                  </li>
                )}
                {email && (
                  <li>
                    <a 
                      href={`mailto:${email}`}
                      className="inline-flex items-center gap-2.5 text-sm md:text-base text-white/70 hover:text-white transition-colors"
                    >
                      <Mail className="h-4 w-4 md:h-5 md:w-5 flex-shrink-0" />
                      <span>{email}</span>
                    </a>
                  </li>
                )}
              </ul>
            </div>

            {/* 快速連結 - 手機版放在最後 */}
            <div className="text-center md:text-left order-3 md:order-2">
              <h4 className="text-base md:text-lg font-semibold mb-4 md:mb-6">快速連結</h4>
              {/* 手機版使用兩欄，桌機版使用單欄 */}
              <ul className="grid grid-cols-2 md:grid-cols-1 gap-2 md:gap-3">
                <li>
                  <button onClick={() => scrollToSection("rooms")} className="text-sm md:text-base text-white/70 hover:text-white transition-colors">
                    房型導覽
                  </button>
                </li>
                <li>
                  <button onClick={() => scrollToSection("facilities")} className="text-sm md:text-base text-white/70 hover:text-white transition-colors">
                    設施服務
                  </button>
                </li>
                <li>
                  <button onClick={() => scrollToSection("gallery")} className="text-sm md:text-base text-white/70 hover:text-white transition-colors">
                    精選照片
                  </button>
                </li>
                <li>
                  <button onClick={() => scrollToSection("location")} className="text-sm md:text-base text-white/70 hover:text-white transition-colors">
                    交通地圖
                  </button>
                </li>
                <li>
                  <button onClick={() => scrollToSection("booking-info")} className="text-sm md:text-base text-white/70 hover:text-white transition-colors">
                    訂房須知
                  </button>
                </li>
                <li>
                  <button onClick={() => scrollToSection("faq")} className="text-sm md:text-base text-white/70 hover:text-white transition-colors">
                    常見問題
                  </button>
                </li>
              </ul>
            </div>
          </div>

          {/* 返回頂部按鈕 */}
          <div className="flex justify-center mb-6 md:mb-8">
            <button
              onClick={scrollToTop}
              className="flex flex-col items-center gap-1 text-white/50 hover:text-white transition-colors group"
              aria-label="返回頂部"
            >
              <div className="w-10 h-10 rounded-full border border-white/30 group-hover:border-white/60 flex items-center justify-center transition-colors">
                <ChevronUp className="h-5 w-5" />
              </div>
              <span className="text-xs">返回頂部</span>
            </button>
          </div>

          <Separator className="my-6 md:my-8 bg-white/20" />
          
          <div className="flex flex-col items-center justify-center gap-3 text-white/50 text-xs md:text-sm">
            <div className="flex flex-wrap items-center justify-center gap-3 md:gap-4">
              <a href="/privacy" className="hover:text-white transition-colors">隱私政策</a>
              <span className="opacity-40">·</span>
              <a href="/data-deletion" className="hover:text-white transition-colors">用戶資料刪除</a>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-1.5 md:gap-2">
              <span>PRESENTED BY</span>
              <a href="https://lakeze.co/" target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity inline-flex items-center">
                <img src={lakezeLogoWhite} alt="Lakeze" className="h-4 md:h-5 w-auto -translate-y-0.5" loading="lazy" />
              </a>
              <span>2026 © All Rights Reserved.</span>
            </div>
            
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
