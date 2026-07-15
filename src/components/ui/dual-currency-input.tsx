import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { SecondaryCurrencyConfig } from "@/lib/currency";
import { formatTWD, formatSecondary } from "@/lib/currency";

interface DualCurrencyInputProps {
  /** 主幣別（TWD）數值；外部永遠以 TWD 為單位 */
  value: number;
  /** 變動時回傳 TWD 整數 */
  onChange: (twd: number) => void;
  /** 副幣別設定；null/undefined 時自動退化為純 TWD 輸入 */
  config?: SecondaryCurrencyConfig | null;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  placeholder?: string;
  /** 用於 localStorage 分群（例：accommodation id） */
  storageKey?: string;
  /** 隱藏底下換算說明（極小欄位場景） */
  hideHint?: boolean;
  id?: string;
  /** 模式改變時通知父層（用於把訂單顯示幣別寫入 DB） */
  onModeChange?: (mode: "TWD" | "SEC") => void;
  /** 外部強制指定當前模式（編輯既有訂單時用，例：訂單是 JPY 就強制 SEC） */
  forcedMode?: "TWD" | "SEC" | null;
  /**
   * 原幣模式：不做匯率換算。value 與 onChange 都以當前選擇的幣別「原值」為單位。
   * 用於旅行日民宿：訂單金額實際就以 JPY 或 TWD 存原數字，不需要換算。
   */
  rawMode?: boolean;
}

const LS_PREFIX = "lakeze-input-currency";

// 全域記憶：同一 storageKey 下，最近一次以副幣別輸入的 (SEC 原值, 換算後 TWD, 匯率)。
// 用於讓「原始金額」等衍生欄位顯示時，能還原使用者輸入的原始日幣值，避免 TWD → SEC 反算誤差。
const secondaryInputMemory = new Map<string, { secondary: string; twd: number; rate: number }>();

function readPref(key: string, hasSecondary: boolean): "TWD" | "SEC" {
  if (!hasSecondary) return "TWD";
  try {
    const v = localStorage.getItem(`${LS_PREFIX}:${key}`);
    if (v === "TWD" || v === "SEC") return v;
  } catch {}
  // 預設：有副幣別 → 預設用副幣別輸入（旅行日場景）
  return "SEC";
}

export function DualCurrencyInput({
  value,
  onChange,
  config,
  className,
  inputClassName,
  disabled,
  placeholder,
  storageKey = "default",
  hideHint,
  id,
  onModeChange,
  forcedMode,
  rawMode,
}: DualCurrencyInputProps) {
  const hasSecondary = !!(config && config.rate > 0);
  const [mode, setMode] = useState<"TWD" | "SEC">(() => forcedMode ?? readPref(storageKey, hasSecondary));
  const [draft, setDraft] = useState<string>("");
  const [focused, setFocused] = useState(false);
  const lastSecondaryInputRef = useRef<{ secondary: string; twd: number; rate: number } | null>(null);

  // 外部 forcedMode 變動時同步
  useEffect(() => {
    if (forcedMode && forcedMode !== mode) setMode(forcedMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forcedMode]);

  // value 變動且未聚焦時，同步顯示值
  useEffect(() => {
    if (focused) return;
    if (rawMode) {
      // 原幣模式：外部 value 就是當前幣別的原值，直接顯示
      setDraft(value > 0 ? String(value) : "");
      return;
    }
    if (mode === "TWD") {
      setDraft(value > 0 ? String(value) : "");
    } else if (hasSecondary && config) {
      const local = lastSecondaryInputRef.current;
      if (local && local.twd === value && local.rate === config.rate) {
        setDraft(local.secondary);
        return;
      }
      const shared = secondaryInputMemory.get(storageKey);
      if (shared && shared.twd === value && shared.rate === config.rate) {
        setDraft(shared.secondary);
        return;
      }
      const sec = Math.round(value * config.rate);
      setDraft(sec > 0 ? String(sec) : "");
    }
  }, [value, mode, hasSecondary, config, focused, storageKey, rawMode]);

  const handleChange = (raw: string) => {
    const cleaned = raw.replace(/[^\d]/g, "");
    setDraft(cleaned);
    const n = parseInt(cleaned, 10);
    if (!Number.isFinite(n) || n <= 0) {
      onChange(0);
      return;
    }
    if (rawMode) {
      // 原幣模式：不換算，回傳使用者輸入的原值
      onChange(n);
      return;
    }
    if (mode === "TWD" || !hasSecondary || !config) {
      lastSecondaryInputRef.current = null;
      onChange(n);
    } else {
      // SEC → TWD
      const twd = Math.round(n / config.rate);
      const entry = { secondary: cleaned, twd, rate: config.rate };
      lastSecondaryInputRef.current = entry;
      secondaryInputMemory.set(storageKey, entry);
      onChange(twd);
    }
  };


  const toggle = () => {
    if (!hasSecondary) return;
    const next = mode === "TWD" ? "SEC" : "TWD";
    setMode(next);
    try {
      localStorage.setItem(`${LS_PREFIX}:${storageKey}`, next);
    } catch {}
    onModeChange?.(next);
  };

  const hint = useMemo(() => {
    if (!hasSecondary || !config) return "";
    if (mode === "TWD") return `≈ ${formatSecondary(value, config)}`;
    return `≈ ${formatTWD(value)}`;
  }, [value, mode, hasSecondary, config]);

  const currencyLabel = mode === "TWD" ? "NT$" : config?.symbol || "";

  return (
    <div className={cn("flex flex-col items-stretch gap-0.5 w-full", className)}>
      {hasSecondary ? (
        <div className="flex w-full items-center rounded-lg border border-input bg-background shadow-sm ring-offset-background transition-all focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
          <Input
            id={id}
            type="text"
            inputMode="numeric"
            disabled={disabled}
            placeholder={placeholder}
            value={draft}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onChange={(e) => handleChange(e.target.value)}
            className={cn(
              "min-w-0 flex-1 border-0 bg-transparent pr-2 text-right shadow-none ring-offset-0 tabular-nums focus-visible:ring-0 focus-visible:ring-offset-0",
              inputClassName,
            )}
          />
          <button
            type="button"
            onClick={toggle}
            disabled={disabled}
            className="mr-1.5 shrink-0 rounded border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted/70 disabled:cursor-not-allowed disabled:opacity-50"
            tabIndex={-1}
            title="切換輸入幣別"
          >
            {currencyLabel}
          </button>
        </div>
      ) : (
        <Input
          id={id}
          type="text"
          inputMode="numeric"
          disabled={disabled}
          placeholder={placeholder}
          value={draft}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => handleChange(e.target.value)}
          className={cn("w-full text-right tabular-nums", inputClassName)}
        />
      )}
      {!hideHint && hint && (
        <span className="text-[10px] text-muted-foreground leading-none text-right">{hint}</span>
      )}
    </div>
  );
}
