import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  open: boolean;
  yearMonth: string;
  used: number;
  quota: number;
  onCancel: () => void;
  onConfirm: () => void;
}

export function KolQuotaConfirmDialog({ open, yearMonth, used, quota, onCancel, onConfirm }: Props) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>KOL 互惠額度已達上限</AlertDialogTitle>
          <AlertDialogDescription>
            {yearMonth} 已建立 <span className="font-semibold text-foreground">{used}/{quota}</span> 筆 KOL 互惠訂單，是否仍要強制建立？
            <br />
            此操作將被記錄到稽核日誌。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>取消</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            強制建立
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
