import { useState } from "react";
import { Button } from "@lakeze/shared/components/ui/button";
import { Input } from "@lakeze/shared/components/ui/input";
import { Label } from "@lakeze/shared/components/ui/label";
import { Checkbox } from "@lakeze/shared/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@lakeze/shared/components/ui/alert-dialog";
import { READ_WRITE_CONFIRM_TOKEN } from "@lakeze/shared/utils/pmsApiKey";

export interface CreateFormValue {
  name: string;
  extraAccIds: string[];
  readWrite: boolean;
}

interface Props {
  primaryName: string;
  others: { id: string; name: string }[];
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (v: CreateFormValue) => void;
}

export function PmsKeyCreateForm({ primaryName, others, submitting, onCancel, onSubmit }: Props) {
  const [name, setName] = useState("");
  const [extraAccIds, setExtraAccIds] = useState<string[]>([]);
  const [readWrite, setReadWrite] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const isMulti = extraAccIds.length > 0;

  const requestReadWrite = (v: boolean) => {
    if (!v) return setReadWrite(false);
    setTyped("");
    setConfirmOpen(true);
  };

  return (
    <div className="space-y-4" data-testid="pms-key-create-form">
      <div className="space-y-2">
        <Label htmlFor="pms-key-name">金鑰名稱（用途）</Label>
        <Input id="pms-key-name" data-testid="pms-key-name-input" value={name} maxLength={100}
          onChange={(e) => setName(e.target.value)} placeholder="例：PMS 每日營運報表、BI 儀表板" />
      </div>
      <div className="space-y-2">
        <Label>額外可存取館別（選填）</Label>
        <p className="text-xs text-muted-foreground">主館：「{primaryName}」。勾選任一館別即成為多館金鑰，一律強制唯讀。</p>
        <div className="max-h-40 overflow-y-auto rounded-md border p-2 space-y-1" data-testid="pms-key-scope-list">
          {others.map((a) => (
            <label key={a.id} className="flex items-center gap-2 py-1 cursor-pointer">
              <Checkbox data-testid={`pms-key-scope-${a.id}`} checked={extraAccIds.includes(a.id)}
                onCheckedChange={(v) => {
                  setExtraAccIds((p) => (v === true ? [...p, a.id] : p.filter((x) => x !== a.id)));
                  if (v === true) setReadWrite(false);
                }} />
              <span className="text-sm">{a.name}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="flex items-start gap-2 rounded-md border p-3">
        <Checkbox id="pms-key-rw" data-testid="pms-key-readwrite-checkbox" checked={readWrite}
          disabled={isMulti} onCheckedChange={(v) => requestReadWrite(v === true)} />
        <div className="space-y-1">
          <Label htmlFor="pms-key-rw" className="cursor-pointer">允許寫入（可讀寫金鑰）</Label>
          <p className="text-xs text-muted-foreground">
            預設唯讀：可查詢進單／住宿雙軸、住房率、可售房與房型。可讀寫金鑰另可新增房型，需二次確認。
            {isMulti && "（多館金鑰強制唯讀）"}
          </p>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} data-testid="pms-key-create-cancel">取消</Button>
        <Button data-testid="pms-key-create-submit" disabled={submitting || !name.trim()}
          onClick={() => onSubmit({ name: name.trim(), extraAccIds, readWrite: readWrite && !isMulti })}>
          {submitting ? "建立中…" : "產生金鑰"}
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent data-testid="pms-key-readwrite-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>確認建立可讀寫金鑰？</AlertDialogTitle>
            <AlertDialogDescription>
              持有此金鑰的系統可對「{primaryName}」寫入資料。請輸入 <code>{READ_WRITE_CONFIRM_TOKEN}</code> 以確認。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input data-testid="pms-key-readwrite-confirm-input" value={typed} onChange={(e) => setTyped(e.target.value)} />
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="pms-key-readwrite-confirm-cancel">取消</AlertDialogCancel>
            <AlertDialogAction data-testid="pms-key-readwrite-confirm-ok" disabled={typed !== READ_WRITE_CONFIRM_TOKEN}
              onClick={() => setReadWrite(true)}>確認可讀寫</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
