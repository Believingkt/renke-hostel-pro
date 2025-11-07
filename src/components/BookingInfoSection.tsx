import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, CreditCard, FileText, Info, PawPrint, AlertCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface BookingInfoSectionProps {
  bookingSettings: any;
  checkInNotice: string;
}

const BookingInfoSection = ({ bookingSettings, checkInNotice }: BookingInfoSectionProps) => {
  const hasPetPolicy = bookingSettings?.pet_policy && bookingSettings.pet_policy.trim() !== "";
  const hasOtherNotes = bookingSettings?.other_notes && bookingSettings.other_notes.trim() !== "";
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogContent, setDialogContent] = useState({ title: "", content: "" });

  const openDialog = (title: string, content: string) => {
    setDialogContent({ title, content });
    setDialogOpen(true);
  };

  return (
    <section id="booking-info" className="py-12 md:py-20 bg-gradient-to-b from-background to-muted/30">
      <div className="container mx-auto px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12 md:mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-foreground">
              訂房須知
            </h2>
            <p className="text-muted-foreground text-base md:text-lg max-w-2xl mx-auto">
              為確保愉快的住宿體驗，請詳閱以下相關資訊
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            <Card className="group hover:shadow-xl transition-all duration-300 border-border/50 bg-card/80 backdrop-blur-sm hover:scale-[1.02]">
              <CardContent className="pt-6 md:pt-8">
                <div className="flex items-center gap-3 mb-4 md:mb-6">
                  <div className="p-3 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                    <Clock className="h-6 w-6 md:h-7 md:w-7 text-primary" />
                  </div>
                  <h3 className="font-bold text-lg md:text-xl">入住時間</h3>
                </div>
                <div className="space-y-3 text-sm md:text-base text-muted-foreground">
                  <div className="flex items-center gap-2 p-3 rounded-lg">
                    <span className="font-medium text-foreground">入住：</span>
                    <span>{bookingSettings?.check_in_time} 之後</span>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-lg">
                    <span className="font-medium text-foreground">退房：</span>
                    <span>{bookingSettings?.check_out_time} 之前</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="group hover:shadow-xl transition-all duration-300 border-border/50 bg-card/80 backdrop-blur-sm hover:scale-[1.02]">
              <CardContent className="pt-6 md:pt-8">
                <div className="flex items-center gap-3 mb-4 md:mb-6">
                  <div className="p-3 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                    <CreditCard className="h-6 w-6 md:h-7 md:w-7 text-primary" />
                  </div>
                  <h3 className="font-bold text-lg md:text-xl">付款方式</h3>
                </div>
                <div className="space-y-2 text-sm md:text-base text-muted-foreground">
                  {Array.isArray(bookingSettings?.payment_methods) 
                    ? bookingSettings.payment_methods.map((method: string, index: number) => (
                        <div key={index} className="flex items-center gap-2 p-2.5 rounded-lg">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                          <span>{method}</span>
                        </div>
                      ))
                    : <p className="p-2.5 text-muted-foreground/60">尚未設定</p>
                  }
                </div>
              </CardContent>
            </Card>

            <Card className="group hover:shadow-xl transition-all duration-300 border-border/50 bg-card/80 backdrop-blur-sm hover:scale-[1.02]">
              <CardContent className="pt-6 md:pt-8">
                <div className="flex items-center gap-3 mb-4 md:mb-6">
                  <div className="p-3 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                    <FileText className="h-6 w-6 md:h-7 md:w-7 text-primary" />
                  </div>
                  <h3 className="font-bold text-lg md:text-xl">取消政策</h3>
                </div>
                <div className="space-y-2 text-sm md:text-base text-muted-foreground">
                  {bookingSettings?.cancellation_policy?.split('\n').map((line: string, index: number) => (
                    <p key={index} className="p-2.5 rounded-lg leading-relaxed">{line}</p>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="group hover:shadow-xl transition-all duration-300 border-border/50 bg-card/80 backdrop-blur-sm hover:scale-[1.02] flex flex-col">
              <CardContent className="pt-6 md:pt-8 flex flex-col flex-1">
                <div className="flex items-center gap-3 mb-4 md:mb-6">
                  <div className="p-3 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                    <Info className="h-6 w-6 md:h-7 md:w-7 text-primary" />
                  </div>
                  <h3 className="font-bold text-lg md:text-xl">重要事項</h3>
                </div>
                <div className="flex-1 flex flex-col">
                  <div className="space-y-2 text-sm md:text-base text-muted-foreground overflow-hidden" style={{ maxHeight: "180px" }}>
                    {checkInNotice?.split('\n').map((line: string, index: number) => (
                      <p key={index} className="p-2.5 rounded-lg leading-relaxed">{line}</p>
                    ))}
                  </div>
                  {checkInNotice && checkInNotice.split('\n').length > 4 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4 w-full text-foreground hover:bg-primary hover:text-primary-foreground border-primary/20"
                      onClick={() => openDialog("重要事項", checkInNotice)}
                    >
                      查看完整內容
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {hasPetPolicy && (
              <Card className="group hover:shadow-xl transition-all duration-300 border-border/50 bg-card/80 backdrop-blur-sm hover:scale-[1.02] flex flex-col">
                <CardContent className="pt-6 md:pt-8 flex flex-col flex-1">
                  <div className="flex items-center gap-3 mb-4 md:mb-6">
                    <div className="p-3 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                      <PawPrint className="h-6 w-6 md:h-7 md:w-7 text-primary" />
                    </div>
                    <h3 className="font-bold text-lg md:text-xl">寵物入住守則</h3>
                  </div>
                  <div className="flex-1 flex flex-col">
                    <div className="space-y-2 text-sm md:text-base text-muted-foreground overflow-hidden" style={{ maxHeight: "180px" }}>
                      {bookingSettings.pet_policy?.split('\n').map((line: string, index: number) => (
                        <p key={index} className="p-2.5 rounded-lg leading-relaxed">{line}</p>
                      ))}
                    </div>
                    {bookingSettings.pet_policy && bookingSettings.pet_policy.split('\n').length > 4 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-4 w-full text-foreground hover:bg-primary hover:text-primary-foreground border-primary/20"
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
              <Card className="group hover:shadow-xl transition-all duration-300 border-border/50 bg-card/80 backdrop-blur-sm hover:scale-[1.02] flex flex-col">
                <CardContent className="pt-6 md:pt-8 flex flex-col flex-1">
                  <div className="flex items-center gap-3 mb-4 md:mb-6">
                    <div className="p-3 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                      <AlertCircle className="h-6 w-6 md:h-7 md:w-7 text-primary" />
                    </div>
                    <h3 className="font-bold text-lg md:text-xl">其他注意事項</h3>
                  </div>
                  <div className="flex-1 flex flex-col">
                    <div className="space-y-2 text-sm md:text-base text-muted-foreground overflow-hidden" style={{ maxHeight: "180px" }}>
                      {bookingSettings.other_notes?.split('\n').map((line: string, index: number) => (
                        <p key={index} className="p-2.5 rounded-lg leading-relaxed">{line}</p>
                      ))}
                    </div>
                    {bookingSettings.other_notes && bookingSettings.other_notes.split('\n').length > 4 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-4 w-full text-foreground hover:bg-primary hover:text-primary-foreground border-primary/20"
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
          <div className="space-y-3 mt-4">
            {dialogContent.content.split('\n').map((line: string, index: number) => (
              <p key={index} className="p-3 rounded-lg leading-relaxed text-muted-foreground">
                {line}
              </p>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default BookingInfoSection;
