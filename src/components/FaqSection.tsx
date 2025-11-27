import { useState, useEffect } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { supabase } from "@/integrations/supabase/client";

interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

const FaqSection = () => {
  const [faqs, setFaqs] = useState<FaqItem[]>([]);

  useEffect(() => {
    loadFaqs();
  }, []);

  const loadFaqs = async () => {
    try {
      const { data: infoData } = await supabase
        .from("accommodation_info")
        .select("id")
        .maybeSingle();

      if (infoData) {
        const { data: faqData } = await supabase
          .from("faqs")
          .select("id, question, answer")
          .eq("accommodation_id", infoData.id)
          .eq("is_published", true)
          .order("display_order");

        if (faqData) {
          setFaqs(faqData);
        }
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Error loading FAQs:", error);
      }
    }
  };

  if (faqs.length === 0) {
    return null;
  }

  return (
    <section id="faq" className="py-12 md:py-16 lg:py-20 bg-background">
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-center mb-10 md:mb-12 lg:mb-16">
          <h2 className="text-3xl md:text-3xl lg:text-4xl font-bold text-center mb-3 md:mb-3 lg:mb-4">常見問題</h2>
          <p className="text-center text-muted-foreground mb-0 text-base md:text-base lg:text-lg max-w-3xl mx-auto">
            關於住宿的常見問題解答
          </p>
        </div>

        <div className="max-w-4xl mx-auto bg-card rounded-lg border border-border/50 overflow-hidden shadow-lg">
          <Accordion type="single" collapsible>
            {faqs.map((faq, index) => (
              <AccordionItem
                key={faq.id}
                value={faq.id}
                className={index === faqs.length - 1 ? "border-b-0" : ""}
              >
                <AccordionTrigger className="text-left hover:no-underline px-4 md:px-5 lg:px-6 py-3.5 md:py-4 lg:py-5 text-sm md:text-sm lg:text-base font-normal">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground px-4 md:px-5 lg:px-6 pb-3.5 md:pb-4 lg:pb-5 pt-0 text-xs md:text-sm lg:text-sm leading-relaxed prose prose-sm max-w-none">
                  <div dangerouslySetInnerHTML={{ __html: faq.answer }} />
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
