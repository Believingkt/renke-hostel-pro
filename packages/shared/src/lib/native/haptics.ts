/**
 * 原生觸覺回饋（Haptics）。
 * 僅在 Capacitor 原生 App 生效；瀏覽器版一律 no-op，行為完全不變。
 */

import { isNativeApp } from "@lakeze/shared/lib/appMode";

type HapticsModule = typeof import("@capacitor/haptics");

let modulePromise: Promise<HapticsModule | null> | null = null;

async function loadHaptics(): Promise<HapticsModule | null> {
  if (!isNativeApp()) return null;
  if (!modulePromise) {
    modulePromise = import("@capacitor/haptics").catch(() => null);
  }
  return modulePromise;
}

/** 選取／切換：Tab 切換、開關（selectionChanged） */
export async function hapticSelection(): Promise<void> {
  const mod = await loadHaptics();
  if (!mod) return;
  try {
    await mod.Haptics.selectionStart();
    await mod.Haptics.selectionChanged();
    await mod.Haptics.selectionEnd();
  } catch {
    /* ignore */
  }
}

/** 成功：訂房成功、付款成功 */
export async function hapticSuccess(): Promise<void> {
  const mod = await loadHaptics();
  if (!mod) return;
  try {
    await mod.Haptics.notification({ type: mod.NotificationType.Success });
  } catch {
    /* ignore */
  }
}

/** 錯誤：付款失敗、表單錯誤 */
export async function hapticError(): Promise<void> {
  const mod = await loadHaptics();
  if (!mod) return;
  try {
    await mod.Haptics.notification({ type: mod.NotificationType.Error });
  } catch {
    /* ignore */
  }
}

/** 警告（可選） */
export async function hapticWarning(): Promise<void> {
  const mod = await loadHaptics();
  if (!mod) return;
  try {
    await mod.Haptics.notification({ type: mod.NotificationType.Warning });
  } catch {
    /* ignore */
  }
}
