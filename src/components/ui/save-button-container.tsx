import { Button } from "@/components/ui/button";
import { ReactNode } from "react";

interface SaveButtonContainerProps {
  onSave: () => void;
  isSaving?: boolean;
  disabled?: boolean;
  children?: ReactNode;
  saveText?: string;
  savingText?: string;
  className?: string;
}

/**
 * 統一的儲存按鈕容器組件
 * 用於所有管理頁面的儲存按鈕，確保樣式和位置一致
 */
export const SaveButtonContainer = ({
  onSave,
  isSaving = false,
  disabled = false,
  children,
  saveText = "儲存變更",
  savingText = "儲存中...",
  className = "",
}: SaveButtonContainerProps) => {
  return (
    <div className={`flex justify-end gap-2 pt-4 border-t ${className}`}>
      {children}
      <Button 
        onClick={onSave} 
        disabled={isSaving || disabled}
        className="min-w-[120px]"
      >
        {isSaving ? savingText : saveText}
      </Button>
    </div>
  );
};
