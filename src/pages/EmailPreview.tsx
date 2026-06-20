import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Acc = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  line_id: string | null;
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export default function EmailPreview() {
  const [accommodations, setAccommodations] = useState<Acc[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [html, setHtml] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase
      .from("accommodation_info")
      .select("id, name, phone, email, line_id")
      .order("name")
      .then(({ data }) => {
        if (data) {
          setAccommodations(data as Acc[]);
          if (data.length && !selectedId) setSelectedId(data[0].id);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    const url = `${SUPABASE_URL}/functions/v1/preview-booking-confirmation?accommodation_id=${selectedId}&t=${Date.now()}`;
    fetch(url)
      .then((r) => r.text())
      .then(setHtml)
      .finally(() => setLoading(false));
  }, [selectedId]);

  const selected = useMemo(
    () => accommodations.find((a) => a.id === selectedId),
    [accommodations, selectedId],
  );

  return (
    <div className="p-6 space-y-4 max-w-[1100px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold mb-1">訂房確認通知 — 信件預覽</h1>
        <p className="text-sm text-muted-foreground">
          選擇民宿即可預覽該民宿寄送的訂房確認信件實際樣式（使用範例訂單資料）。
        </p>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1 max-w-sm">
            <Label className="mb-1 block">選擇民宿</Label>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger>
                <SelectValue placeholder="請選擇..." />
              </SelectTrigger>
              <SelectContent>
                {accommodations.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selected && (
            <div className="text-xs text-muted-foreground space-y-1">
              <div>📞 {selected.phone || <span className="text-amber-600">未設定</span>}</div>
              <div>💬 {selected.line_id || <span className="text-amber-600">未設定</span>}</div>
              <div>📧 {selected.email || <span className="text-amber-600">未設定</span>}</div>
            </div>
          )}
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        {loading && (
          <div className="p-8 text-center text-sm text-muted-foreground">載入中…</div>
        )}
        <iframe
          title="email-preview"
          srcDoc={html}
          className="w-full"
          style={{ height: "1400px", border: "0", background: "#f4f4f5" }}
        />
      </Card>
    </div>
  );
}
