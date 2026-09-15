import { Settings, Image, MessageCircle, Star, MapPin, Home, Utensils, FileQuestion, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface EmptySectionPlaceholderProps {
  sectionId: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  adminLink?: string;
  adminLinkText?: string;
  showAdminLink?: boolean;
  variant?: "default" | "minimal" | "card";
}

/**
 * 空值區塊佔位符元件
 * 用於當後台尚未設定內容時，在前台顯示友善的提示
 */
export const EmptySectionPlaceholder = ({
  sectionId,
  title,
  description,
  icon,
  adminLink,
  adminLinkText = "前往設定",
  showAdminLink = false,
  variant = "default"
}: EmptySectionPlaceholderProps) => {
  if (variant === "minimal") {
    return (
      <section id={sectionId} className="py-12 md:py-16 lg:py-20 bg-secondary/10">
        <div className="container mx-auto px-4 md:px-6">
          <div className="max-w-md mx-auto text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted/50 flex items-center justify-center text-muted-foreground/50">
              {icon}
            </div>
            <p className="text-muted-foreground/70 text-sm">{description}</p>
          </div>
        </div>
      </section>
    );
  }

  if (variant === "card") {
    return (
      <Card className="border-dashed border-2 border-muted-foreground/20 bg-muted/5">
        <CardContent className="py-8 md:py-12 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-muted/50 flex items-center justify-center text-muted-foreground/50">
            {icon}
          </div>
          <h3 className="font-medium text-muted-foreground/70 mb-1">{title}</h3>
          <p className="text-sm text-muted-foreground/50">{description}</p>
          {showAdminLink && adminLink && (
            <Link to={adminLink}>
              <Button variant="outline" size="sm" className="mt-4 gap-2">
                <Settings className="h-4 w-4" />
                {adminLinkText}
              </Button>
            </Link>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <section id={sectionId} className="py-12 md:py-16 lg:py-20 bg-muted/20">
      <div className="container mx-auto px-4 md:px-6">
        <div className="max-w-lg mx-auto text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-muted/50 flex items-center justify-center text-muted-foreground/40">
            {icon}
          </div>
          <h2 className="text-xl md:text-2xl font-semibold text-muted-foreground/60 mb-3">{title}</h2>
          <p className="text-muted-foreground/50 text-sm md:text-base mb-6">{description}</p>
          {showAdminLink && adminLink && (
            <Link to={adminLink}>
              <Button variant="outline" className="gap-2">
                <Plus className="h-4 w-4" />
                {adminLinkText}
              </Button>
            </Link>
          )}
        </div>
      </div>
    </section>
  );
};

// 預設的空值區塊配置
export const emptySectionConfigs = {
  rooms: {
    sectionId: "rooms",
    title: "房型資訊準備中",
    description: "我們正在準備房型資訊，敬請期待",
    icon: <Home className="h-8 w-8" />,
    adminLink: "/admin/room-inventory",
    adminLinkText: "新增房型"
  },
  gallery: {
    sectionId: "gallery",
    title: "精選照片準備中",
    description: "更多精彩照片即將呈現",
    icon: <Image className="h-8 w-8" />,
    adminLink: "/admin/website-content?tab=gallery",
    adminLinkText: "上傳照片"
  },
  facilities: {
    sectionId: "facilities",
    title: "設施服務準備中",
    description: "設施與服務資訊即將更新",
    icon: <Utensils className="h-8 w-8" />,
    adminLink: "/admin/website-content?tab=facilities",
    adminLinkText: "設定設施"
  },
  reviews: {
    sectionId: "reviews",
    title: "旅客評價準備中",
    description: "期待分享更多旅客的住宿體驗",
    icon: <Star className="h-8 w-8" />,
    adminLink: "/admin/reviews",
    adminLinkText: "新增評價"
  },
  faq: {
    sectionId: "faq",
    title: "常見問題準備中",
    description: "我們正在整理常見問題，敬請期待",
    icon: <FileQuestion className="h-8 w-8" />,
    adminLink: "/admin/faq",
    adminLinkText: "新增問題"
  },
  location: {
    sectionId: "location",
    title: "交通資訊準備中",
    description: "詳細交通指引即將提供",
    icon: <MapPin className="h-8 w-8" />,
    adminLink: "/admin/website-content?tab=basic-info",
    adminLinkText: "設定地址"
  }
};

export default EmptySectionPlaceholder;
