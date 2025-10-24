import { useEffect, useRef, useState } from "react";

export const useLazyImage = (src: string, rootMargin = "100px") => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!imgRef.current) return;

    // Safari 优化：更大的 rootMargin 提前加载
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setImageSrc(src);
            observer.disconnect();
          }
        });
      },
      { rootMargin, threshold: 0.01 }
    );

    observer.observe(imgRef.current);

    return () => {
      observer.disconnect();
    };
  }, [src, rootMargin]);

  const handleLoad = () => {
    setIsLoaded(true);
  };

  return { imageSrc, isLoaded, imgRef, handleLoad };
};
