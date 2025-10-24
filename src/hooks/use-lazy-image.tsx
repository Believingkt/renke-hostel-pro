import { useEffect, useRef, useState } from "react";

export const useLazyImage = (src: string, rootMargin = "50px") => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!imgRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setImageSrc(src);
            observer.disconnect();
          }
        });
      },
      { rootMargin }
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
