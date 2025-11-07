import { Card, CardContent } from "@/components/ui/card";
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
            為確保愉快的住宿體驗，請詳閱以下相關資訊
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
        </div>
      </div>
    </section>
  );
};

export default BookingInfoSection;
