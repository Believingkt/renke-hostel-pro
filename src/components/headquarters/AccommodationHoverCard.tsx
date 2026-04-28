import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Badge } from "@/components/ui/badge";
import { Building2, Globe, MapPin, Phone, Mail, Image, Palette, Link2, Calendar } from "lucide-react";
import { getThemeConfig, THEME_PRESET_CONFIGS } from "@/constants/themes";

interface Accommodation {
  id: string;
  name: string;
  type: string | null;
  registration_number: string | null;
  country: string | null;
  region_1: string | null;
  region_2: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  description: string | null;
  short_url_alias: string | null;
  
  theme_preset: string | null;
  header_logo_url: string | null;
  footer_logo_url: string | null;
  is_active: boolean;
  created_at: string;
}

interface AccommodationHoverCardProps {
  accommodation: Accommodation;
  children: React.ReactNode;
}

export function AccommodationHoverCard({ accommodation, children }: AccommodationHoverCardProps) {
  const themeConfig = getThemeConfig(accommodation.theme_preset || "default");
  const { colors } = themeConfig;
  
  const hasAddress = accommodation.country || accommodation.region_1 || accommodation.region_2 || accommodation.address;
  const fullAddress = [
    accommodation.country,
    accommodation.region_1,
    accommodation.region_2,
    accommodation.address
  ].filter(Boolean).join(' ');

  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>
        {children}
      </HoverCardTrigger>
      <HoverCardContent 
        className="w-80 p-0 overflow-hidden" 
        side="right" 
        align="start"
        sideOffset={8}
      >
        {/* Header with theme gradient */}
        <div 
          className="p-4 text-white relative"
          style={{ 
            background: `linear-gradient(135deg, ${colors.primary}, ${colors.accent})` 
          }}
        >
          {/* Logo overlay */}
          {accommodation.header_logo_url && (
            <div className="absolute top-3 right-3 w-12 h-12 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center overflow-hidden">
              <img 
                src={accommodation.header_logo_url} 
                alt={`${accommodation.name} Logo`}
                className="max-w-[40px] max-h-[40px] object-contain"
              />
            </div>
          )}
          
          <div className="flex items-start gap-3 pr-14">
            {!accommodation.header_logo_url && (
              <div className="w-10 h-10 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
                <Building2 className="h-5 w-5 text-white" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h4 className="font-semibold text-base leading-tight truncate">
                {accommodation.name}
              </h4>
              {accommodation.type && (
                <p className="text-white/80 text-xs mt-0.5">{accommodation.type}</p>
              )}
              <Badge 
                variant={accommodation.is_active ? "secondary" : "outline"} 
                className="mt-2 text-xs bg-white/20 text-white border-white/30 hover:bg-white/30"
              >
                {accommodation.is_active ? "營運中" : "已停用"}
              </Badge>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3 bg-background">
          {/* Theme info */}
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="flex gap-1">
                <div 
                  className="w-4 h-4 rounded-full border-2 border-background shadow-sm"
                  style={{ backgroundColor: colors.primary }}
                />
                <div 
                  className="w-4 h-4 rounded-full border-2 border-background shadow-sm"
                  style={{ backgroundColor: colors.accent }}
                />
              </div>
              <span className="text-sm truncate">
                {themeConfig.label}
              </span>
              {themeConfig.description && (
                <span className="text-xs text-muted-foreground truncate hidden sm:inline">
                  - {themeConfig.description}
                </span>
              )}
            </div>
          </div>

          {/* URLs */}
          <div className="space-y-1.5">
            {accommodation.short_url_alias && (
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <a 
                  href={`https://${accommodation.short_url_alias}.lakeze.com`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline truncate"
                >
                  {accommodation.short_url_alias}.lakeze.com
                </a>
              </div>
            )}
          </div>

          {/* Address */}
          {hasAddress && (
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              <span className="text-sm text-muted-foreground line-clamp-2">
                {fullAddress}
              </span>
            </div>
          )}

          {/* Contact info */}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {accommodation.phone && (
              <div className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{accommodation.phone}</span>
              </div>
            )}
            {accommodation.email && (
              <div className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground truncate max-w-[150px]">{accommodation.email}</span>
              </div>
            )}
          </div>

          {/* Logo preview */}
          {(accommodation.header_logo_url || accommodation.footer_logo_url) && (
            <div className="pt-2 border-t">
              <div className="flex items-center gap-2 mb-2">
                <Image className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-medium">Logo 設定</span>
              </div>
              <div className="flex gap-3">
                {accommodation.header_logo_url && (
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-14 h-14 rounded-lg border bg-muted/30 flex items-center justify-center overflow-hidden">
                      <img 
                        src={accommodation.header_logo_url} 
                        alt="Header Logo"
                        className="max-w-[48px] max-h-[48px] object-contain"
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground">網站標頭</span>
                  </div>
                )}
                {accommodation.footer_logo_url && (
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-14 h-14 rounded-lg border bg-muted/30 flex items-center justify-center overflow-hidden">
                      <img 
                        src={accommodation.footer_logo_url} 
                        alt="Footer Logo"
                        className="max-w-[48px] max-h-[48px] object-contain"
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground">網站頁尾</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Created date */}
          <div className="flex items-center gap-2 pt-2 border-t">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              建立於 {new Date(accommodation.created_at).toLocaleDateString("zh-TW", {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </span>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
