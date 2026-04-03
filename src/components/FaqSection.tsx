import { useState, useEffect } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { supabase } from "@/integrations/supabase/client";
import { createSanitizedHtml } from "@/utils/sanitizeHtml";
import { FileQuestion } from "lucide-react";

interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

const FaqSection = ({ accommodationId, customTitle, customSubtitle }: { accommodationId?: string; customTitle?: string; customSubtitle?: string }) => {
  const [faqs, setFaqs] = useState<FaqItem[]>([]);

  useEffect(() => {
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
  }, [accommodationId]);

  if (faqs.length === 0) {
    return null;
  }

  return (
    <section id="faq" className="py-12 md:py-16 lg:py-20">
      <div className="container mx-auto px-4 md:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8 md:mb-12 lg:mb-16">
            <div className="flex items-center justify-center gap-2 mb-3">
              <FileQuestion className="h-5 w-5 md:h-6 md:w-6 text-primary" />
              <h2 className="text-3xl md:text-3xl lg:text-4xl font-bold">{customTitle || '常見問題'}</h2>
            </div>
            <p className="text-muted-foreground text-base md:text-base lg:text-lg max-w-2xl mx-auto">{customSubtitle || '以下是住客最常詢問的問題，希望能幫助您更了解我們'}</p>
          </div>

          <Accordion type="single" collapsible className="w-full space-y-4">
            {faqs.map((faq) => (
              <AccordionItem
                key={faq.id}
                value={faq.id}
                className="border border-border/50 rounded-lg px-6 bg-card hover:shadow-md transition-shadow"
              >
                <AccordionTrigger className="text-left text-sm md:text-base hover:no-underline py-4">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground text-sm md:text-base pb-4">
                  <div dangerouslySetInnerHTML={createSanitizedHtml(faq.answer)} />
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
