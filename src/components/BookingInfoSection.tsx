import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface BookingSettings {
  check_in_time: string;
  check_out_time: string;
  cancellation_policy: string;
  payment_methods: any;
}

interface AccommodationInfo {
  check_in_notice: string;
}

const BookingInfoSection = () => {
  const [bookingSettings, setBookingSettings] = useState<BookingSettings | null>(null);
  const [accommodationInfo, setAccommodationInfo] = useState<AccommodationInfo | null>(null);

  useEffect(() => {
    fetchBookingInfo();
  }, []);

  const fetchBookingInfo = async () => {
    const { data: infoData } = await supabase
      .from("accommodation_info")
      .select("*")
      .single();
    
    if (infoData) {
      setAccommodationInfo(infoData);

      const { data: settingsData } = await supabase
        .from("booking_settings")
        .select("*")
        .eq("accommodation_id", infoData.id)
        .single();
      
      if (settingsData) {
        setBookingSettings(settingsData);
      }
    }
  };

  return (
    <section id="booking-info" className="py-20">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-4">訂房須知</h2>
          <p className="text-center text-muted-foreground mb-16 text-lg">
            為確保您有愉快的住宿體驗，請詳閱以下訂房相關資訊
          </p>

          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardContent className="pt-6">
                <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  入住時間
                </h3>
                <div className="space-y-2 text-sm">
                  <p><strong>入住：</strong>{bookingSettings?.check_in_time} 之後</p>
                  <p><strong>退房：</strong>{bookingSettings?.check_out_time} 之前</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-primary" />
                  付款方式
                </h3>
                <div className="flex flex-wrap gap-2">
                  {Array.isArray(bookingSettings?.payment_methods) 
                    ? bookingSettings.payment_methods.map((method: string, index: number) => (
                        <Badge key={index} variant="secondary">
                          {method}
                        </Badge>
                      ))
                    : null
                  }
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardContent className="pt-6">
                <h3 className="font-semibold text-lg mb-4">取消政策</h3>
                <p className="text-sm">{bookingSettings?.cancellation_policy}</p>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardContent className="pt-6">
                <h3 className="font-semibold text-lg mb-4">重要事項</h3>
                <div className="whitespace-pre-wrap text-sm">
                  {accommodationInfo?.check_in_notice}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
};

export default BookingInfoSection;
