import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Clock, CreditCard, FileText, Info } from "lucide-react";

interface BookingInfoSectionProps {
  bookingSettings: any;
  checkInNotice: string;
}

const BookingInfoSection = ({ bookingSettings, checkInNotice }: BookingInfoSectionProps) => {

  return (
    <section id="booking-info" className="py-12 md:py-20">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-3 md:mb-4">訂房須知</h2>
          <p className="text-center text-muted-foreground mb-8 md:mb-16 text-base md:text-lg">
            為確保您有愉快的住宿體驗，請詳閱以下訂房相關資訊
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            <Card>
              <CardContent className="pt-4 md:pt-6">
                <div className="flex items-center gap-2 mb-3 md:mb-4">
                  <Clock className="h-5 w-5 md:h-6 md:w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-base md:text-lg mb-3 md:mb-4">入住時間</h3>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p>入住：{bookingSettings?.check_in_time} 之後</p>
                  <p>退房：{bookingSettings?.check_out_time} 之前</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 md:pt-6">
                <div className="flex items-center gap-2 mb-3 md:mb-4">
                  <CreditCard className="h-5 w-5 md:h-6 md:w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-base md:text-lg mb-3 md:mb-4">付款方式</h3>
                <div className="space-y-1 text-sm text-muted-foreground">
                  {Array.isArray(bookingSettings?.payment_methods) 
                    ? bookingSettings.payment_methods.map((method: string, index: number) => (
                        <p key={index}>{method}</p>
                      ))
                    : null
                  }
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 md:pt-6">
                <div className="flex items-center gap-2 mb-3 md:mb-4">
                  <FileText className="h-5 w-5 md:h-6 md:w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-base md:text-lg mb-3 md:mb-4">取消政策</h3>
                <div className="space-y-1 text-sm text-muted-foreground">
                  {bookingSettings?.cancellation_policy?.split('\n').map((line: string, index: number) => (
                    <p key={index}>{line}</p>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 md:pt-6">
                <div className="flex items-center gap-2 mb-3 md:mb-4">
                  <Info className="h-5 w-5 md:h-6 md:w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-base md:text-lg mb-3 md:mb-4">重要事項</h3>
                <div className="space-y-1 text-sm text-muted-foreground">
                  {checkInNotice?.split('\n').map((line: string, index: number) => (
                    <p key={index}>{line}</p>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 常見問題區塊 */}
          <div className="mt-8 md:mt-16">
            <h3 className="text-xl md:text-2xl font-bold mb-6 md:mb-8">常見問題</h3>
            <Card className="border rounded-lg overflow-hidden">
              <CardContent className="p-0">
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="item-1" className="border-b last:border-b-0 px-4 md:px-6">
                    <AccordionTrigger className="text-left font-semibold text-sm md:text-base py-4 md:py-6 hover:no-underline">
                      如何預訂房間？
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground pb-6">
                      您可以透過我們的網站線上預訂系統進行訂房，選擇入住日期、退房日期及人數後，系統會顯示可預訂的房型。完成訂房後，您將收到確認信件。
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="item-2" className="border-b last:border-b-0 px-4 md:px-6">
                    <AccordionTrigger className="text-left font-semibold text-sm md:text-base py-4 md:py-6 hover:no-underline">
                      是否提供機場接送服務？
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground pb-6">
                      我們提供機場接送服務，需要提前3天預約。接送服務會額外收費，詳細資訊請洽詢櫃台人員。
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="item-3" className="border-b last:border-b-0 px-4 md:px-6">
                    <AccordionTrigger className="text-left font-semibold text-sm md:text-base py-4 md:py-6 hover:no-underline">
                      可以攜帶寵物嗎？
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground pb-6">
                      很抱歉，為維護所有住客的住宿品質與環境衛生，本館目前不接受攜帶寵物入住。
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="item-4" className="border-b last:border-b-0 px-4 md:px-6">
                    <AccordionTrigger className="text-left font-semibold text-sm md:text-base py-4 md:py-6 hover:no-underline">
                      房間內有提供什麼設施？
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground pb-6">
                      所有客房均配備免費WiFi、冷暖空調、迷你冰箱、電視、吹風機、熱水壺及完整盥洗用品。部分房型另有景觀陽台與獨立衛浴設施。
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="item-5" className="border-b-0 px-4 md:px-6">
                    <AccordionTrigger className="text-left font-semibold text-sm md:text-base py-4 md:py-6 hover:no-underline">
                      如何修改或取消訂房？
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground pb-6">
                      您可以透過訂房確認信中的連結進行修改或取消。請注意我們的取消政策：入住前7天可免費取消，7天內取消將收取50%的費用。
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
};

export default BookingInfoSection;
