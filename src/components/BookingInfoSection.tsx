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
import { useBookingLocale } from "@/contexts/BookingLocaleContext";
import type { LucideIcon } from "lucide-react";
import {
  applyVisibleKeys,
  buildBookingNoticePanels,
  type BookingNoticeCustomSection,
  type BookingNoticePanel,
} from "@/lib/bookingNoticePanels";

type CustomSection = BookingNoticeCustomSection;

interface BookingInfoSectionProps {
  bookingSettings: any;
  checkInNotice: string;
  customSections?: CustomSection[];
  customTitle?: string;
  customSubtitle?: string;
  /**
   * 只顯示指定的面板（依此陣列順序）。
   * undefined＝原行為（全部顯示）；失效／不存在的 key 自動略過。
   * key 值：checkIn / payment / cancellation / important / pet / other / custom-<uuid>
   */
  visibleKeys?: string[];
  /** 手機版一次只展開一項（團購頁用） */
  mobileSingleAccordion?: boolean;
  /**
   * 直接指定要顯示的面板（歷史快照）。提供時完全取代 live data 組裝與 visibleKeys 過濾。
   */
  sections?: BookingNoticePanel[];
}

interface Panel extends BookingNoticePanel {
  icon: LucideIcon;
}

const ICONS: Record<string, LucideIcon> = {
  checkIn: Clock,
  payment: CreditCard,
  cancellation: FileText,
  important: AlertTriangle,
  pet: PawPrint,
  other: Info,
};
const iconForKey = (key: string): LucideIcon => ICONS[key] ?? LayoutList;

const BookingInfoSection = ({
  bookingSettings,
  checkInNotice,
  customSections = [],
  customTitle,
  customSubtitle,
  visibleKeys,
  mobileSingleAccordion,
  sections,
}: BookingInfoSectionProps) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogContent, setDialogContent] = useState({ title: "", content: "" });
  const { t } = useBookingLocale();

  const openDialog = (title: string, content: string) => {
    setDialogContent({ title, content });
    setDialogOpen(true);
  };

  // 面板來源：sections（歷史快照）優先，否則由 live data 組裝後依 visibleKeys 過濾
  const basePanels = sections ?? applyVisibleKeys(
    buildBookingNoticePanels(bookingSettings, checkInNotice, customSections),
    visibleKeys,
  );
  const visiblePanels: Panel[] = basePanels.map((p) => ({ ...p, icon: iconForKey(p.key) }));
  if (visiblePanels.length === 0) return null;



  return (
    <section id="booking-info" className="py-12 md:py-16 lg:py-20 bg-background">
      <div className="container mx-auto px-4 md:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8 md:mb-12 lg:mb-16">
            <h2 className="text-3xl md:text-3xl lg:text-4xl font-bold mb-3 md:mb-3 lg:mb-4">
              {customTitle || t("booking.villa.bookingInfo.title")}
            </h2>
            <p className="text-muted-foreground text-base md:text-base lg:text-lg max-w-2xl mx-auto">
              {customSubtitle || t("booking.villa.bookingInfo.subtitle")}
            </p>
          </div>

          {/* ── 手機版：Accordion 摺疊 ── */}
          <div className="md:hidden max-w-md mx-auto">
            <Accordion
              {...(mobileSingleAccordion
                ? ({ type: "single", collapsible: true } as const)
                : ({ type: "multiple" } as const))}
              className="space-y-3"
            >
              {visiblePanels.map((panel) => {
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
            {visiblePanels.map((panel) => {
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
                            {t("booking.villa.bookingInfo.viewFull")}
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
