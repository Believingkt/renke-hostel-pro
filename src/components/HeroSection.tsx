import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import type { CarouselApi } from "@/components/ui/carousel";
import Autoplay from "embla-carousel-autoplay";
import { Calendar, Users, Search } from "lucide-react";
import heroSlide1 from "@/assets/hero-slide-1.jpg";
import heroSlide2 from "@/assets/hero-slide-2.jpg";
import heroSlide3 from "@/assets/hero-slide-3.jpg";

interface HeroSectionProps {
  accommodationName?: string;
}

const HeroSection = ({ accommodationName = "森山寫造" }: HeroSectionProps) => {
  const [checkInDate, setCheckInDate] = useState("");
  const [checkOutDate, setCheckOutDate] = useState("");
  const [guests, setGuests] = useState(2);
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!carouselApi) return;

    setCurrent(carouselApi.selectedScrollSnap());

    carouselApi.on("select", () => {
      setCurrent(carouselApi.selectedScrollSnap());
    });
  }, [carouselApi]);

  return (
    <section id="home" className="pt-16 relative pb-24 md:pb-28">
      <div className="relative">
        <Carousel
          opts={{ loop: true }}
          plugins={[Autoplay({ delay: 5000 })]}
          className="w-full"
          setApi={setCarouselApi}
        >
          <CarouselContent>
            {[heroSlide1, heroSlide2, heroSlide3].map((img, index) => (
              <CarouselItem key={index}>
                <div className="relative h-[600px] md:h-[700px] w-full">
                  <img 
                    src={img} 
                    alt={`山景 ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <div className="text-center text-white space-y-4 max-w-4xl px-4 pb-32 md:pb-40">
                      <h1 className="text-5xl md:text-7xl font-bold animate-fade-in drop-shadow-lg">
                        {accommodationName}
                      </h1>
                      <p className="text-2xl md:text-3xl animate-fade-in drop-shadow-lg" style={{ animationDelay: "0.2s" }}>
                        山間的寧靜時光
                      </p>
                      <p className="text-lg md:text-xl animate-fade-in drop-shadow-lg" style={{ animationDelay: "0.4s" }}>
                        體驗日式美學與自然的完美融合
                      </p>
                    </div>
                  </div>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          
          {/* 輪播指示器（圓點） - 在圖片底部 */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2 z-10">
            {[0, 1, 2].map((index) => (
              <button
                key={index}
                onClick={() => carouselApi?.scrollTo(index)}
                className={`h-2 rounded-full transition-all ${
                  current === index 
                    ? "w-8 bg-white" 
                    : "w-2 bg-white/50 hover:bg-white/75"
                }`}
                aria-label={`切換到第 ${index + 1} 張圖片`}
              />
            ))}
          </div>
        </Carousel>

        {/* 搜尋卡片 - 在輪播外部底部延伸 */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-5xl px-4 z-30">
          <Card className="shadow-2xl bg-white/95 backdrop-blur-sm border-0 rounded-2xl">
            <CardContent className="p-6 md:p-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                {/* 入住日期 */}
                <div className="relative">
                  <div className="flex items-center h-14 px-4 border-2 border-border rounded-lg bg-background hover:border-primary/50 transition-colors cursor-pointer">
                    <Calendar className="h-5 w-5 text-muted-foreground mr-3 flex-shrink-0" />
                    <div className="flex flex-col">
                      <span className="text-xs text-muted-foreground">入住日期</span>
                      <span className="text-sm text-foreground">選擇日期</span>
                    </div>
                    <Input 
                      type="date" 
                      value={checkInDate}
                      onChange={(e) => setCheckInDate(e.target.value)}
                      className="absolute opacity-0 inset-0 cursor-pointer"
                    />
                  </div>
                </div>

                {/* 退房日期 */}
                <div className="relative">
                  <div className="flex items-center h-14 px-4 border-2 border-primary rounded-lg bg-background hover:border-primary transition-colors cursor-pointer">
                    <Calendar className="h-5 w-5 text-muted-foreground mr-3 flex-shrink-0" />
                    <div className="flex flex-col">
                      <span className="text-xs text-muted-foreground">退房日期</span>
                      <span className="text-sm text-foreground">選擇日期</span>
                    </div>
                    <Input 
                      type="date" 
                      value={checkOutDate}
                      onChange={(e) => setCheckOutDate(e.target.value)}
                      className="absolute opacity-0 inset-0 cursor-pointer"
                    />
                  </div>
                </div>

                {/* 住宿人數 */}
                <div className="relative">
                  <div className="flex items-center h-14 px-4 border-2 border-border rounded-lg bg-background hover:border-primary/50 transition-colors cursor-pointer">
                    <Users className="h-5 w-5 text-muted-foreground mr-3 flex-shrink-0" />
                    <div className="flex flex-col">
                      <span className="text-xs text-muted-foreground">住宿人數</span>
                      <span className="text-sm text-foreground">{guests}位大人 · 1間客房</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 搜尋按鈕 */}
              <Button className="w-full bg-primary hover:bg-primary/90 text-white text-base h-14 font-medium rounded-lg shadow-md hover:shadow-lg transition-all">
                <Search className="mr-2 h-5 w-5" />
                搜尋空房
              </Button>
          </CardContent>
        </Card>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
