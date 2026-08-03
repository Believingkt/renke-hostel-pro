import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Database, RefreshCw, Search, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";

const KnowledgeIndex = () => {
  const [total, setTotal] = useState<number | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ count: totalCount }, { count: activeCount }, { data: latest }] = await Promise.all([
      supabase.from("ai_knowledge").select("id", { count: "exact", head: true }),
      supabase.from("ai_knowledge").select("id", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("ai_knowledge").select("updated_at").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    setTotal(totalCount ?? 0);
    setActive(activeCount ?? 0);
    setLastUpdated(latest?.updated_at ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="知識庫索引管理"
        description="ai_knowledge 全文檢索索引狀態總覽"
        icon={Database}
      />

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
          重新整理
        </Button>
        <Button size="sm" asChild>
          <Link to="/admin/knowledge/search">
            <Search className="h-4 w-4 mr-1" />
            前往快速檢索
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">全文索引（tsvector / GIN）</CardTitle>
            <Badge variant="secondary" className="gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              正常
            </Badge>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="索引名稱" value="idx_ai_knowledge_search_tsv" />
            <Row label="來源欄位" value="title（權重 A）＋ content（權重 B）" />
            <Row label="涵蓋筆數" value={total === null ? "—" : `${total} 筆（啟用 ${active ?? 0} 筆）`} />
            <Row
              label="最後更新"
              value={lastUpdated ? new Date(lastUpdated).toLocaleString("zh-TW") : "—"}
            />
            <Row label="維護方式" value="自動維護（generated column，寫入即更新，無需重建）" />
            <div className="pt-2">
              <Button variant="outline" size="sm" disabled>
                自動維護中，無需重建
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">語意索引（pgvector embedding）</CardTitle>
            <Badge variant="outline">未啟用</Badge>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="索引名稱" value="—" />
            <Row label="涵蓋筆數" value="0" />
            <Row label="最後重建時間" value="—" />
            <Row
              label="說明"
              value="目前知識庫規模不需語意檢索；全文索引即可涵蓋。未來如需語意搜尋，可在此頁加入重建 embedding 動作。"
            />
            <div className="pt-2">
              <Button variant="outline" size="sm" disabled>
                重建索引（尚未啟用）
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex gap-3">
    <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
    <span className="flex-1 break-words">{value}</span>
  </div>
);

export default KnowledgeIndex;
