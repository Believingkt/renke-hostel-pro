import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, CreditCard, FileText, Info, PawPrint, AlertTriangle, ClipboardList, LayoutList } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createSanitizedHtml } from "@/utils/sanitizeHtml";

interface CustomSection {
  id: string;
  section_title: string;
  section_subtitle: string | null;
  section_content: string | null;
  display_order: number;
  is_enabled: boolean;
}

interface BookingInfoSectionProps {
  bookingSettings: any;
  checkInNotice: string;
  customSections?: CustomSection[];
  customTitle?: string;
  customSubtitle?: string;
}

// 定義標籤配置型別
interface SectionLabel {
  title: string;
  subtitle?: string;
}

const BookingInfoSection = ({ bookingSettings, checkInNotice, customSections = [], customTitle, customSubtitle }: BookingInfoSectionProps) => {
  const hasPetPolicy = bookingSettings?.pet_policy && bookingSettings.pet_policy.trim() !== "";
  const hasOtherNotes = bookingSettings?.other_notes && bookingSettings.other_notes.trim() !== "";
  const hasCheckInTime = bookingSettings?.check_in_time && bookingSettings.check_in_time.trim() !== "";
  const hasCheckOutTime = bookingSettings?.check_out_time && bookingSettings.check_out_time.trim() !== "";
  const hasPaymentMethods = Array.isArray(bookingSettings?.payment_methods) && bookingSettings.payment_methods.length > 0;
  const hasCancellationPolicy = bookingSettings?.cancellation_policy && bookingSettings.cancellation_policy.trim() !== "";
  const hasCheckInNotice = checkInNotice && checkInNotice.trim() !== "";
  const hasCustomSections = customSections.filter(s => s.is_enabled && s.section_content?.trim()).length > 0;
  
  // 自訂區塊標題和副標題
  const sectionLabels: Record<string, SectionLabel> = {
    checkIn: {
      title: bookingSettings?.check_in_section_title || "入住時間",
      subtitle: bookingSettings?.check_in_section_subtitle || undefined
    },
    payment: {
      title: bookingSettings?.payment_section_title || "付款方式",
      subtitle: bookingSettings?.payment_section_subtitle || undefined
    },
    cancellation: {
      title: bookingSettings?.cancellation_section_title || "取消政策",
      subtitle: bookingSettings?.cancellation_section_subtitle || undefined
    },
    important: {
      title: bookingSettings?.important_section_title || "重要事項",
      subtitle: bookingSettings?.important_section_subtitle || undefined
    },
    pet: {
      title: bookingSettings?.pet_section_title || "寵物入住守則",
      subtitle: bookingSettings?.pet_section_subtitle || undefined
    },
    other: {
      title: bookingSettings?.other_section_title || "其他注意事項",
      subtitle: bookingSettings?.other_section_subtitle || undefined
    }
  };
  
  // 檢查是否有任何訂房須知資料
  const hasAnyData = hasCheckInTime || hasCheckOutTime || hasPaymentMethods || hasCancellationPolicy || hasCheckInNotice || hasPetPolicy || hasOtherNotes || hasCustomSections;
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogContent, setDialogContent] = useState({ title: "", content: "" });

  const openDialog = (title: string, content: string) => {
    setDialogContent({ title, content });
    setDialogOpen(true);
  };

  // 沒有資料時直接隱藏
  if (!hasAnyData) {
    return null;
  }

  // 過濾出啟用且有內容的自訂區塊
  const enabledCustomSections = customSections
    .filter(s => s.is_enabled && s.section_content?.trim())
    .sort((a, b) => a.display_order - b.display_order);

  return (
    <section id="booking-info" className="py-12 md:py-16 lg:py-20 bg-background">
      <div className="container mx-auto px-4 md:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10 md:mb-12 lg:mb-16">
            <h2 className="text-3xl md:text-3xl lg:text-4xl font-bold text-center mb-3 md:mb-3 lg:mb-4">
              {customTitle || '訂房須知'}
            </h2>
            <p className="text-center text-muted-foreground text-base md:text-base lg:text-lg mb-0 max-w-2xl mx-auto">
              {customSubtitle || '為確保愉快的住宿體驗，請詳閱以下相關資訊'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5 lg:gap-6">
            <Card className="group hover:shadow-lg transition-all duration-300 border border-border/50 bg-card">
              <CardContent className="p-5 md:p-6 lg:p-6">
                <div className="flex items-center gap-2.5 mb-3 md:mb-4">
                  <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                    <Clock className="h-5 w-5 md:h-5 md:w-5 lg:h-6 lg:w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-base md:text-base lg:text-lg">{sectionLabels.checkIn.title}</h3>
                    {sectionLabels.checkIn.subtitle && (
                      <p className="text-sm text-muted-foreground mt-0.5">{sectionLabels.checkIn.subtitle}</p>
                    )}
                  </div>
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
                  <div>
                    <h3 className="font-semibold text-base md:text-base lg:text-lg">{sectionLabels.payment.title}</h3>
                    {sectionLabels.payment.subtitle && (
                      <p className="text-sm text-muted-foreground mt-0.5">{sectionLabels.payment.subtitle}</p>
                    )}
                  </div>
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

            {hasCancellationPolicy && (
              <Card className="group hover:shadow-lg transition-all duration-300 border border-border/50 bg-card flex flex-col">
                <CardContent className="p-5 md:p-6 flex flex-col flex-1">
                  <div className="flex items-center gap-2.5 mb-3 md:mb-4">
                    <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                      <FileText className="h-5 w-5 md:h-6 md:w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-base md:text-lg">{sectionLabels.cancellation.title}</h3>
                      {sectionLabels.cancellation.subtitle && (
                        <p className="text-xs text-muted-foreground mt-0.5">{sectionLabels.cancellation.subtitle}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 flex flex-col">
                    <div className="space-y-0.5 text-sm md:text-sm text-muted-foreground overflow-hidden" style={{ maxHeight: "180px" }}>
                      <div 
                        className="prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={createSanitizedHtml(bookingSettings.cancellation_policy)}
                      />
                    </div>
                    {bookingSettings.cancellation_policy && bookingSettings.cancellation_policy.length > 200 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3 w-full text-foreground hover:bg-primary hover:text-primary-foreground border-primary/20"
                        onClick={() => openDialog(sectionLabels.cancellation.title, bookingSettings.cancellation_policy)}
                      >
                        查看完整內容
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="group hover:shadow-lg transition-all duration-300 border border-border/50 bg-card flex flex-col">
              <CardContent className="p-5 md:p-6 flex flex-col flex-1">
                <div className="flex items-center gap-2.5 mb-3 md:mb-4">
                  <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                    <AlertTriangle className="h-5 w-5 md:h-6 md:w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-base md:text-lg">{sectionLabels.important.title}</h3>
                    {sectionLabels.important.subtitle && (
                      <p className="text-xs text-muted-foreground mt-0.5">{sectionLabels.important.subtitle}</p>
                    )}
                  </div>
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
                      onClick={() => openDialog(sectionLabels.important.title, checkInNotice)}
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
                    <div>
                      <h3 className="font-semibold text-base md:text-lg">{sectionLabels.pet.title}</h3>
                      {sectionLabels.pet.subtitle && (
                        <p className="text-xs text-muted-foreground mt-0.5">{sectionLabels.pet.subtitle}</p>
                      )}
                    </div>
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
                        onClick={() => openDialog(sectionLabels.pet.title, bookingSettings.pet_policy)}
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
                    <div>
                      <h3 className="font-semibold text-base md:text-lg">{sectionLabels.other.title}</h3>
                      {sectionLabels.other.subtitle && (
                        <p className="text-xs text-muted-foreground mt-0.5">{sectionLabels.other.subtitle}</p>
                      )}
                    </div>
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
                        onClick={() => openDialog(sectionLabels.other.title, bookingSettings.other_notes)}
                      >
                        查看完整內容
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 自訂區塊 */}
            {enabledCustomSections.map((section) => (
              <Card key={section.id} className="group hover:shadow-lg transition-all duration-300 border border-border/50 bg-card flex flex-col">
                <CardContent className="p-5 md:p-6 flex flex-col flex-1">
                  <div className="flex items-center gap-2.5 mb-3 md:mb-4">
                    <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                      <LayoutList className="h-5 w-5 md:h-6 md:w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-base md:text-lg">{section.section_title}</h3>
                      {section.section_subtitle && (
                        <p className="text-xs text-muted-foreground mt-0.5">{section.section_subtitle}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 flex flex-col">
                    <div className="space-y-0.5 text-sm md:text-sm text-muted-foreground overflow-hidden" style={{ maxHeight: "180px" }}>
                      <div 
                        className="prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={createSanitizedHtml(section.section_content || "")}
                      />
                    </div>
                    {section.section_content && section.section_content.length > 200 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3 w-full text-foreground hover:bg-primary hover:text-primary-foreground border-primary/20"
                        onClick={() => openDialog(section.section_title, section.section_content || "")}
                      >
                        查看完整內容
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
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
