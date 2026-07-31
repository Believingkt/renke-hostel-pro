import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export default function LegalDocument() {
  const { slug } = useParams<{ slug: string }>();
  const [doc, setDoc] = useState<{ title: string; content: string; updated_at: string } | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("platform_legal_documents")
        .select("title, content, updated_at")
        .eq("slug", slug ?? "")
        .maybeSingle();
      if (!active) return;
      if (data) {
        setDoc(data);
        document.title = `${data.title} | 人客多 Lakeze`;
      } else {
        setNotFound(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [slug]);

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        {notFound && <p className="text-muted-foreground">找不到此文件。</p>}
        {doc && (
          <article className="rounded-2xl border bg-card p-6 sm:p-10 space-y-6">
            <header className="border-b pb-4">
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{doc.title}</h1>
              <p className="text-sm text-muted-foreground mt-2">
                最後更新：{new Date(doc.updated_at).toLocaleDateString("zh-TW")}
              </p>
            </header>
            <div className="space-y-4 text-sm sm:text-base leading-relaxed text-foreground whitespace-pre-wrap">
              {doc.content}
            </div>
          </article>
        )}
      </main>
    </div>
  );
}
