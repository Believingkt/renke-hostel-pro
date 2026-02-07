/**
 * 自訂區塊前台顯示元件
 * 電腦版滿版、手機版自適應
 */

import { useIsMobile } from "@/hooks/use-mobile";

interface CustomSection {
  id: string;
  title: string | null;
  subtitle: string | null;
  image_url: string;
  mobile_image_url: string | null;
  link_url: string | null;
  link_text: string | null;
  is_enabled: boolean;
}

interface CustomSectionDisplayProps {
  sections: CustomSection[];
}

export const CustomSectionDisplay = ({ sections }: CustomSectionDisplayProps) => {
  const isMobile = useIsMobile();

  const enabledSections = sections.filter(s => s.is_enabled);

  if (enabledSections.length === 0) return null;

  return (
    <>
      {enabledSections.map((section) => {
        const imageUrl = isMobile && section.mobile_image_url 
          ? section.mobile_image_url 
          : section.image_url;

        const hasLink = section.link_url && section.link_url.trim() !== '';
        const hasText = section.title || section.link_text;

        const content = (
          <div className="relative w-full">
            {/* 圖片 */}
            <img
              src={imageUrl}
              alt={section.title || '自訂區塊'}
              className={`w-full h-auto ${isMobile ? 'object-contain' : 'object-cover'}`}
              loading="lazy"
            />

            {/* 文字覆蓋層 */}
            {hasText && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/20">
                {section.title && (
                  <h2 className="text-2xl md:text-4xl font-bold text-white text-center px-4 drop-shadow-lg">
                    {section.title}
                  </h2>
                )}
                {section.subtitle && (
                  <p className="text-base md:text-xl text-white/90 text-center px-4 mt-2 drop-shadow">
                    {section.subtitle}
                  </p>
                )}
                {hasLink && section.link_text && (
                  <span className="mt-4 px-6 py-2 bg-white/90 text-foreground rounded-lg font-medium hover:bg-white transition-colors">
                    {section.link_text}
                  </span>
                )}
              </div>
            )}
          </div>
        );

        if (hasLink) {
          return (
            <a
              key={section.id}
              href={section.link_url!}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full"
            >
              {content}
            </a>
          );
        }

        return (
          <div key={section.id} className="w-full">
            {content}
          </div>
        );
      })}
    </>
  );
};
