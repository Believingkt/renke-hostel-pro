import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
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

          {/* 常見問題區塊 */}
          <div className="mt-16">
            <h3 className="text-2xl font-bold mb-8">常見問題</h3>
            <Accordion type="single" collapsible className="w-full space-y-4">
              <AccordionItem value="item-1" className="border rounded-lg px-6 bg-card">
                <AccordionTrigger className="text-left font-semibold hover:no-underline">
                  如何預訂房間？
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  您可以透過我們的線上訂房系統直接預訂，或撥打電話與我們聯繫。線上訂房可即時查看房型與價格，並享有最優惠的價格保證。
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-2" className="border rounded-lg px-6 bg-card">
                <AccordionTrigger className="text-left font-semibold hover:no-underline">
                  是否提供機場接送服務？
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  我們提供機場接送服務，需要提前3天預約。接送服務會額外收費，詳細資訊請洽詢櫃台人員。
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-3" className="border rounded-lg px-6 bg-card">
                <AccordionTrigger className="text-left font-semibold hover:no-underline">
                  可以攜帶寵物嗎？
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  很抱歉，為維護所有住客的住宿品質與環境衛生，本館目前不接受攜帶寵物入住。
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-4" className="border rounded-lg px-6 bg-card">
                <AccordionTrigger className="text-left font-semibold hover:no-underline">
                  房間內有提供什麼設施？
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  所有客房均配備免費WiFi、冷暖空調、迷你冰箱、電視、吹風機、熱水壺及完整盥洗用品。部分房型另有景觀陽台與獨立衛浴設施。
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-5" className="border rounded-lg px-6 bg-card">
                <AccordionTrigger className="text-left font-semibold hover:no-underline">
                  如何修改或取消訂房？
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  您可以透過訂房確認信中的連結進行修改或取消。請注意我們的取消政策：入住前7天可免費取消，7天內取消將收取50%的費用。
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </div>
    </section>
  );
};

export default BookingInfoSection;
