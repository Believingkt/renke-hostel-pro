import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { useSubdomain } from "@/hooks/use-subdomain";

// 天頌幸福和苑的 ID - 使用橘色主題
const TIANSONG_ID = '4ee31aca-5641-4d05-80e2-1c67626be83d';
// Navigation Skeleton
export const NavigationSkeleton = () => (
  <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
    <div className="container mx-auto px-4">
      <div className="flex h-16 items-center justify-between">
        <Skeleton className="h-10 w-32" />
        <div className="hidden md:flex gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton 
              key={i} 
              className="h-4 w-16"
            />
          ))}
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-9 md:hidden" />
        </div>
      </div>
    </div>
  </header>
);

// Hero Skeleton
export const HeroSkeleton = () => (
  <section className="relative h-[400px] md:h-[600px] lg:h-[700px]">
    <Skeleton className="absolute inset-0" />
    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/20 to-background/90" />
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="text-center space-y-4 px-4">
        <Skeleton className="h-12 md:h-16 w-64 md:w-96 mx-auto" />
        <Skeleton className="h-6 w-48 md:w-64 mx-auto" />
      </div>
    </div>
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-full max-w-4xl px-4">
      <Card className="shadow-2xl">
        <CardContent className="p-4 md:p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton 
                key={i} 
                className="h-10 md:h-12"
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  </section>
);

// About Skeleton
export const AboutSkeleton = () => (
  <section className="py-12 md:py-20 bg-background">
    <div className="container mx-auto px-4">
      <div className="max-w-6xl mx-auto">
        <Skeleton className="h-10 w-64 mx-auto mb-4" />
        <Skeleton className="h-6 w-96 mx-auto mb-16" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-6 md:p-8 text-center">
                <Skeleton className="w-20 h-20 md:w-24 md:h-24 rounded-full mx-auto mb-6" />
                <Skeleton className="h-6 w-24 mx-auto mb-3" />
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-3/4 mx-auto" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  </section>
);

// Rooms Skeleton
export const RoomsSkeleton = () => (
  <section className="py-12 md:py-20 bg-secondary/20">
    <div className="container mx-auto px-4">
      <Skeleton className="h-10 w-48 mx-auto mb-4" />
      <Skeleton className="h-6 w-96 mx-auto mb-16" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <Skeleton className="aspect-[16/10] md:aspect-[4/3]" />
            <CardContent className="p-5 md:p-6">
              <Skeleton className="h-7 w-32 mb-2" />
              <Skeleton className="h-5 w-24 mb-4" />
              <div className="space-y-2 mb-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
              </div>
              <div className="space-y-3 mb-4">
                {[1, 2].map((j) => (
                  <div key={j} className="flex justify-between">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-5 w-24" />
                  </div>
                ))}
              </div>
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  </section>
);

// Facilities Skeleton
export const FacilitiesSkeleton = () => (
  <section className="py-12 md:py-20 bg-background">
    <div className="container mx-auto px-4">
      <Skeleton className="h-10 w-48 mx-auto mb-4" />
      <Skeleton className="h-6 w-96 mx-auto mb-16" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6 max-w-6xl mx-auto">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-5 md:p-6">
              <Skeleton className="h-6 w-40 mb-4" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[1, 2, 3, 4, 5, 6].map((j) => (
                  <div key={j} className="flex items-start gap-2">
                    <Skeleton className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <Skeleton className="h-4 flex-1" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  </section>
);

// Photo Gallery Skeleton
export const PhotoGallerySkeleton = () => (
  <section className="py-12 md:py-20 bg-secondary/20">
    <div className="container mx-auto px-4">
      <Skeleton className="h-10 w-48 mx-auto mb-4" />
      <Skeleton className="h-6 w-96 mx-auto mb-16" />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4 max-w-7xl mx-auto">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <Skeleton 
            key={i} 
            className={`aspect-square ${i === 1 ? 'col-span-2 row-span-2' : ''}`}
          />
        ))}
      </div>
    </div>
  </section>
);

