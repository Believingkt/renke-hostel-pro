import { useEffect, useRef, useState, useCallback } from 'react';
import { toast } from 'sonner';

interface UseFormDraftOptions<T> {
  key: string;
  initialData: T;
  onRestore?: (data: T) => void;
  autoSaveDelay?: number;
  minChangeThreshold?: number; // 最小變更字元數閾值
}

/**
 * 通用表單草稿自動儲存 Hook
 * 
 * @param key - localStorage 的唯一鍵值
 * @param initialData - 表單的初始數據
 * @param onRestore - 恢復草稿時的回調函數
 * @param autoSaveDelay - 自動儲存延遲（毫秒），默認 2500ms
 * @param minChangeThreshold - 最小變更字元數閾值，默認 3
 */
export function useFormDraft<T extends Record<string, any>>({
  key,
  initialData,
  onRestore,
  autoSaveDelay = 2500,
  minChangeThreshold = 3,
}: UseFormDraftOptions<T>) {
  const [formData, setFormData] = useState<T>(initialData);
  const [hasDraft, setHasDraft] = useState(false);
  const [isDraftRestored, setIsDraftRestored] = useState(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const isInitialMount = useRef(true);
  const initialDataRef = useRef<T>(initialData);
  const initializationCompleteRef = useRef(false);
  const mountTimeRef = useRef(Date.now());

  // 更新 initialDataRef 當 initialData 改變時
  useEffect(() => {
    initialDataRef.current = initialData;
  }, [initialData]);

  // 檢查草稿是否與初始資料有實質差異
  const hasMeaningfulDifference = useCallback((draftData: T, currentInitialData: T): boolean => {
    // 計算所有欄位的總變更量
    let totalMeaningfulChange = 0;
    
    for (const key of Object.keys(draftData)) {
      const draftValue = draftData[key];
      const initialValue = currentInitialData[key];
      
      // 處理不同類型的比較
      if (typeof draftValue === 'string' && typeof initialValue === 'string') {
        const draftTrimmed = draftValue.trim();
        const initialTrimmed = initialValue.trim();
        
        if (draftTrimmed !== initialTrimmed) {
          // 計算實際內容變更量（取兩者長度差或最小1）
          const changeLength = Math.max(1, Math.abs(draftTrimmed.length - initialTrimmed.length));
          totalMeaningfulChange += changeLength;
        }
      } else if (Array.isArray(draftValue) && Array.isArray(initialValue)) {
        if (JSON.stringify(draftValue) !== JSON.stringify(initialValue)) {
          totalMeaningfulChange += minChangeThreshold; // 陣列變更視為達到閾值
        }
      } else if (draftValue !== initialValue) {
        totalMeaningfulChange += minChangeThreshold; // 其他類型變更視為達到閾值
      }
    }
    
    // 只有總變更量達到閾值才算有實質差異
    return totalMeaningfulChange >= minChangeThreshold;
  }, [minChangeThreshold]);

  // 檢查是否有草稿（需要與初始資料比較）
  useEffect(() => {
    const draft = localStorage.getItem(key);
    if (draft) {
      try {
        const parsedDraft = JSON.parse(draft) as T;
        // 只有當草稿與初始資料有實質差異時才顯示恢復提示
        if (hasMeaningfulDifference(parsedDraft, initialData)) {
          setHasDraft(true);
        } else {
          // 草稿與初始資料相同，清除無效草稿
          localStorage.removeItem(key);
          setHasDraft(false);
        }
      } catch (error) {
        console.error('Failed to parse draft:', error);
        localStorage.removeItem(key);
      }
    }
    isInitialMount.current = false;
  }, [key, initialData, hasMeaningfulDifference]);

  // 自動儲存草稿（優化版）
  useEffect(() => {
    // 跳過初始掛載
    if (isInitialMount.current) {
      return;
    }

    // 初始化緩衝期（掛載後 1 秒內不觸發自動儲存）
    const timeSinceMount = Date.now() - mountTimeRef.current;
    if (timeSinceMount < 1000) {
      return;
    }

    // 標記初始化完成
    if (!initializationCompleteRef.current) {
      initializationCompleteRef.current = true;
      return;
    }

    // 清除之前的定時器
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    // 設置新的定時器
    autoSaveTimerRef.current = setTimeout(() => {
      try {
        // 計算實質變更量
        let totalChangeLength = 0;
        let hasSignificantChange = false;

        // 比較當前數據和初始數據
        const hasChanges = Object.keys(formData).some(key => {
          const currentValue = formData[key];
          const initialValue = initialDataRef.current[key];
          
          // 處理不同類型的比較
          if (typeof currentValue === 'string' && typeof initialValue === 'string') {
            const currentTrimmed = currentValue.trim();
            const initialTrimmed = initialValue.trim();
            
            if (currentTrimmed !== initialTrimmed) {
              // 計算變更長度
              const changeLength = Math.abs(currentTrimmed.length - initialTrimmed.length);
              totalChangeLength += changeLength;
              return true;
            }
            return false;
          }
          if (Array.isArray(currentValue) && Array.isArray(initialValue)) {
            return JSON.stringify(currentValue) !== JSON.stringify(initialValue);
          }
          return currentValue !== initialValue;
        });

        // 檢查是否達到最小變更閾值
        hasSignificantChange = totalChangeLength >= minChangeThreshold;

        if (hasChanges && hasSignificantChange) {
          // 有實質變更時才儲存草稿
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
        } else if (!hasChanges) {
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
  }, [formData, key, autoSaveDelay, isDraftRestored, minChangeThreshold]);

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
  const clearDraft = useCallback(() => {
    localStorage.removeItem(key);
    setHasDraft(false);
    setIsDraftRestored(false);
  }, [key]);

  // 重置初始數據參考（用於編輯模式）
  const resetInitialDataRef = useCallback((data: T) => {
    initialDataRef.current = data;
  }, []);

  // 放棄草稿
  const discardDraft = useCallback(() => {
    localStorage.removeItem(key);
    setHasDraft(false);
    setIsDraftRestored(false);
    toast.info('已放棄草稿');
  }, [key]);

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
    resetInitialDataRef,
  };
}
