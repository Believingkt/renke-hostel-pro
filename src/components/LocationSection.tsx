import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface AccommodationInfo {
  address: string;
}

const LocationSection = () => {
  const [accommodationInfo, setAccommodationInfo] = useState<AccommodationInfo | null>(null);

  useEffect(() => {
    fetchLocationInfo();
  }, []);

  const fetchLocationInfo = async () => {
    const { data } = await supabase
      .from("accommodation_info")
      .select("address")
      .single();
    
    if (data) {
      setAccommodationInfo(data);
    }
  };

  return (
    <section id="location" className="py-20 bg-secondary/30">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-4">交通 & 地圖</h2>
          <p className="text-center text-muted-foreground mb-16 text-lg">
            如何前往森山寫造
          </p>

          <Card>
            <CardContent className="pt-6">
              <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                位置資訊
              </h3>
              <p className="text-sm mb-6">{accommodationInfo?.address}</p>
              <p className="text-sm text-muted-foreground mb-4">
                位於風景秀麗的山區，周邊有多處自然景點與步道
              </p>
              <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
                <p className="text-muted-foreground">地圖載入中...</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
};

export default LocationSection;
