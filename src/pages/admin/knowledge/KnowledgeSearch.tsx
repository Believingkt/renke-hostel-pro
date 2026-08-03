import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Timer, AlertCircle, SearchX, Database } from "lucide-react";
import { Link } from "react-router-dom";

const CATEGORY_LABEL: Record<string, string> = {
  room: "房型",
  facility: "設施",
  policy: "政策",
  location: "位置",
  faq: "常見問題",
  other: "其他",
};

interface ResultRow {
  id: string;
  title: string;
  category: string;
  snippet: string;
  rank: number;
  is_active?: boolean;
  updated_at?: string;
}

const KnowledgeSearch = () => {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [results, setResults] = useState<ResultRow[] | null>(null);
  const [tookMs, setTookMs] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  const runSearch = useCallback(async (q: string, cat: string) => {
    if (!q.trim()) {
      setResults(null);
      setTookMs(null);
      setError(null);
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    const { data, error: fnError } = await supabase.functions.invoke("knowledge-search", {
      body: { query: q.trim(), category: cat === "all" ? undefined : cat, limit: 30 },
    });
    if (id !== reqId.current) return;
    setLoading(false);
    if (fnError) {
      setError(fnError.message || "檢索服務暫時無法使用，請稍後再試。");
      setResults(null);
      return;
    }
    if (data?.error) {
      setError(String(data.error));
      setResults(null);
      return;
    }
    setResults((data?.results as ResultRow[]) ?? []);
    setTookMs(typeof data?.took_ms === "number" ? data.took_ms : null);
  }, []);

  // debounce 即時檢索
  useEffect(() => {
    const t = setTimeout(() => void runSearch(query, category), 300);
    return () => clearTimeout(t);
  }, [query, category, runSearch]);

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="知識庫快速檢索"
        description="以全文索引檢索 ai_knowledge，並顯示伺服器端回應時間"
        icon={Search}
      />

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between space-y-0">
          <div className="flex flex-1 items-center gap-2">
            <Input
              autoFocus
              placeholder="輸入關鍵字，例如：早餐、退房時間、停車…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="max-w-md"
            />
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="全部分類" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部分類</SelectItem>
                {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin/knowledge/index">
                <Database className="h-4 w-4 mr-1" />
                索引管理
              </Link>
            </Button>
          </div>
          {tookMs !== null && !loading && (
            <Badge variant="secondary" className="gap-1 text-sm">
              <Timer className="h-4 w-4" />
              回應時間：{tookMs} ms
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {!error && results !== null && results.length === 0 && !loading && (
            <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
              <SearchX className="h-8 w-8" />
              <p className="text-sm">找不到符合「{query}」的知識條目</p>
              <p className="text-xs">試試更短的關鍵字，或切換分類篩選。</p>
            </div>
          )}

          {!error && results === null && !loading && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              輸入關鍵字即可開始檢索。
            </p>
          )}

          {results?.map((r) => (
            <div key={r.id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{r.title}</span>
                  <Badge variant="outline">{CATEGORY_LABEL[r.category] ?? r.category}</Badge>
                  {r.is_active === false && <Badge variant="secondary">停用</Badge>}
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">
                  相關度 {r.rank.toFixed(3)}
                </span>
              </div>
              <p
                className="mt-2 text-sm text-muted-foreground [&_mark]:bg-primary/20 [&_mark]:text-foreground [&_mark]:rounded [&_mark]:px-0.5"
                dangerouslySetInnerHTML={{ __html: highlight(r.snippet, query) }}
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

// ts_headline 已標記 <mark>；若無標記（中文詞未切分）則以關鍵字補上高亮
function highlight(snippet: string, query: string) {
  const escaped = snippet
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/&lt;mark&gt;/g, "<mark>")
    .replace(/&lt;\/mark&gt;/g, "</mark>");
  if (escaped.includes("<mark>") || !query.trim()) return escaped;
  const q = query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return escaped.replace(new RegExp(q, "gi"), (m) => `<mark>${m}</mark>`);
}

export default KnowledgeSearch;
