import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ExternalLink, Save } from "lucide-react";
import { toast } from "sonner";

interface LegalDoc {
  id: string;
  slug: string;
  title: string;
  content: string;
  updated_at: string;
}

export function LegalDocumentsManagement() {
  const [docs, setDocs] = useState<LegalDoc[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    const { data, error } = await supabase
      .from("platform_legal_documents")
      .select("id, slug, title, content, updated_at")
      .order("slug");
    if (error) {
      toast.error("載入法律文件失敗");
      return;
    }
    setDocs(data || []);
  };

  const update = (id: string, patch: Partial<LegalDoc>) => {
    setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };

  const save = async (doc: LegalDoc) => {
    setSaving(doc.id);
    const { error } = await supabase
      .from("platform_legal_documents")
      .update({ title: doc.title, content: doc.content })
      .eq("id", doc.id);
    setSaving(null);
    if (error) {
      toast.error("儲存失敗：" + error.message);
      return;
    }
    toast.success(`已儲存「${doc.title}」`);
    load();
  };

  return (
    <div className="space-y-4">
      {docs.map((doc) => (
        <Card key={doc.id}>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-lg">{doc.title}</CardTitle>
                <CardDescription>
                  前台連結：/legal/{doc.slug}　最後更新：
                  {new Date(doc.updated_at).toLocaleString("zh-TW")}
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <a href={`/legal/${doc.slug}`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-1" />
                  預覽
                </a>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>標題</Label>
              <Input value={doc.title} onChange={(e) => update(doc.id, { title: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>內容（純文字，換行會保留）</Label>
              <Textarea
                value={doc.content}
                onChange={(e) => update(doc.id, { content: e.target.value })}
                className="min-h-[280px] text-sm leading-relaxed"
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={() => save(doc)} disabled={saving === doc.id}>
                <Save className="h-4 w-4 mr-1" />
                {saving === doc.id ? "儲存中…" : "儲存"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
