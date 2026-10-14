import { useState } from "react";
import { Input } from "@lakeze/shared/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@lakeze/shared/components/ui/alert-dialog";
import { canDeleteKey, type PmsApiKeyRow } from "@lakeze/shared/utils/pmsApiKey";

interface Props {
  target: { key: PmsApiKeyRow; action: "disable" | "delete" } | null;
  onClose: () => void;
  onConfirm: () => void;
}

export function PmsKeyConfirmDialog({ target, onClose, onConfirm }: Props) {
  const [typed, setTyped] = useState("");
  const isDelete = target?.action === "delete";
  const allowed = !target ? false : isDelete ? canDeleteKey(target.key, typed) : true;

  return (
    <AlertDialog open={!!target} onOpenChange={(v) => { if (!v) { setTyped(""); onClose(); } }}>
      <AlertDialogContent data-testid="pms-key-confirm-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{isDelete ? "永久刪除 API Key？" : "停用 API Key？"}</AlertDialogTitle>
          <AlertDialogDescription>
            {isDelete
              ? <>刪除後無法復原。請輸入金鑰名稱「<b>{target?.key.name}</b>」以確認。</>
              : "停用後，使用此金鑰的系統會立即無法呼叫 API；之後可重新啟用。"}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {isDelete && (
          <Input data-testid="pms-key-delete-name-input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={target?.key.name} />
        )}
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="pms-key-confirm-cancel">取消</AlertDialogCancel>
          <AlertDialogAction data-testid="pms-key-confirm-ok" disabled={!allowed}
            onClick={() => { setTyped(""); onConfirm(); }}>
            {isDelete ? "永久刪除" : "停用"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
