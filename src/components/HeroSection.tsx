import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    <section id="home" className="pt-16 relative pb-32 md:pb-36">
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
                <div className="relative h-[500px] md:h-[600px] w-full">
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
          
          {/* 輪播指示器（圓點） */}
          <div className="absolute bottom-[180px] md:bottom-[200px] left-1/2 -translate-x-1/2 flex gap-2 z-10">
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
          <Card className="shadow-2xl bg-white border-0 rounded-2xl">
            <CardContent className="p-8">
            <div className="grid md:grid-cols-3 gap-6 mb-6">
              <div className="space-y-1">
                <Label className="flex items-center gap-2 text-sm font-normal text-muted-foreground">
                  <Calendar className="h-4 w-4 text-primary" />
                  入住日期
                </Label>
                <div className="flex items-center h-12 px-3 border rounded-md bg-background relative">
                  <span className="text-base text-foreground">選擇日期</span>
                  <Input 
                    type="date" 
                    value={checkInDate}
                    onChange={(e) => setCheckInDate(e.target.value)}
                    className="absolute opacity-0 inset-0 cursor-pointer"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="flex items-center gap-2 text-sm font-normal text-muted-foreground">
                  <Calendar className="h-4 w-4 text-primary" />
                  退房日期
                </Label>
                <div className="flex items-center h-12 px-3 border rounded-md bg-background relative">
                  <span className="text-base text-foreground">選擇日期</span>
                  <Input 
                    type="date" 
                    value={checkOutDate}
                    onChange={(e) => setCheckOutDate(e.target.value)}
                    className="absolute opacity-0 inset-0 cursor-pointer"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="flex items-center gap-2 text-sm font-normal text-muted-foreground">
                  <Users className="h-4 w-4 text-primary" />
                  住宿人數
                </Label>
                <div className="flex items-center h-12 px-3 border rounded-md bg-background">
                  <span className="text-base text-foreground">{guests}位大人 · 1間客房</span>
                </div>
              </div>
            </div>
            <Button className="w-full bg-primary hover:bg-primary/90 text-white text-lg h-14 font-medium rounded-lg shadow-lg hover:shadow-xl transition-all" size="lg">
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