// Location Skeleton
export const LocationSkeleton = () => (
  <section className="py-12 md:py-20 bg-background">
    <div className="container mx-auto px-4">
      <div className="max-w-6xl mx-auto">
        <Skeleton className="h-10 w-48 mx-auto mb-4" />
        <Skeleton className="h-6 w-96 mx-auto mb-16" />
        <div className="grid md:grid-cols-2 gap-5 md:gap-6">
          <Card>
            <CardContent className="p-5 md:p-6">
              <Skeleton className="h-6 w-32 mb-4" />
              <Skeleton className="h-[300px] md:h-[600px] rounded-lg mb-4" />
              <Skeleton className="h-4 w-full" />
            </CardContent>
          </Card>
          <div className="space-y-5 md:space-y-6">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-5 md:p-6">
                  <Skeleton className="h-6 w-32 mb-4" />
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-4 w-4/6" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  </section>
);

// Booking Info Skeleton
export const BookingInfoSkeleton = () => (
  <section className="py-12 md:py-20 bg-secondary/20">
    <div className="container mx-auto px-4">
      <Skeleton className="h-10 w-48 mx-auto mb-4" />
      <Skeleton className="h-6 w-96 mx-auto mb-16" />
      <div className="grid md:grid-cols-2 gap-6 md:gap-8 max-w-5xl mx-auto">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-5 md:p-6">
              <Skeleton className="h-6 w-32 mb-4" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-4/6" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  </section>
);

// Reviews Skeleton
export const ReviewsSkeleton = () => (
  <section className="py-12 md:py-20 bg-background">
    <div className="container mx-auto px-4">
      <div className="max-w-6xl mx-auto">
        <Skeleton className="h-10 w-48 mx-auto mb-4" />
        <Skeleton className="h-6 w-96 mx-auto mb-16" />
        <div className="text-center mb-8">
          <Skeleton className="h-12 w-32 mx-auto mb-2" />
          <Skeleton className="h-4 w-24 mx-auto" />
        </div>
        <div className="grid md:grid-cols-2 gap-5 md:gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-5 md:p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <Skeleton className="h-5 w-24 mb-2" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <Skeleton className="h-5 w-24" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-4 w-4/6" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  </section>
);

// FAQ Skeleton
export const FaqSkeleton = () => (
  <section className="py-12 md:py-20 bg-secondary/20">
    <div className="container mx-auto px-4">
      <Skeleton className="h-10 w-48 mx-auto mb-4" />
      <Skeleton className="h-6 w-96 mx-auto mb-16" />
      <div className="max-w-4xl mx-auto space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <Card key={i}>
            <CardContent className="p-5 md:p-6">
              <Skeleton className="h-6 w-3/4 mb-3" />
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-4 w-5/6" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  </section>
);

// Footer Skeleton
export const FooterSkeleton = () => (
  <footer className="bg-muted border-t">
    <div className="container mx-auto px-4 py-8 md:py-12">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
        {[1, 2, 3].map((i) => (
          <div key={i}>
            <Skeleton className="h-6 w-32 mb-4" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/6" />
            </div>
          </div>
        ))}
      </div>
      <Skeleton className="h-4 w-48 mx-auto" />
    </div>
  </footer>
);

// Complete Frontend Skeleton
export const FrontendSkeleton = () => {
  const { accommodationId } = useSubdomain();
  const isWarmTheme = accommodationId === TIANSONG_ID;

  return (
    <div className={`min-h-screen ${isWarmTheme ? 'theme-warm' : ''}`}>
      <NavigationSkeleton />
      <main>
        <HeroSkeleton />
        <AboutSkeleton />
        <RoomsSkeleton />
        <FacilitiesSkeleton />
        <PhotoGallerySkeleton />
        <LocationSkeleton />
        <BookingInfoSkeleton />
        <ReviewsSkeleton />
        <FaqSkeleton />
      </main>
      <FooterSkeleton />
    </div>
  );
};
