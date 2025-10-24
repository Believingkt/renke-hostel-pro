import { useEffect, useState } from "react";
import { Separator } from "@/components/ui/separator";
import { MapPin, Phone, Mail, Mountain, Facebook, Instagram } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface AccommodationInfo {
  name: string;
  address: string;
}

const Footer = () => {
  const [accommodationInfo, setAccommodationInfo] = useState<AccommodationInfo | null>(null);

  useEffect(() => {
    fetchAccommodationInfo();
  }, []);

  const fetchAccommodationInfo = async () => {
    const { data } = await supabase
      .from("accommodation_info")
      .select("name, address")
      .single();
    
    if (data) {
      setAccommodationInfo(data);
    }
  };

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
              <div className="flex items-center gap-2 mb-3 md:mb-4">
                <Mountain className="h-6 w-6 md:h-8 md:w-8 text-white" />
                <h3 className="text-xl md:text-2xl font-bold">{accommodationInfo?.name || "森山寫造"}</h3>
              </div>
              <p className="text-sm md:text-base text-white/80 mb-4 md:mb-6">山間的寧靜時光</p>
              <div className="flex gap-4">
                <a href="#" className="hover:text-primary transition-colors" aria-label="Facebook">
                  <Facebook className="h-5 w-5" />
                </a>
                <a href="#" className="hover:text-primary transition-colors" aria-label="Instagram">
                  <Instagram className="h-5 w-5" />
                </a>
              </div>
            </div>

            {/* 中間 - 快速連結 */}
            <div>
              <h4 className="text-base md:text-lg font-semibold mb-4 md:mb-6">快速連結</h4>
              <ul className="space-y-2 md:space-y-3">
                <li>
                  <button onClick={() => scrollToSection("home")} className="text-sm md:text-base text-white/80 hover:text-white transition-colors">
                    旅宿介紹
                  </button>
                </li>
                <li>
                  <button onClick={() => scrollToSection("rooms")} className="text-sm md:text-base text-white/80 hover:text-white transition-colors">
                    房型導覽
                  </button>
                </li>
                <li>
                  <button onClick={() => scrollToSection("booking-info")} className="text-sm md:text-base text-white/80 hover:text-white transition-colors">
                    訂房須知
                  </button>
                </li>
                <li>
                  <button onClick={() => scrollToSection("location")} className="text-sm md:text-base text-white/80 hover:text-white transition-colors">
                    交通&地圖
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
                  <span className="text-sm md:text-base text-white/80">{accommodationInfo?.address || "台灣南投縣信義鄉東埔村開高巷123號"}</span>
                </li>
                <li className="flex items-center gap-2 md:gap-3">
                  <Phone className="h-4 w-4 md:h-5 md:w-5 text-white/80 flex-shrink-0" />
                  <span className="text-sm md:text-base text-white/80">+886-49-270-1234</span>
                </li>
                <li className="flex items-center gap-2 md:gap-3">
                  <Mail className="h-4 w-4 md:h-5 md:w-5 text-white/80 flex-shrink-0" />
                  <span className="text-sm md:text-base text-white/80">info@moriyama-shazo.com</span>
                </li>
              </ul>
            </div>
          </div>

          <Separator className="my-6 md:my-8 bg-white/20" />
          
          <p className="text-center text-white/60 text-xs md:text-sm">
            © 2025 森山寫造. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
