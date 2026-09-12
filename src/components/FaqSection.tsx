import { useState, useEffect } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { supabase } from "@/integrations/supabase/client";
import { createSanitizedHtml } from "@/utils/sanitizeHtml";
import { looksLikeHtml, toPlainTextBlocks } from "@/lib/plainTextFormat";
import { FileQuestion } from "lucide-react";

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

import { makeSectionText, type SectionLocalize } from "@/components/section-localize";

interface FaqSectionProps {
  /** 可選：傳入才翻譯；未傳＝原樣繁中 */
  localize?: SectionLocalize;
  accommodationId?: string;
  customTitle?: string;
  customSubtitle?: string;
  /** 傳入時直接渲染這批 FAQ（不自行查詢）；未傳入時維持原本查詢行為 */
  items?: FaqItem[];
  /** 純文字答案是否格式化為條列／保留換行（預設 false＝維持原行為） */
  formatPlainText?: boolean;
  /** 手機版初始顯示題數，其餘點擊後展開（預設全部顯示） */
  mobileInitialCount?: number;
}

/** 答案內容：HTML 走既有 sanitize 流程；純文字（且開啟 formatPlainText）才做條列格式化 */
function FaqAnswer({ answer, formatPlainText }: { answer: string; formatPlainText?: boolean }) {
  if (!formatPlainText || looksLikeHtml(answer)) {
    return <div dangerouslySetInnerHTML={createSanitizedHtml(answer)} />;
  }
  const blocks = toPlainTextBlocks(answer);
  if (blocks.length === 0) return null;
  return (
    <div className="space-y-1.5 leading-[1.7]">
      {blocks.map((b, i) =>
        b.type === "li" ? (
          <div key={i} className="flex items-start gap-2">
            <span className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
            <span className="min-w-0 break-words">{b.text}</span>
          </div>
        ) : (
          <p key={i} className="break-words">
            {b.text}
          </p>
        ),
      )}
    </div>
  );
}

const FaqSection = ({
  localize,
  accommodationId,
  customTitle,
  customSubtitle,
  items,
  formatPlainText,
  mobileInitialCount,
}: FaqSectionProps) => {
  const { ui, dyn } = makeSectionText(localize);
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [showAllMobile, setShowAllMobile] = useState(false);

  useEffect(() => {
    if (items) return;
    if (!accommodationId) return;

    const loadFaqs = async () => {
      try {
        const { data: faqData } = await supabase
          .from("faqs")
          .select("id, question, answer")
          .eq("accommodation_id", accommodationId)
          .eq("is_published", true)
          .order("display_order");

        if (faqData) {
          setFaqs(faqData);
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error("Error loading FAQs:", error);
        }
      }
    };

    loadFaqs();
  }, [accommodationId, items]);

  const list = items ?? faqs;

  if (list.length === 0) {
    return null;
  }

  return (
    <section id="faq" className="py-10 md:py-16 lg:py-20">
      <div className="container mx-auto px-4 md:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-6 md:mb-12 lg:mb-16">
            <div className="flex items-center justify-center gap-2 mb-2 md:mb-3">
              <FileQuestion className="h-5 w-5 md:h-6 md:w-6 text-primary" />
              <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold">{customTitle ? dyn("faq_title", "custom", customTitle) : ui("booking.section.faq.title", "常見問題")}</h2>
            </div>
            <p className="text-muted-foreground text-sm md:text-base lg:text-lg max-w-2xl mx-auto">{customSubtitle ? dyn("faq_subtitle", "custom", customSubtitle) : ui("booking.section.faq.subtitle", "以下是住客最常詢問的問題，希望能幫助您更了解我們")}</p>
          </div>

          {/* 手機版：精簡扁平 Accordion，單一卡片內以分隔線分項 */}
          <Accordion type="single" collapsible className="w-full md:hidden rounded-2xl border border-border/50 bg-card divide-y divide-border/50 overflow-hidden">
            {(mobileInitialCount && !showAllMobile ? list.slice(0, mobileInitialCount) : list).map((faq) => (
              <AccordionItem
                key={faq.id}
                value={faq.id}
                className="border-0 px-4"
              >
                <AccordionTrigger className="text-left text-sm font-medium hover:no-underline py-3.5">
                  {dyn("question", faq.id, faq.question)}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground text-sm pb-4 leading-relaxed">
                  <FaqAnswer answer={dyn("answer", faq.id, faq.answer)} formatPlainText={formatPlainText} />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
          {!!mobileInitialCount && !showAllMobile && list.length > mobileInitialCount && (
            <button
              type="button"
              onClick={() => setShowAllMobile(true)}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary underline underline-offset-4 md:hidden"
            >
              {ui("booking.section.faq.viewAll", `查看全部 ${list.length} 個常見問題`, { count: list.length })}
            </button>
          )}

          {/* 桌面版：保留原本卡片樣式 */}
          <Accordion type="single" collapsible className="w-full hidden md:block space-y-4">
            {list.map((faq) => (
              <AccordionItem
                key={faq.id}
                value={faq.id}
                className="border border-border/50 rounded-lg px-6 bg-card hover:shadow-md transition-shadow"
              >
                <AccordionTrigger className="text-left text-sm md:text-base hover:no-underline py-4">
                  {dyn("question", faq.id, faq.question)}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground text-sm md:text-base pb-4">
                  <FaqAnswer answer={dyn("answer", faq.id, faq.answer)} formatPlainText={formatPlainText} />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
};

export default FaqSection;
