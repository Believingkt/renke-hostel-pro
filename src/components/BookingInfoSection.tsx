import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, CreditCard, FileText, Info, PawPrint, AlertTriangle, LayoutList } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { createSanitizedHtml } from "@/utils/sanitizeHtml";
import type { LucideIcon } from "lucide-react";

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

interface Panel {
  key: string;
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  /** 純文字摘要（如：入住/退房時間、付款方式） */
  textRows?: { label?: string; value: string }[];
  /** HTML 內容 */
  html?: string;
}

const BookingInfoSection = ({
  bookingSettings,
  checkInNotice,
  customSections = [],
  customTitle,
  customSubtitle,
}: BookingInfoSectionProps) => {
  const hasPetPolicy = bookingSettings?.pet_policy && bookingSettings.pet_policy.trim() !== "";
  const hasOtherNotes = bookingSettings?.other_notes && bookingSettings.other_notes.trim() !== "";
  const hasCheckInTime = bookingSettings?.check_in_time && bookingSettings.check_in_time.trim() !== "";
  const hasCheckOutTime = bookingSettings?.check_out_time && bookingSettings.check_out_time.trim() !== "";
  const hasPaymentMethods = Array.isArray(bookingSettings?.payment_methods) && bookingSettings.payment_methods.length > 0;
  const hasCancellationPolicy = bookingSettings?.cancellation_policy && bookingSettings.cancellation_policy.trim() !== "";
  const hasCheckInNotice = checkInNotice && checkInNotice.trim() !== "";
  const hasCustomSections = customSections.filter((s) => s.is_enabled && s.section_content?.trim()).length > 0;

  const sectionLabels = {
    checkIn: {
      title: bookingSettings?.check_in_section_title || "入住時間",
      subtitle: bookingSettings?.check_in_section_subtitle || undefined,
    },
    payment: {
      title: bookingSettings?.payment_section_title || "付款方式",
      subtitle: bookingSettings?.payment_section_subtitle || undefined,
    },
    cancellation: {
      title: bookingSettings?.cancellation_section_title || "取消政策",
      subtitle: bookingSettings?.cancellation_section_subtitle || undefined,
    },
    important: {
      title: bookingSettings?.important_section_title || "重要事項",
      subtitle: bookingSettings?.important_section_subtitle || undefined,
    },
    pet: {
      title: bookingSettings?.pet_section_title || "寵物入住守則",
      subtitle: bookingSettings?.pet_section_subtitle || undefined,
    },
    other: {
      title: bookingSettings?.other_section_title || "其他注意事項",
      subtitle: bookingSettings?.other_section_subtitle || undefined,
    },
  };

  const hasAnyData =
    hasCheckInTime || hasCheckOutTime || hasPaymentMethods || hasCancellationPolicy ||
    hasCheckInNotice || hasPetPolicy || hasOtherNotes || hasCustomSections;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogContent, setDialogContent] = useState({ title: "", content: "" });

  const openDialog = (title: string, content: string) => {
    setDialogContent({ title, content });
    setDialogOpen(true);
  };

  if (!hasAnyData) return null;

  const enabledCustomSections = customSections
    .filter((s) => s.is_enabled && s.section_content?.trim())
    .sort((a, b) => a.display_order - b.display_order);

  // 統一面板資料，供桌面卡片與手機 Accordion 共用
  const panels: Panel[] = [];

  if (hasCheckInTime || hasCheckOutTime) {
    panels.push({
      key: "checkIn",
      icon: Clock,
      title: sectionLabels.checkIn.title,
      subtitle: sectionLabels.checkIn.subtitle,
      textRows: [
        ...(hasCheckInTime ? [{ label: "入住", value: `${bookingSettings.check_in_time} 之後` }] : []),
        ...(hasCheckOutTime ? [{ label: "退房", value: `${bookingSettings.check_out_time} 之前` }] : []),
      ],
    });
  }
  if (hasPaymentMethods) {
    panels.push({
      key: "payment",
      icon: CreditCard,
      title: sectionLabels.payment.title,
      subtitle: sectionLabels.payment.subtitle,
      textRows: bookingSettings.payment_methods.map((m: string) => ({ value: m })),
    });
  }
  if (hasCancellationPolicy) {
    panels.push({
      key: "cancellation",
      icon: FileText,
      title: sectionLabels.cancellation.title,
      subtitle: sectionLabels.cancellation.subtitle,
      html: bookingSettings.cancellation_policy,
    });
  }
  if (hasCheckInNotice) {
    panels.push({
      key: "important",
      icon: AlertTriangle,
      title: sectionLabels.important.title,
      subtitle: sectionLabels.important.subtitle,
      html: checkInNotice,
    });
  }
  if (hasPetPolicy) {
    panels.push({
      key: "pet",
      icon: PawPrint,
      title: sectionLabels.pet.title,
      subtitle: sectionLabels.pet.subtitle,
      html: bookingSettings.pet_policy,
    });
  }
  if (hasOtherNotes) {
    panels.push({
      key: "other",
      icon: Info,
      title: sectionLabels.other.title,
      subtitle: sectionLabels.other.subtitle,
      html: bookingSettings.other_notes,
    });
  }
  enabledCustomSections.forEach((section) => {
    panels.push({
      key: `custom-${section.id}`,
      icon: LayoutList,
      title: section.section_title,
      subtitle: section.section_subtitle || undefined,
      html: section.section_content || "",
    });
  });

  return (
    <section id="booking-info" className="py-12 md:py-16 lg:py-20 bg-background">
      <div className="container mx-auto px-4 md:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8 md:mb-12 lg:mb-16">
            <h2 className="text-3xl md:text-3xl lg:text-4xl font-bold mb-3 md:mb-3 lg:mb-4">
              {customTitle || "訂房須知"}
            </h2>
            <p className="text-muted-foreground text-base md:text-base lg:text-lg max-w-2xl mx-auto">
              {customSubtitle || "為確保愉快的住宿體驗，請詳閱以下相關資訊"}
            </p>
          </div>

          {/* ── 手機版：Accordion 摺疊 ── */}
          <div className="md:hidden max-w-md mx-auto">
            <Accordion type="multiple" className="space-y-3">
              {panels.map((panel) => {
                const Icon = panel.icon;
                return (
                  <AccordionItem
                    key={panel.key}
                    value={panel.key}
                    className="border border-border/50 rounded-2xl bg-card px-4 overflow-hidden"
                  >
                    <AccordionTrigger className="hover:no-underline py-4">
                      <div className="flex items-center gap-3 flex-1 text-left">
                        <div className="p-2 rounded-lg bg-primary/10 flex-shrink-0">
                          <Icon className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-sm text-foreground leading-tight">
                            {panel.title}
                          </h3>
                          {panel.subtitle && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                              {panel.subtitle}
                            </p>
                          )}
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-4">
                      {panel.textRows && (
                        <div className="space-y-1.5 text-sm text-muted-foreground">
                          {panel.textRows.map((row, i) => (
                            <div key={i} className="flex items-center gap-2">
                              {row.label ? (
                                <span className="font-medium text-foreground">{row.label}：</span>
                              ) : (
                                <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                              )}
                              <span>{row.value}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {panel.html && (
                        <div
                          className="prose prose-sm max-w-none text-sm text-muted-foreground"
                          dangerouslySetInnerHTML={createSanitizedHtml(panel.html)}
                        />
                      )}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </div>

          {/* ── 桌面版：原本卡片網格 ── */}
          <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5 lg:gap-6">
            {panels.map((panel) => {
              const Icon = panel.icon;
              const longHtml = panel.html && panel.html.length > 200;
              return (
                <Card
                  key={panel.key}
                  className="group hover:shadow-lg transition-all duration-300 border border-border/50 bg-card flex flex-col"
                >
                  <CardContent className="p-5 md:p-6 flex flex-col flex-1">
                    <div className="flex items-center gap-2.5 mb-3 md:mb-4">
                      <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                        <Icon className="h-5 w-5 md:h-5 md:w-5 lg:h-6 lg:w-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-base md:text-base lg:text-lg">{panel.title}</h3>
                        {panel.subtitle && (
                          <p className="text-sm text-muted-foreground mt-0.5">{panel.subtitle}</p>
                        )}
                      </div>
                    </div>
                    {panel.textRows && (
                      <div className="space-y-0.5 text-sm text-muted-foreground">
                        {panel.textRows.map((row, i) => (
                          <div key={i} className="flex items-center gap-2 py-1.5">
                            {row.label ? (
                              <span className="font-medium text-foreground">{row.label}：</span>
                            ) : (
                              <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                            )}
                            <span>{row.value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {panel.html && (
                      <div className="flex-1 flex flex-col">
                        <div
                          className="space-y-0.5 text-sm text-muted-foreground overflow-hidden"
                          style={{ maxHeight: "180px" }}
                        >
                          <div
                            className="prose prose-sm max-w-none"
                            dangerouslySetInnerHTML={createSanitizedHtml(panel.html)}
                          />
                        </div>
                        {longHtml && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-3 w-full text-foreground hover:bg-primary hover:text-primary-foreground border-primary/20"
                            onClick={() => openDialog(panel.title, panel.html!)}
                          >
                            查看完整內容
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
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
