import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Compass, RefreshCw, Download } from "lucide-react";

interface AttrRow {
  id: string;
  user_id: string | null;
  session_id: string | null;
  budget: number | null;
  party_size: number | null;
  festival: string | null;
  purpose: string | null;
  companion_type: string | null;
  trip_duration: string | null;
  highlights: string[] | null;
  created_at: string;
}

const COMPANION_LABEL: Record<string, string> = {
  family: "家庭",
  couple: "情侶",
  friends: "朋友",
  group: "團體",
  other: "其他",
};

const TravelerAttributes = () => {
  const [rows, setRows] = useState<AttrRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("traveler_attributes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) console.error("load traveler_attributes failed", error);
    setRows((data as AttrRow[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.purpose, r.festival, r.trip_duration, r.companion_type, (r.highlights || []).join(" ")]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [rows, search]);

  const exportCsv = () => {
    const header = ["建立時間", "會員", "期程", "節日", "人數", "夥伴", "目的", "每人預算", "遊玩重點"];
    const lines = filtered.map((r) =>
      [
        new Date(r.created_at).toLocaleString("zh-TW"),
        r.user_id ? "會員" : "訪客",
        r.trip_duration ?? "",
        r.festival ?? "",
        r.party_size ?? "",
        COMPANION_LABEL[r.companion_type ?? ""] ?? r.companion_type ?? "",
        r.purpose ?? "",
        r.budget ?? "",
        (r.highlights || []).join("、"),
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob(["\uFEFF" + [header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `traveler-attributes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader title="旅遊屬性" description="小安對話導引收集到的旅客旅遊屬性歸檔" icon={Compass} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">共 {filtered.length} 筆</CardTitle>
          <div className="flex items-center gap-2">
            <Input
              placeholder="搜尋目的／節日／重點…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-56"
            />
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
              重新整理
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
              <Download className="h-4 w-4 mr-1" />
              匯出 CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[150px] whitespace-nowrap">建立時間</TableHead>
                <TableHead className="w-[80px]">來源</TableHead>
                <TableHead className="w-[90px]">期程</TableHead>
                <TableHead className="w-[110px]">節日</TableHead>
                <TableHead className="w-[80px] text-right tabular-nums">人數</TableHead>
                <TableHead className="w-[90px]">夥伴</TableHead>
                <TableHead className="w-[120px]">目的</TableHead>
                <TableHead className="w-[110px] text-right tabular-nums">每人預算</TableHead>
                <TableHead>遊玩重點</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {new Date(r.created_at).toLocaleString("zh-TW", { hour12: false })}
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.user_id ? "default" : "outline"}>{r.user_id ? "會員" : "訪客"}</Badge>
                  </TableCell>
                  <TableCell>{r.trip_duration ?? "－"}</TableCell>
                  <TableCell>{r.festival ?? "－"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.party_size ?? "－"}</TableCell>
                  <TableCell>{COMPANION_LABEL[r.companion_type ?? ""] ?? r.companion_type ?? "－"}</TableCell>
                  <TableCell>{r.purpose ?? "－"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.budget != null ? `NT$ ${Number(r.budget).toLocaleString()}` : "－"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(r.highlights || []).map((h, i) => (
                        <Badge key={i} variant="secondary" className="font-normal">
                          {h}
                        </Badge>
                      ))}
                      {(!r.highlights || r.highlights.length === 0) && "－"}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-10">
                    尚無旅遊屬性紀錄
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default TravelerAttributes;
