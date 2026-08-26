import { useCallback, useEffect, useState } from "react";

/**
 * 通知「已讀 / 已解決」狀態（localStorage，衍生式通知不建表）。
 * - 已讀：使用者看過或點過該則通知 → 不再計入紅點 badge
 * - 已解決：設定補齊後該通知不再出現 → 自動從已讀清單移除（prune），
 *   同一個缺口若日後再度發生會重新變成未讀。
 */

function storageKey(userId: string) {
  return `team:notif-read:${userId}`;
}

function read(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function persist(key: string, ids: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    /* 忽略 */
  }
}

/** 移除已解決（不在目前清單中）的 id */
export function pruneResolved(readIds: string[], activeIds: string[]): string[] {
  const active = new Set(activeIds);
  return readIds.filter((id) => active.has(id));
}

export function useNotificationReadState(userId: string, activeIds: string[]) {
  const key = storageKey(userId);
  const [readIds, setReadIds] = useState<string[]>(() => read(key));

  // 設定補齊 → 該通知消失 → 自動清掉已讀紀錄（避免無限成長與狀態殘留）
  useEffect(() => {
    setReadIds((prev) => {
      const next = pruneResolved(prev, activeIds);
      if (next.length === prev.length) return prev;
      persist(key, next);
      return next;
    });
  }, [key, activeIds.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  const markRead = useCallback(
    (id: string) => {
      setReadIds((prev) => {
        if (prev.includes(id)) return prev;
        const next = [...prev, id];
        persist(key, next);
        return next;
      });
    },
    [key],
  );

  // 「全部已讀」前的快照，可供還原（undo）
  const [undoSnapshot, setUndoSnapshot] = useState<string[] | null>(null);

  const markAllRead = useCallback(() => {
    setReadIds((prev) => {
      setUndoSnapshot(prev);
      persist(key, activeIds);
      return [...activeIds];
    });
  }, [key, activeIds]);

  const undoMarkAllRead = useCallback(() => {
    setUndoSnapshot((snap) => {
      if (!snap) return null;
      persist(key, snap);
      setReadIds(snap);
      return null;
    });
  }, [key]);

  const resetRead = useCallback(() => {
    setReadIds([]);
    persist(key, []);
    setUndoSnapshot(null);
  }, [key]);

  const isRead = useCallback((id: string) => readIds.includes(id), [readIds]);

  return {
    readIds,
    isRead,
    markRead,
    markAllRead,
    undoMarkAllRead,
    canUndoMarkAllRead: undoSnapshot !== null,
    resetRead,
  };
}

