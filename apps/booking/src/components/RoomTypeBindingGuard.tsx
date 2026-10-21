import { X } from "lucide-react";
import { Badge } from "@lakeze/shared/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@lakeze/shared/components/ui/alert-dialog";
import { ALL_ROOMS_CONFIRM_TEXT } from "@/lib/roomTypeBinding";

export const DeletedRoomTypeChips = ({ ids, onRemove }: { ids: string[]; onRemove: (id: string) => void }) => {
  if (ids.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2" data-testid="deleted-room-type-chips">
      {ids.map((id) => (
        <Badge key={id} variant="destructive" className="gap-1" data-testid={`deleted-room-type-chip-${id}`}>
          已刪除的房型（請移除）
          <button
            type="button"
            aria-label="移除已刪除的房型"
            onClick={() => onRemove(id)}
            data-testid={`deleted-room-type-remove-${id}`}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
    </div>
  );
};

export const AllRoomTypesConfirmDialog = ({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: () => void;
}) => (
  <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent data-testid="all-room-types-confirm-dialog">
      <AlertDialogHeader>
        <AlertDialogTitle>原本綁定的房型已刪除</AlertDialogTitle>
        <AlertDialogDescription>{ALL_ROOMS_CONFIRM_TEXT}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel data-testid="all-room-types-confirm-cancel">返回選擇房型</AlertDialogCancel>
        <AlertDialogAction data-testid="all-room-types-confirm-ok" onClick={onConfirm}>
          確認適用所有房型
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
