import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";

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
  const isMobile = useIsMobile();
  
  // 手機版顯示 6 張（2列x3欄），平板和桌面顯示 12 張
  const photosPerPage = isMobile ? 6 : 12;

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
    <section id="gallery" className="py-12 md:py-20 bg-secondary/20">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12 md:mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-3 md:mb-4">精選照片</h2>
          <p className="text-center text-muted-foreground text-base md:text-lg mb-0">探索更多精彩瞬間</p>
        </div>

        <div className="max-w-7xl mx-auto bg-card rounded-xl shadow-lg p-5 md:p-6 border border-border/50 relative">
          {totalPages > 1 && (
            <>
              <Button
                variant="outline"
                size="icon"
                className="absolute left-2 top-1/2 -translate-y-1/2 z-10 bg-background/90 hover:bg-background shadow-lg"
                onClick={handlePrevPage}
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-background/90 hover:bg-background shadow-lg"
                onClick={handleNextPage}
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Button>
            </>
          )}
          
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {currentPhotos.map((photo, index) => {
            // 調整大縮圖位置邏輯：在每頁的第1和第7張設為大圖（索引0和6）
            const isLarge = index === 0 || index === 6;
            const gridSpan = isLarge ? "md:col-span-2 md:row-span-2" : "";
            const globalIndex = startIndex + index;
            
            return (
              <div
                key={photo.id}
                className={`relative overflow-hidden rounded-xl cursor-pointer group animate-fade-in ${gridSpan}`}
                style={{ 
                  aspectRatio: isLarge ? "1" : "1",
                  animationDelay: `${index * 50}ms`
                }}
                onClick={() => setSelectedImageIndex(index)}
              >
                <img
                  src={photo.photo_url}
                  alt={`相簿照片 ${globalIndex + 1}`}
                  className="w-full h-full object-cover transition-all duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="absolute inset-0 ring-2 ring-primary/0 group-hover:ring-primary/50 transition-all duration-300 rounded-xl" />
              </div>
            );
          })}
          </div>
          
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 mt-6">
              {Array.from({ length: totalPages }).map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentPage(idx)}
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    idx === currentPage 
                      ? 'bg-primary w-8' 
                      : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
                  }`}
                  aria-label={`跳到第 ${idx + 1} 頁`}
                />
              ))}
            </div>
          )}
        </div>

        <Dialog open={selectedImageIndex !== null} onOpenChange={() => setSelectedImageIndex(null)}>
          <DialogContent hideCloseButton={true} className="max-w-[100vw] w-[100vw] h-[100vh] p-0 border-0 overflow-hidden">
            <div className="relative w-full h-full flex items-center justify-center bg-black">
              {selectedImageIndex !== null && (
                <>
                  <img
                    src={sortedPhotos[startIndex + selectedImageIndex].photo_url}
                    alt={`相簿照片 ${startIndex + selectedImageIndex + 1}`}
                    className="max-w-[90vw] max-h-[90vh] w-auto h-auto object-contain"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="absolute right-4 md:right-6 top-4 md:top-6 h-12 w-12 rounded-full bg-white/10 hover:bg-white/20 border-white/20 backdrop-blur-sm z-[60] shadow-lg"
                    onClick={() => setSelectedImageIndex(null)}
                  >
                    <X className="h-6 w-6 text-white" />
                    <span className="sr-only">關閉</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="absolute left-4 md:left-6 top-1/2 -translate-y-1/2 h-14 w-14 md:h-16 md:w-16 rounded-full bg-white/10 hover:bg-white/20 border-white/20 backdrop-blur-sm z-[60] shadow-lg"
                    onClick={handlePrevImage}
                  >
                    <svg className="h-7 w-7 md:h-8 md:w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="absolute right-4 md:right-6 top-1/2 -translate-y-1/2 h-14 w-14 md:h-16 md:w-16 rounded-full bg-white/10 hover:bg-white/20 border-white/20 backdrop-blur-sm z-[60] shadow-lg"
                    onClick={handleNextImage}
                  >
                    <svg className="h-7 w-7 md:h-8 md:w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Button>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </section>
  );
};

export default PhotoGallerySection;