import { useEffect, useRef, useState, useCallback } from 'react';
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
  const initialDataRef = useRef<T>(initialData);

  // 更新 initialDataRef 當 initialData 改變時
  useEffect(() => {
    initialDataRef.current = initialData;
  }, [initialData]);

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
    // 跳過初始掛載
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
        // 比較當前數據和初始數據，檢查是否有變更
        const hasChanges = Object.keys(formData).some(key => {
          const currentValue = formData[key];
          const initialValue = initialDataRef.current[key];
          
          // 處理不同類型的比較
          if (typeof currentValue === 'string' && typeof initialValue === 'string') {
            return currentValue.trim() !== initialValue.trim();
          }
          if (Array.isArray(currentValue) && Array.isArray(initialValue)) {
            return JSON.stringify(currentValue) !== JSON.stringify(initialValue);
          }
          return currentValue !== initialValue;
        });

        if (hasChanges) {
          // 有變更時才儲存草稿
          const hasContent = Object.values(formData).some(value => {
            if (typeof value === 'string') return value.trim().length > 0;
            if (typeof value === 'number') return value !== 0;
            if (Array.isArray(value)) return value.length > 0;
            return value != null;
          });

          if (hasContent) {
            localStorage.setItem(key, JSON.stringify(formData));
            setHasDraft(true);
          }
        } else {
          // 沒有變更時清除草稿
          const existingDraft = localStorage.getItem(key);
          if (existingDraft && !isDraftRestored) {
            localStorage.removeItem(key);
            setHasDraft(false);
          }
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
  }, [formData, key, autoSaveDelay, isDraftRestored]);

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

  // 更新表單數據（使用 useCallback 確保穩定引用）
  const updateFormData = useCallback((updates: Partial<T> | ((prev: T) => T)) => {
    setFormData(prev => {
      if (typeof updates === 'function') {
        return updates(prev);
      }
      return { ...prev, ...updates };
    });
  }, []);

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
