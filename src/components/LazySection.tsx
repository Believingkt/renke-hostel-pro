import { useState, useEffect, useRef, ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";

interface LazySectionProps {
  children: ReactNode;
  fallback?: ReactNode;
  rootMargin?: string;
  threshold?: number;
  minHeight?: string;
  className?: string;
}

/**
 * 區塊級懶加載組件 - 只有當區塊進入視口時才渲染內容
 * 適用於首頁長頁面的各個區塊，減少初始渲染負擔
 */
export const LazySection = ({
  children,
  fallback,
  rootMargin = "200px",
  threshold = 0.01,
  minHeight = "300px",
  className = "",
}: LazySectionProps) => {
  const [isInView, setIsInView] = useState(false);
  const [hasRendered, setHasRendered] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            setHasRendered(true);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin,
        threshold,
      }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [rootMargin, threshold]);

  // 一旦渲染過，即使滾出視口也保持渲染狀態
  if (hasRendered) {
    return <div className={className}>{children}</div>;
  }

  // 還沒進入視口，顯示佔位符
  if (!isInView) {
    return (
      <div ref={sectionRef} className={className} style={{ minHeight }}>
        {fallback || (
          <div className="flex items-center justify-center h-full py-12">
            <div className="animate-pulse space-y-4 w-full max-w-4xl mx-auto px-4">
              <Skeleton className="h-8 w-48 mx-auto" />
              <Skeleton className="h-4 w-96 mx-auto" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
                <Skeleton className="h-32" />
                <Skeleton className="h-32" />
                <Skeleton className="h-32 hidden md:block" />
                <Skeleton className="h-32 hidden md:block" />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return <div className={className}>{children}</div>;
};

/**
 * 通用的區塊載入中佔位符
 */
export const SectionLoadingFallback = ({ height = "300px" }: { height?: string }) => (
  <div className="flex items-center justify-center bg-muted/20 animate-pulse" style={{ minHeight: height }}>
    <div className="space-y-4 w-full max-w-4xl mx-auto px-4 py-12">
      <Skeleton className="h-8 w-48 mx-auto" />
      <Skeleton className="h-4 w-64 mx-auto" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24 hidden md:block" />
        <Skeleton className="h-24 hidden md:block" />
      </div>
    </div>
  </div>
);

export default LazySection;
