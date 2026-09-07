import { useEffect } from "react";

interface SEOHeadProps {
  title: string;
  description: string;
  url?: string;
  image?: string;
  type?: string;
  keywords?: string[];
  /** 社群分享標題／描述；未提供時自動沿用 SEO 標題與描述 */
  ogTitle?: string;
  ogDescription?: string;
}

export const SEOHead = ({
  title,
  description,
  url = window.location.href,
  image,
  type = "website",
  keywords = ["豪華露營", "民宿", "住宿", "日式", "山林", "度假", "台灣旅遊"],
  ogTitle,
  ogDescription,
}: SEOHeadProps) => {
  const socialTitle = ogTitle?.trim() || title;
  const socialDescription = ogDescription?.trim() || description;
  // 立即同步更新標題，無需等待 useEffect（減少閃爍）
  if (typeof document !== 'undefined' && document.title !== title) {
    document.title = title;
  }

  useEffect(() => {
    // 確保標題已設定（雙重保險）
    if (document.title !== title) {
      document.title = title;
    }

    // 設置或更新 meta 標籤
    const setMetaTag = (name: string, content: string, property?: boolean) => {
      const attribute = property ? 'property' : 'name';
      let element = document.querySelector(`meta[${attribute}="${name}"]`);
      
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attribute, name);
        document.head.appendChild(element);
      }
      
      element.setAttribute('content', content);
    };

    // 基本 SEO 標籤
    setMetaTag('description', description);
    setMetaTag('keywords', keywords.join(', '));
    setMetaTag('author', title.split(' ')[0]);
    setMetaTag('robots', 'index, follow');
    setMetaTag('language', 'zh-TW');
    setMetaTag('revisit-after', '7 days');

    // Open Graph 標籤（未填社群欄位時自動沿用 SEO 標題／描述）
    setMetaTag('og:title', socialTitle, true);
    setMetaTag('og:description', socialDescription, true);
    setMetaTag('og:url', url, true);
    if (image) {
      setMetaTag('og:image', image, true);
      setMetaTag('og:image:secure_url', image, true);
      setMetaTag('og:image:type', image.endsWith('.jpg') || image.endsWith('.jpeg') ? 'image/jpeg' : 'image/png', true);
      setMetaTag('og:image:width', '1200', true);
      setMetaTag('og:image:height', '630', true);
      setMetaTag('og:image:alt', socialTitle, true);
    }
    setMetaTag('og:type', type, true);
    setMetaTag('og:locale', 'zh_TW', true);
    setMetaTag('og:site_name', title, true);

    // Twitter Card 標籤
    setMetaTag('twitter:card', 'summary_large_image');
    setMetaTag('twitter:title', socialTitle);
    setMetaTag('twitter:description', socialDescription);
    if (image) {
      setMetaTag('twitter:image', image);
      setMetaTag('twitter:image:alt', socialTitle);
    }


    // 設置 canonical URL
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = url;

    // 設置 viewport（如果還沒有）
    if (!document.querySelector('meta[name="viewport"]')) {
      const viewport = document.createElement('meta');
      viewport.name = 'viewport';
      viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=5.0';
      document.head.appendChild(viewport);
    }

  }, [title, description, url, image, type, keywords, socialTitle, socialDescription]);

  return null;
};
