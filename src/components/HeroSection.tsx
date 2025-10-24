import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import type { CarouselApi } from "@/components/ui/carousel";
import Autoplay from "embla-carousel-autoplay";
import { Calendar as CalendarIcon, Users, Search } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";
import { cn } from "@/lib/utils";
import heroSlide1 from "@/assets/hero-slide-1.jpg";
import heroSlide2 from "@/assets/hero-slide-2.jpg";
import heroSlide3 from "@/assets/hero-slide-3.jpg";

interface HeroSectionProps {
  accommodationName?: string;
}

const HeroSection = ({ accommodationName = "森山寫造" }: HeroSectionProps) => {
  const [checkInDate, setCheckInDate] = useState<Date>();
  const [checkOutDate, setCheckOutDate] = useState<Date>();
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
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
    <section id="home" className="pt-16 relative">
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
                    <div className="text-center text-white space-y-4 max-w-4xl px-4 pb-52 md:pb-56">
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

        {/* 搜尋卡片 - 位於文字和輪播指示器之間 */}
        <div className="absolute bottom-[120px] md:bottom-[140px] left-1/2 -translate-x-1/2 w-full max-w-5xl px-4 z-30">
          <Card className="shadow-2xl bg-white/95 backdrop-blur-sm border-0 rounded-2xl">
            <CardContent className="p-6 md:p-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                {/* 入住日期 */}
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="flex items-center h-16 px-4 rounded-xl bg-green-500 hover:bg-green-600 transition-colors text-left w-full">
                      <CalendarIcon className="h-6 w-6 text-white mr-3 flex-shrink-0" />
                      <div className="flex flex-col">
                        <span className="text-xs text-white/70 mb-0.5">入住日期</span>
                        <span className="text-base text-white font-medium">
                          {checkInDate ? format(checkInDate, "yyyy/MM/dd", { locale: zhTW }) : "選擇日期"}
                        </span>
                      </div>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={checkInDate}
                      onSelect={setCheckInDate}
                      disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>

                {/* 退房日期 */}
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="flex items-center h-16 px-4 rounded-xl bg-green-500 hover:bg-green-600 transition-colors text-left w-full">
                      <CalendarIcon className="h-6 w-6 text-white mr-3 flex-shrink-0" />
                      <div className="flex flex-col">
                        <span className="text-xs text-white/70 mb-0.5">退房日期</span>
                        <span className="text-base text-white font-medium">
                          {checkOutDate ? format(checkOutDate, "yyyy/MM/dd", { locale: zhTW }) : "選擇日期"}
                        </span>
                      </div>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={checkOutDate}
                      onSelect={setCheckOutDate}
                      disabled={(date) => {
                        const today = new Date(new Date().setHours(0, 0, 0, 0));
                        if (date < today) return true;
                        if (checkInDate && date <= checkInDate) return true;
                        return false;
                      }}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>

                {/* 住宿人數 */}
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="flex items-center h-16 px-4 rounded-xl bg-green-500 hover:bg-green-600 transition-colors text-left w-full">
                      <Users className="h-6 w-6 text-white mr-3 flex-shrink-0" />
                      <div className="flex flex-col">
                        <span className="text-xs text-white/70 mb-0.5">住宿人數</span>
                        <span className="text-base text-white font-medium">
                          {adults}位大人{children > 0 ? ` · ${children}位兒童` : ""} · 1間客房
                        </span>
                      </div>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-4" align="start">
                    <div className="space-y-4">
                      {/* 大人 */}
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-base">大人</div>
                          <div className="text-sm text-muted-foreground">18歲（含）或以上</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => setAdults(Math.max(1, adults - 1))}
                            className="w-10 h-10 rounded-lg border-2 border-green-600 text-green-600 hover:bg-green-50 transition-colors flex items-center justify-center font-medium"
                          >
                            -
                          </button>
                          <span className="w-8 text-center font-medium">{adults}</span>
                          <button
                            onClick={() => setAdults(Math.min(10, adults + 1))}
                            className="w-10 h-10 rounded-lg border-2 border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-center font-medium"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* 兒童 */}
                      <div className="flex items-center justify-between pt-4 border-t">
                        <div>
                          <div className="font-medium text-base">兒童</div>
                          <div className="text-sm text-muted-foreground">0-17歲</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => setChildren(Math.max(0, children - 1))}
                            className="w-10 h-10 rounded-lg border-2 border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-center font-medium"
                          >
                            -
                          </button>
                          <span className="w-8 text-center font-medium">{children}</span>
                          <button
                            onClick={() => setChildren(Math.min(10, children + 1))}
                            className="w-10 h-10 rounded-lg border-2 border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-center font-medium"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* 搜尋按鈕 */}
              <Button className="w-full bg-green-600 hover:bg-green-700 text-white text-base h-14 font-medium rounded-lg shadow-md hover:shadow-lg transition-all">
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
