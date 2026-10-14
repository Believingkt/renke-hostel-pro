import { useState } from "react";
import { Button } from "@lakeze/shared/components/ui/button";
import { Input } from "@lakeze/shared/components/ui/input";
import { Label } from "@lakeze/shared/components/ui/label";
import { Checkbox } from "@lakeze/shared/components/ui/checkbox";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { buildPmsSnippets, taipeiToday } from "@lakeze/shared/utils/pmsApiKey";
import { PmsKeyTestConnection, PMS_API_BASE_URL } from "./PmsKeyTestConnection";

interface Props {
  apiKey: string;
  isReadOnly: boolean;
  acknowledged: boolean;
  onAcknowledge: (v: boolean) => void;
  onDone: () => void;
}

const copy = (text: string) => {
  navigator.clipboard.writeText(text);
  toast.success("已複製到剪貼簿");
};

export function PmsKeyReveal({ apiKey, isReadOnly, acknowledged, onAcknowledge, onDone }: Props) {
  const [showSnippets, setShowSnippets] = useState(false);
  const snippets = buildPmsSnippets(PMS_API_BASE_URL, apiKey, taipeiToday());

  return (
    <div className="space-y-4" data-testid="pms-key-reveal">
      <div className="space-y-2">
        <Label>API Key（{isReadOnly ? "唯讀" : "可讀寫"}）</Label>
        <div className="flex gap-2">
          <Input value={apiKey} readOnly className="font-mono text-xs" data-testid="pms-key-plain" />
          <Button size="icon" variant="outline" onClick={() => copy(apiKey)} data-testid="pms-key-copy-btn">
            <Copy className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-destructive" data-testid="pms-key-once-warning">
          此金鑰只顯示這一次，系統僅保存雜湊值，關閉後無法再查看；遺失請停用後重新產生。請只放在伺服器端環境變數，勿寫入前端或版本庫。
        </p>
      </div>

      <PmsKeyTestConnection apiKey={apiKey} />

      <div className="space-y-2">
        <Button variant="ghost" size="sm" onClick={() => setShowSnippets((v) => !v)} data-testid="pms-key-snippets-toggle">
          {showSnippets ? "收合串接範例" : "顯示串接範例（curl／JavaScript）"}
        </Button>
        {showSnippets && (
          <div className="space-y-3 max-h-64 overflow-y-auto" data-testid="pms-key-snippets">
            {snippets.map((s) => (
              <div key={s.id} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">{s.label}</span>
                  <Button size="sm" variant="ghost" onClick={() => copy(s.code)} data-testid={`pms-key-snippet-copy-${s.id}`}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
                <pre className="rounded bg-muted p-2 text-xs overflow-x-auto whitespace-pre">{s.code}</pre>
              </div>
            ))}
          </div>
        )}
      </div>

      <label className="flex items-center gap-2 rounded-md border p-3 cursor-pointer">
        <Checkbox checked={acknowledged} onCheckedChange={(v) => onAcknowledge(v === true)} data-testid="pms-key-ack-checkbox" />
        <span className="text-sm">我已將金鑰安全保存</span>
      </label>
      <div className="flex justify-end">
        <Button disabled={!acknowledged} onClick={onDone} data-testid="pms-key-done-btn">完成並關閉</Button>
      </div>
    </div>
  );
}
