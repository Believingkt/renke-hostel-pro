import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, CreditCard, FileText, Info, PawPrint, AlertTriangle, ClipboardList } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createSanitizedHtml } from "@/utils/sanitizeHtml";

interface BookingInfoSectionProps {
  bookingSettings: any;
  checkInNotice: string;
}

const BookingInfoSection = ({ bookingSettings, checkInNotice }: BookingInfoSectionProps) => {
  const hasPetPolicy = bookingSettings?.pet_policy && bookingSettings.pet_policy.trim() !== "";
  const hasOtherNotes = bookingSettings?.other_notes && bookingSettings.other_notes.trim() !== "";
  const hasCheckInTime = bookingSettings?.check_in_time && bookingSettings.check_in_time.trim() !== "";
  const hasCheckOutTime = bookingSettings?.check_out_time && bookingSettings.check_out_time.trim() !== "";
  const hasPaymentMethods = Array.isArray(bookingSettings?.payment_methods) && bookingSettings.payment_methods.length > 0;
  const hasCancellationPolicy = bookingSettings?.cancellation_policy && bookingSettings.cancellation_policy.trim() !== "";
  const hasCheckInNotice = checkInNotice && checkInNotice.trim() !== "";
  
  // 檢查是否有任何訂房須知資料
  const hasAnyData = hasCheckInTime || hasCheckOutTime || hasPaymentMethods || hasCancellationPolicy || hasCheckInNotice || hasPetPolicy || hasOtherNotes;
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogContent, setDialogContent] = useState({ title: "", content: "" });

  const openDialog = (title: string, content: string) => {
    setDialogContent({ title, content });
    setDialogOpen(true);
  };

  // 如果沒有任何訂房須知資料，顯示空值佔位符（樣式與設施服務一致）
  if (!hasAnyData) {
    return (
      <section id="booking-info" className="py-12 md:py-16 lg:py-20 bg-background">
        <div className="container mx-auto px-4 md:px-6">
          <div className="max-w-lg mx-auto text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-muted/50 flex items-center justify-center text-muted-foreground/40">
              <ClipboardList className="h-8 w-8" />
            </div>
            <h2 className="text-xl md:text-2xl font-semibold text-muted-foreground/60 mb-3">訂房須知準備中</h2>
            <p className="text-muted-foreground/50 text-sm md:text-base">訂房相關資訊即將更新</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="booking-info" className="py-12 md:py-16 lg:py-20 bg-background">
      <div className="container mx-auto px-4 md:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10 md:mb-12 lg:mb-16">
            <h2 className="text-3xl md:text-3xl lg:text-4xl font-bold text-center mb-3 md:mb-3 lg:mb-4">
              訂房須知
            </h2>
            <p className="text-center text-muted-foreground text-base md:text-base lg:text-lg mb-0 max-w-2xl mx-auto">
              為確保愉快的住宿體驗，請詳閱以下相關資訊
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5 lg:gap-6">
            <Card className="group hover:shadow-lg transition-all duration-300 border border-border/50 bg-card">
              <CardContent className="p-5 md:p-6 lg:p-6">
                <div className="flex items-center gap-2.5 mb-3 md:mb-4">
                  <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                    <Clock className="h-5 w-5 md:h-5 md:w-5 lg:h-6 lg:w-6 text-primary" />
                  </div>
                  <h3 className="font-semibold text-base md:text-base lg:text-lg">入住時間</h3>
                </div>
                <div className="space-y-0.5 text-sm md:text-sm lg:text-sm text-muted-foreground">
                  <div className="flex items-center gap-2 py-1.5">
                    <span className="font-medium text-foreground">入住：</span>
                    <span>{bookingSettings?.check_in_time} 之後</span>
                  </div>
                  <div className="flex items-center gap-2 py-1.5">
                    <span className="font-medium text-foreground">退房：</span>
                    <span>{bookingSettings?.check_out_time} 之前</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="group hover:shadow-lg transition-all duration-300 border border-border/50 bg-card">
              <CardContent className="p-5 md:p-6 lg:p-6">
                <div className="flex items-center gap-2.5 mb-3 md:mb-4">
                  <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                    <CreditCard className="h-5 w-5 md:h-5 md:w-5 lg:h-6 lg:w-6 text-primary" />
                  </div>
                  <h3 className="font-semibold text-base md:text-base lg:text-lg">付款方式</h3>
                </div>
                <div className="space-y-0.5 text-sm md:text-sm lg:text-sm text-muted-foreground">
                  {Array.isArray(bookingSettings?.payment_methods)
                    ? bookingSettings.payment_methods.map((method: string, index: number) => (
                        <div key={index} className="flex items-center gap-2 py-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                          <span>{method}</span>
                        </div>
                      ))
                    : <p className="py-1.5 text-muted-foreground/60">尚未設定</p>
                  }
                </div>
              </CardContent>
            </Card>

            <Card className="group hover:shadow-lg transition-all duration-300 border border-border/50 bg-card md:col-span-2 lg:col-span-1">
              <CardContent className="p-5 md:p-6 lg:p-6">
                <div className="flex items-center gap-2.5 mb-3 md:mb-4">
                  <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                    <FileText className="h-5 w-5 md:h-5 md:w-5 lg:h-6 lg:w-6 text-primary" />
                  </div>
                  <h3 className="font-semibold text-base md:text-base lg:text-lg">取消政策</h3>
                </div>
                <div className="space-y-0.5 text-sm md:text-sm text-muted-foreground">
                  <div 
                    className="py-1.5 leading-relaxed prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={createSanitizedHtml(bookingSettings?.cancellation_policy)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="group hover:shadow-lg transition-all duration-300 border border-border/50 bg-card flex flex-col">
              <CardContent className="p-5 md:p-6 flex flex-col flex-1">
                <div className="flex items-center gap-2.5 mb-3 md:mb-4">
                  <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                    <AlertTriangle className="h-5 w-5 md:h-6 md:w-6 text-primary" />
                  </div>
                  <h3 className="font-semibold text-base md:text-lg">重要事項</h3>
                </div>
                <div className="flex-1 flex flex-col">
                  <div className="space-y-0.5 text-sm md:text-sm text-muted-foreground overflow-hidden" style={{ maxHeight: "180px" }}>
                    <div 
                      className="prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={createSanitizedHtml(checkInNotice)}
                    />
                  </div>
                  {checkInNotice && checkInNotice.length > 200 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 w-full text-foreground hover:bg-primary hover:text-primary-foreground border-primary/20"
                      onClick={() => openDialog("重要事項", checkInNotice)}
                    >
                      查看完整內容
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {hasPetPolicy && (
              <Card className="group hover:shadow-lg transition-all duration-300 border border-border/50 bg-card flex flex-col">
                <CardContent className="p-5 md:p-6 flex flex-col flex-1">
                  <div className="flex items-center gap-2.5 mb-3 md:mb-4">
                    <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                      <PawPrint className="h-5 w-5 md:h-6 md:w-6 text-primary" />
                    </div>
                    <h3 className="font-semibold text-base md:text-lg">寵物入住守則</h3>
                  </div>
                  <div className="flex-1 flex flex-col">
                    <div className="space-y-0.5 text-sm md:text-sm text-muted-foreground overflow-hidden" style={{ maxHeight: "180px" }}>
                      <div 
                        className="prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={createSanitizedHtml(bookingSettings.pet_policy)}
                      />
                    </div>
                    {bookingSettings.pet_policy && bookingSettings.pet_policy.length > 200 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3 w-full text-foreground hover:bg-primary hover:text-primary-foreground border-primary/20"
                        onClick={() => openDialog("寵物入住守則", bookingSettings.pet_policy)}
                      >
                        查看完整內容
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {hasOtherNotes && (
              <Card className="group hover:shadow-lg transition-all duration-300 border border-border/50 bg-card flex flex-col">
                <CardContent className="p-5 md:p-6 flex flex-col flex-1">
                  <div className="flex items-center gap-2.5 mb-3 md:mb-4">
                    <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                      <Info className="h-5 w-5 md:h-6 md:w-6 text-primary" />
                    </div>
                    <h3 className="font-semibold text-base md:text-lg">其他注意事項</h3>
                  </div>
                  <div className="flex-1 flex flex-col">
                    <div className="space-y-0.5 text-sm md:text-sm text-muted-foreground overflow-hidden" style={{ maxHeight: "180px" }}>
                      <div 
                        className="prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={createSanitizedHtml(bookingSettings.other_notes)}
                      />
                    </div>
                    {bookingSettings.other_notes && bookingSettings.other_notes.length > 200 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3 w-full text-foreground hover:bg-primary hover:text-primary-foreground border-primary/20"
                        onClick={() => openDialog("其他注意事項", bookingSettings.other_notes)}
                      >
                        查看完整內容
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-background">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">{dialogContent.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-0 mt-4 text-sm">
            <div 
              className="prose prose-sm max-w-none text-muted-foreground"
              dangerouslySetInnerHTML={createSanitizedHtml(dialogContent.content)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default BookingInfoSection;
