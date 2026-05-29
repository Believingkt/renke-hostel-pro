import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAccommodation } from "@/contexts/AccommodationContext";

type Log = {
  id: string; session_id: string; prompt_version: number | null;
  messages: any[]; source: string | null; user_rating: string | null;
  admin_note: string | null; created_at: string;
};

export default function AdminAiTrainingConversations() {
  const { currentAccommodationId } = useAccommodation();
  const [rows, setRows] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Log | null>(null);

  const load = useCallback(async () => {
    if (!currentAccommodationId) return;
    setLoading(true);
    const { data } = await supabase.from("ai_conversation_logs").select("*")
      .eq("accommodation_id", currentAccommodationId)
      .order("created_at", { ascending: false }).limit(100);
    setRows(((data as unknown) as Log[]) || []);
    setLoading(false);
  }, [currentAccommodationId]);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">對話紀錄</h1>
        <p className="text-sm text-muted-foreground mt-1">查看 AI 管家與用戶的對話歷史（含外部 API 串接來源）。</p>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-40">時間</TableHead>
              <TableHead>第一句訊息</TableHead>
              <TableHead className="w-24">來源</TableHead>
              <TableHead className="w-20">版本</TableHead>
              <TableHead className="w-20">訊息數</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? null : rows.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">尚無對話</TableCell></TableRow>
            ) : rows.map((r) => {
              const firstUser = (r.messages || []).find((m: any) => m.role === "user");
              return (
                <TableRow key={r.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setSelected(r)}>
                  <TableCell className="text-xs">{new Date(r.created_at).toLocaleString("zh-TW")}</TableCell>
                  <TableCell className="max-w-md truncate">{firstUser?.content || "—"}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{r.source || "internal"}</Badge></TableCell>
                  <TableCell>{r.prompt_version ? `v${r.prompt_version}` : "—"}</TableCell>
                  <TableCell>{(r.messages || []).length}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>對話內容 · {selected && new Date(selected.created_at).toLocaleString("zh-TW")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {(selected?.messages || []).map((m: any, i: number) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                  m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                }`}>{m.content}</div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
