import { Button } from "@lakeze/shared/components/ui/button";
import { Badge } from "@lakeze/shared/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@lakeze/shared/components/ui/table";
import { Power, Trash2 } from "lucide-react";
import type { PmsApiKeyRow } from "@lakeze/shared/utils/pmsApiKey";

interface Props {
  keys: PmsApiKeyRow[];
  loading: boolean;
  scopeLabel: (keyId: string) => string;
  onToggle: (k: PmsApiKeyRow) => void;
  onDelete: (k: PmsApiKeyRow) => void;
}

const fmt = (ts: string | null) => (ts ? new Date(ts).toLocaleString("zh-TW") : "—");

export function PmsKeyTable({ keys, loading, scopeLabel, onToggle, onDelete }: Props) {
  const empty = loading ? "載入中..." : keys.length === 0 ? "尚無 API Keys" : null;
  return (
    <Table data-testid="pms-key-table">
      <TableHeader>
        <TableRow>
          <TableHead>名稱</TableHead>
          <TableHead>金鑰前綴</TableHead>
          <TableHead>狀態</TableHead>
          <TableHead>權限</TableHead>
          <TableHead>可存取館別</TableHead>
          <TableHead>最後使用</TableHead>
          <TableHead>建立時間</TableHead>
          <TableHead className="text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {empty ? (
          <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8" data-testid="pms-key-table-empty">{empty}</TableCell></TableRow>
        ) : keys.map((k) => (
          <TableRow key={k.id} data-testid={`pms-key-row-${k.id}`}>
            <TableCell className="font-medium">{k.name}</TableCell>
            <TableCell className="font-mono text-sm">{k.key_prefix}</TableCell>
            <TableCell><Badge variant={k.is_active ? "default" : "secondary"}>{k.is_active ? "啟用" : "停用"}</Badge></TableCell>
            <TableCell><Badge variant={k.is_read_only ? "secondary" : "destructive"}>{k.is_read_only ? "唯讀" : "可讀寫"}</Badge></TableCell>
            <TableCell className="text-sm">{scopeLabel(k.id)}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{fmt(k.last_used_at)}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{new Date(k.created_at).toLocaleDateString("zh-TW")}</TableCell>
            <TableCell className="text-right space-x-1">
              <Button variant="ghost" size="sm" onClick={() => onToggle(k)} data-testid={`pms-key-toggle-${k.id}`}
                title={k.is_active ? "停用" : "啟用"}>
                <Power className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onDelete(k)} disabled={k.is_active}
                data-testid={`pms-key-delete-${k.id}`} title={k.is_active ? "請先停用才能刪除" : "刪除"}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
