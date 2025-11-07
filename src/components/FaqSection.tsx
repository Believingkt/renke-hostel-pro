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
      console.error("Error loading FAQs:", error);
    }
  };

  if (faqs.length === 0) {
    return null;
  }

  return (
    <section id="faq" className="py-12 md:py-20 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12 md:mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-3 md:mb-4">常見問題</h2>
          <p className="text-center text-muted-foreground mb-0 text-base md:text-lg">
            關於住宿的常見問題解答
          </p>
        </div>

        <div className="max-w-4xl mx-auto bg-background rounded-lg border overflow-hidden">
          <Accordion type="single" collapsible>
            {faqs.map((faq, index) => (
              <AccordionItem
                key={faq.id}
                value={faq.id}
                className={index === faqs.length - 1 ? "border-b-0" : ""}
              >
                <AccordionTrigger className="text-left hover:no-underline px-8 py-6 text-base font-normal">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground px-8 pb-6 pt-0 text-sm leading-relaxed">
                  {faq.answer}
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
