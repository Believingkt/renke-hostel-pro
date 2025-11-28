import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { ImageViewerPortal } from "./ImageViewerPortal";
import { OptimizedImage } from "./OptimizedImage";
import { generateBlurDataURLs } from "@/utils/imageBlurHelper";

interface Photo {
  id: string;
  photo_url: string;
  display_order: number;
}

interface PhotoGallerySectionProps {
  photos: Photo[];
}

const PhotoGallerySection = ({ photos }: PhotoGallerySectionProps) => {
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [blurDataURLs, setBlurDataURLs] = useState<Map<string, string>>(new Map());
  const isMobile = useIsMobile();
  
  // 手機版顯示 6 張（2列x3欄），平板和桌面顯示 12 張
  const photosPerPage = isMobile ? 6 : 12;

  // 生成圖片模糊預覽
  useEffect(() => {
    if (!photos || photos.length === 0) return;

    const generateBlurs = async () => {
      try {
        const imageUrls = photos.map(photo => photo.photo_url);
        const blurs = await generateBlurDataURLs(imageUrls);
        setBlurDataURLs(blurs);
      } catch (error) {
        console.error('生成模糊預覽失敗:', error);
      }
    };

    // 延遲生成，避免阻塞主線程
    const timer = setTimeout(generateBlurs, 500);
    return () => clearTimeout(timer);
  }, [photos]);

  if (!photos || photos.length === 0) {
    return null;
  }

  const sortedPhotos = [...photos].sort((a, b) => a.display_order - b.display_order);
  const totalPages = Math.ceil(sortedPhotos.length / photosPerPage);
  const startIndex = currentPage * photosPerPage;
  const endIndex = startIndex + photosPerPage;
  const currentPhotos = sortedPhotos.slice(startIndex, endIndex);

  const handlePrevPage = () => {
    setCurrentPage((prev) => (prev > 0 ? prev - 1 : totalPages - 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => (prev < totalPages - 1 ? prev + 1 : 0));
  };

  const handleCloseViewer = () => {
    setSelectedImageIndex(null);
    setTimeout(() => {
      const gallerySection = document.getElementById('gallery');
      if (gallerySection) {
        gallerySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  const handlePrevImage = () => {
    if (selectedImageIndex !== null) {
      const globalIndex = startIndex + selectedImageIndex;
      const newGlobalIndex = (globalIndex - 1 + sortedPhotos.length) % sortedPhotos.length;
      const newPage = Math.floor(newGlobalIndex / photosPerPage);
      const newLocalIndex = newGlobalIndex % photosPerPage;
      setCurrentPage(newPage);
      setSelectedImageIndex(newLocalIndex);
    }
  };

  const handleNextImage = () => {
    if (selectedImageIndex !== null) {
      const globalIndex = startIndex + selectedImageIndex;
      const newGlobalIndex = (globalIndex + 1) % sortedPhotos.length;
      const newPage = Math.floor(newGlobalIndex / photosPerPage);
      const newLocalIndex = newGlobalIndex % photosPerPage;
      setCurrentPage(newPage);
      setSelectedImageIndex(newLocalIndex);
    }
  };

  return (
    <section id="gallery" className="py-12 md:py-16 lg:py-20 bg-secondary/20">
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-center mb-10 md:mb-12 lg:mb-16">
          <h2 className="text-3xl md:text-3xl lg:text-4xl font-bold text-center mb-3 md:mb-3 lg:mb-4">精選照片</h2>
          <p className="text-center text-muted-foreground text-base md:text-base lg:text-lg mb-0 max-w-3xl mx-auto">探索更多精彩瞬間</p>
        </div>

        <div className="max-w-7xl mx-auto bg-card rounded-xl shadow-lg p-4 md:p-5 lg:p-6 border border-border/50 relative">
          {totalPages > 1 && (
            <>
              <Button
                variant="outline"
                size="icon"
                className="absolute left-2 top-1/2 -translate-y-1/2 z-10 bg-background/90 hover:bg-background shadow-lg h-8 w-8 md:h-9 md:w-9 lg:h-10 lg:w-10"
                onClick={handlePrevPage}
              >
                <svg className="h-4 w-4 md:h-5 md:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-background/90 hover:bg-background shadow-lg h-8 w-8 md:h-9 md:w-9 lg:h-10 lg:w-10"
                onClick={handleNextPage}
              >
                <svg className="h-4 w-4 md:h-5 md:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Button>
            </>
          )}
          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 md:gap-3">
          {currentPhotos.map((photo, index) => {
            // 調整大縮圖位置邏輯：在每頁的第1和第7張設為大圖（索引0和6）
            const isLarge = index === 0 || index === 6;
            const gridSpan = isLarge ? "md:col-span-2 md:row-span-2" : "";
            const globalIndex = startIndex + index;
            
            return (
              <div
                key={photo.id}
                className={`relative overflow-hidden rounded-lg md:rounded-xl cursor-pointer group animate-fade-in ${gridSpan}`}
                style={{ 
                  aspectRatio: isLarge ? "1" : "1",
                  animationDelay: `${index * 50}ms`
                }}
                onClick={() => setSelectedImageIndex(index)}
              >
                <OptimizedImage
                  src={photo.photo_url}
                  alt={`相簿照片 ${globalIndex + 1} - 森山寫照住宿環境`}
                  className="w-full h-full object-cover transition-all duration-500 group-hover:scale-110"
                  width={isLarge ? "800" : "400"}
                  height={isLarge ? "800" : "400"}
                  sizes={isLarge 
                    ? "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" 
                    : "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
                  }
                  priority={index < 2} // 前兩張優先載入
                  blurDataURL={blurDataURLs.get(photo.photo_url)}
                  responsive={true}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="absolute inset-0 ring-2 ring-primary/0 group-hover:ring-primary/50 transition-all duration-300 rounded-lg md:rounded-xl" />
              </div>
            );
          })}
          </div>
          
          {totalPages > 1 && (
            <div className="hidden md:flex justify-center items-center gap-2 mt-5 md:mt-6">
              {Array.from({ length: totalPages }).map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentPage(idx)}
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    idx === currentPage 
                      ? 'bg-primary w-6 md:w-8' 
                      : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
                  }`}
                  aria-label={`跳到第 ${idx + 1} 頁`}
                />
              ))}
            </div>
          )}
        </div>

        {selectedImageIndex !== null && (
          <ImageViewerPortal
            imageUrl={sortedPhotos[startIndex + selectedImageIndex].photo_url}
            onClose={handleCloseViewer}
            onPrev={handlePrevImage}
            onNext={handleNextImage}
          />
        )}
      </div>
    </section>
  );
};

export default PhotoGallerySection;