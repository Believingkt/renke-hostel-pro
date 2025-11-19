import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

interface UseFormDraftOptions<T> {
  key: string;
  initialData: T;
  onRestore?: (data: T) => void;
  autoSaveDelay?: number;
}

/**
 * 通用表單草稿自動儲存 Hook
 * 
 * @param key - localStorage 的唯一鍵值
 * @param initialData - 表單的初始數據
 * @param onRestore - 恢復草稿時的回調函數
 * @param autoSaveDelay - 自動儲存延遲（毫秒），默認 1000ms
 */
export function useFormDraft<T extends Record<string, any>>({
  key,
  initialData,
  onRestore,
  autoSaveDelay = 1000,
}: UseFormDraftOptions<T>) {
  const [formData, setFormData] = useState<T>(initialData);
  const [hasDraft, setHasDraft] = useState(false);
  const [isDraftRestored, setIsDraftRestored] = useState(false);
  const autoSaveTimerRef = useRef<NodeJS.Timeout>();
  const isInitialMount = useRef(true);

  // 檢查是否有草稿
  useEffect(() => {
    const draft = localStorage.getItem(key);
    if (draft) {
      try {
        const parsedDraft = JSON.parse(draft);
        setHasDraft(true);
        // 不自動恢復，讓用戶決定
      } catch (error) {
        console.error('Failed to parse draft:', error);
        localStorage.removeItem(key);
      }
    }
    isInitialMount.current = false;
  }, [key]);

  // 自動儲存草稿
  useEffect(() => {
    // 跳過初始掛載和已恢復草稿的情況
    if (isInitialMount.current) {
      return;
    }

    // 清除之前的定時器
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    // 設置新的定時器
    autoSaveTimerRef.current = setTimeout(() => {
      try {
        // 檢查表單是否有實際內容（不是空的初始狀態）
        const hasContent = Object.values(formData).some(value => {
          if (typeof value === 'string') return value.trim().length > 0;
          if (typeof value === 'number') return value !== 0;
          if (Array.isArray(value)) return value.length > 0;
          return value != null;
        });

        if (hasContent) {
          localStorage.setItem(key, JSON.stringify(formData));
        }
      } catch (error) {
        console.error('Failed to save draft:', error);
      }
    }, autoSaveDelay);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [formData, key, autoSaveDelay]);

  // 恢復草稿
  const restoreDraft = () => {
    const draft = localStorage.getItem(key);
    if (draft) {
      try {
        const parsedDraft = JSON.parse(draft) as T;
        setFormData(parsedDraft);
        setHasDraft(false);
        setIsDraftRestored(true);
        onRestore?.(parsedDraft);
        toast.success('已恢復草稿');
      } catch (error) {
        console.error('Failed to restore draft:', error);
        toast.error('恢復草稿失敗');
      }
    }
  };

  // 清除草稿
  const clearDraft = () => {
    localStorage.removeItem(key);
    setHasDraft(false);
    setIsDraftRestored(false);
  };

  // 放棄草稿
  const discardDraft = () => {
    clearDraft();
    toast.info('已放棄草稿');
  };

  // 更新表單數據
  const updateFormData = (updates: Partial<T> | ((prev: T) => T)) => {
    setFormData(prev => {
      if (typeof updates === 'function') {
        return updates(prev);
      }
      return { ...prev, ...updates };
    });
  };

  return {
    formData,
    setFormData: updateFormData,
    hasDraft,
    isDraftRestored,
    restoreDraft,
    clearDraft,
    discardDraft,
  };
}
