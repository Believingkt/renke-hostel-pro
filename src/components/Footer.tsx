import { Separator } from "@/components/ui/separator";
import { MapPin, Phone, Mail, Facebook, Instagram } from "lucide-react";
import sensanLogoWhite from "@/assets/sensan-logo-white.png";
import lakezeLogoWhite from "@/assets/lakeze-logo-white.png";

interface FooterProps {
  accommodationName?: string;
  address?: string;
}

const Footer = ({ accommodationName, address }: FooterProps) => {

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <footer className="bg-[#0d2620] text-white py-8 md:py-16">
      <div className="container mx-auto px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 mb-8 md:mb-12">
            {/* 左側 - Logo 與社交媒體 */}
            <div>
              <div className="mb-4 md:mb-6">
                <img src={sensanLogoWhite} alt={accommodationName || "森山寫照"} className="h-12 md:h-16 w-auto" />
              </div>
              <div className="flex gap-4">
                <a 
                  href="https://www.facebook.com/profile.php?id=61577434234279" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary transition-colors" 
                  aria-label="Facebook"
                >
                  <Facebook className="h-5 w-5" />
                </a>
                <a 
                  href="https://www.instagram.com/sensan.inn_" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary transition-colors" 
                  aria-label="Instagram"
                >
                  <Instagram className="h-5 w-5" />
                </a>
              </div>
            </div>

            {/* 中間 - 快速連結 */}
            <div>
              <h4 className="text-base md:text-lg font-semibold mb-4 md:mb-6">快速連結</h4>
              <ul className="space-y-2 md:space-y-3">
                <li>
                  <button onClick={() => scrollToSection("rooms")} className="text-sm md:text-base text-white/80 hover:text-white transition-colors">
                    房型導覽
                  </button>
                </li>
                <li>
                  <button onClick={() => scrollToSection("facilities")} className="text-sm md:text-base text-white/80 hover:text-white transition-colors">
                    設施與服務
                  </button>
                </li>
                <li>
                  <button onClick={() => scrollToSection("location")} className="text-sm md:text-base text-white/80 hover:text-white transition-colors">
                    交通 & 地圖
                  </button>
                </li>
                <li>
                  <button onClick={() => scrollToSection("booking-info")} className="text-sm md:text-base text-white/80 hover:text-white transition-colors">
                    訂房須知
                  </button>
                </li>
                <li>
                  <button onClick={() => scrollToSection("faq")} className="text-sm md:text-base text-white/80 hover:text-white transition-colors">
                    常見問題
                  </button>
                </li>
              </ul>
            </div>

            {/* 右側 - 聯絡資訊 */}
            <div>
              <h4 className="text-base md:text-lg font-semibold mb-4 md:mb-6">聯絡資訊</h4>
              <ul className="space-y-3 md:space-y-4">
                <li className="flex items-start gap-2 md:gap-3">
                  <MapPin className="h-4 w-4 md:h-5 md:w-5 text-white/80 flex-shrink-0 mt-0.5" />
                  <span className="text-sm md:text-base text-white/80">{address || "台灣南投縣信義鄉東埔村開高巷123號"}</span>
                </li>
                <li className="flex items-center gap-2 md:gap-3">
                  <Phone className="h-4 w-4 md:h-5 md:w-5 text-white/80 flex-shrink-0" />
                  <span className="text-sm md:text-base text-white/80">0903178518</span>
                </li>
                <li className="flex items-center gap-2 md:gap-3">
                  <svg 
                    className="h-4 w-4 md:h-5 md:w-5 text-white/80 flex-shrink-0" 
                    viewBox="0 0 24 24" 
                    fill="currentColor"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
                  </svg>
                  <span className="text-sm md:text-base text-white/80">@042deypa</span>
                </li>
                <li className="flex items-center gap-2 md:gap-3">
                  <Mail className="h-4 w-4 md:h-5 md:w-5 text-white/80 flex-shrink-0" />
                  <span className="text-sm md:text-base text-white/80">sensan.inn@gmail.com</span>
                </li>
              </ul>
            </div>
          </div>

          <Separator className="my-6 md:my-8 bg-white/20" />
          
          <div className="flex items-center justify-center gap-2 text-white/60 text-xs md:text-sm">
            <span>PRESENTED BY</span>
            <a href="https://lakeze.com" target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity inline-flex items-center">
              <img src={lakezeLogoWhite} alt="Lakeze" className="h-4 md:h-5 w-auto mb-0.5" />
            </a>
            <span>. 2025 © All Rights Reserved.</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
