import { useCallback, useEffect, useState } from "react";

/**
 * 小鈴鐺通知偏好（每位使用者 × 角色各自獨立，存 localStorage）。
 * 設計成可擴充：未來新增通知事件類型時只要加入 kind，即可沿用同一組嚴重性門檻與靜音設定。
 */

export type Severity = "error" | "warn" | "info";

/** 嚴重性優先順序，數字越小越優先 */
export const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warn: 1, info: 2 };

/** 目前已註冊的通知事件類型（未來新增事件在此擴充） */
export const NOTIFICATION_KINDS = [
  { kind: "settings-gap", label: "設定缺口" },
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]["kind"];

export interface NotificationPrefs {
  /** 只顯示嚴重性等於或高於此門檻的通知 */
  minSeverity: Severity;
  /** 靜音的事件類型 */
  mutedKinds: string[];
  /** 只看自己有權限編輯的項目（隱藏唯讀提醒） */
  actionableOnly: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = {
  minSeverity: "warn",
  mutedKinds: [],
  actionableOnly: false,
};

function storageKey(userId: string, roleKey: string) {
  return `team:notif-prefs:${userId}:${roleKey}`;
}

function read(key: string): NotificationPrefs {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
    return {
      minSeverity: (parsed.minSeverity as Severity) ?? DEFAULT_PREFS.minSeverity,
      mutedKinds: Array.isArray(parsed.mutedKinds) ? parsed.mutedKinds : [],
      actionableOnly: !!parsed.actionableOnly,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

/** 判斷一則通知是否要顯示 */
export function passesPrefs(
  prefs: NotificationPrefs,
  input: { severity: Severity; kind: string; actionable: boolean },
): boolean {
  if (prefs.mutedKinds.includes(input.kind)) return false;
  if (SEVERITY_ORDER[input.severity] > SEVERITY_ORDER[prefs.minSeverity]) return false;
  if (prefs.actionableOnly && !input.actionable) return false;
  return true;
}

export function useNotificationPrefs(userId: string, roles: string[]) {
  const roleKey = [...roles].sort().join("|") || "none";
  const key = storageKey(userId, roleKey);
  const [prefs, setPrefs] = useState<NotificationPrefs>(() => read(key));

  useEffect(() => {
    setPrefs(read(key));
  }, [key]);

  const update = useCallback(
    (patch: Partial<NotificationPrefs>) => {
      setPrefs((prev) => {
        const next = { ...prev, ...patch };
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          /* 私密瀏覽模式忽略 */
        }
        return next;
      });
    },
    [key],
  );

  return { prefs, update };
}
