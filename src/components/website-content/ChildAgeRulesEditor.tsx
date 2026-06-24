import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  type ChildAgeRules,
  type ChildTier,
  type ChildTierKey,
  TIER_ORDER,
  DEFAULT_CHILD_AGE_RULES,
  parseChildAgeRules,
} from "@/lib/child-rules";

interface Props {
  value: ChildAgeRules | null | undefined;
  onChange: (next: ChildAgeRules) => void;
  /** 顯示頂層說明（民宿層級為 true，方案覆寫層級為 false） */
  showNote?: boolean;
  /** 顯示「使用民宿預設規則」開關（方案層使用） */
  overrideToggle?: {
    enabled: boolean;
    onToggle: (enabled: boolean) => void;
    defaultRulesPreview: ChildAgeRules;
  };
}

const TIER_DESC: Record<ChildTierKey, string> = {
  infant: "嬰兒（通常不佔床、免費）",
  toddler: "幼兒",
  child: "兒童",
};

const ChildAgeRulesEditor = ({
  value,
  onChange,
  showNote = true,
  overrideToggle,
}: Props) => {
  const rules = useMemo(
    () => parseChildAgeRules(value ?? DEFAULT_CHILD_AGE_RULES),
    [value],
  );

  const update = (key: ChildTierKey, patch: Partial<ChildTier>) => {
    onChange({
      ...rules,
      tiers: { ...rules.tiers, [key]: { ...rules.tiers[key], ...patch } },
    });
  };

  const editing = overrideToggle ? overrideToggle.enabled : true;
  const displayRules = editing ? rules : overrideToggle!.defaultRulesPreview;

  return (
    <div className="space-y-3">
      {overrideToggle && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border/50">
          <div className="space-y-0.5 text-sm">
            <div className="font-medium">覆寫民宿預設規則</div>
            <div className="text-xs text-muted-foreground">
              關閉時沿用民宿層的兒童分齡設定；開啟後此方案使用獨立規則。
            </div>
          </div>
          <Switch
            checked={overrideToggle.enabled}
            onCheckedChange={overrideToggle.onToggle}
          />
        </div>
      )}

      <div className="grid gap-2">
        {TIER_ORDER.map((key) => {
          const t = displayRules.tiers[key];
          const disabled = !editing;
          return (
            <Card
              key={key}
              className={`p-3 ${disabled ? "opacity-60" : ""}`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Input
                    value={t.label}
                    onChange={(e) => update(key, { label: e.target.value })}
                    className="h-8 w-24 text-sm font-medium"
                    disabled={disabled}
                  />
                  <span className="text-xs text-muted-foreground">
                    {TIER_DESC[key]}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">接受訂房</Label>
                  <Switch
                    checked={t.allowed}
                    onCheckedChange={(allowed) => update(key, { allowed })}
                    disabled={disabled}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">最小年齡</Label>
                  <Input
                    type="number"
                    min={0}
                    max={17}
                    value={t.min_age}
                    onChange={(e) =>
                      update(key, { min_age: Math.max(0, parseInt(e.target.value || "0", 10)) })
                    }
                    className="h-9 text-sm"
                    disabled={disabled}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">最大年齡</Label>
                  <Input
                    type="number"
                    min={0}
                    max={17}
                    value={t.max_age}
                    onChange={(e) =>
                      update(key, { max_age: Math.max(0, parseInt(e.target.value || "0", 10)) })
                    }
                    className="h-9 text-sm"
                    disabled={disabled}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">每晚加價 NT$</Label>
                  <Input
                    type="number"
                    min={0}
                    step={50}
                    value={t.fee_per_night}
                    onChange={(e) =>
                      update(key, {
                        fee_per_night: Math.max(0, parseInt(e.target.value || "0", 10)),
                      })
                    }
                    className="h-9 text-sm"
                    disabled={disabled}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">
                    人數上限（空白=不限）
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="不限"
                    value={t.max_count ?? ""}
                    onChange={(e) =>
                      update(key, {
                        max_count: e.target.value === "" ? null : Math.max(0, parseInt(e.target.value, 10)),
                      })
                    }
                    className="h-9 text-sm"
                    disabled={disabled}
                  />
                </div>
              </div>

              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">
                    超過上限每位每晚加價 NT$（0 = 嚴格不可超過）
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    step={50}
                    placeholder="0"
                    value={t.over_limit_fee_per_night ?? 0}
                    onChange={(e) =>
                      update(key, {
                        over_limit_fee_per_night: Math.max(
                          0,
                          parseInt(e.target.value || "0", 10),
                        ),
                      })
                    }
                    className="h-9 text-sm"
                    disabled={disabled || t.max_count === null}
                  />
                  {t.max_count === null && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      未設定人數上限時不適用
                    </p>
                  )}
                </div>
              </div>


              <div className="mt-2 flex items-center gap-2">
                <Switch
                  id={`cap-${key}`}
                  checked={t.counts_toward_capacity}
                  onCheckedChange={(counts_toward_capacity) =>
                    update(key, { counts_toward_capacity })
                  }
                  disabled={disabled}
                />
                <Label
                  htmlFor={`cap-${key}`}
                  className="text-xs text-muted-foreground cursor-pointer"
                >
                  計入房型容量（嬰兒一般不計）
                </Label>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className={`p-3 ${!editing ? "opacity-60" : ""}`}>
        <Label className="text-xs text-muted-foreground">
          兒童加大人合計上限（空白 = 不限）
        </Label>
        <Input
          type="number"
          min={0}
          placeholder="不限"
          value={displayRules.max_total_guests ?? ""}
          onChange={(e) =>
            onChange({
              ...rules,
              max_total_guests:
                e.target.value === "" ? null : Math.max(0, parseInt(e.target.value, 10)),
            })
          }
          className="h-9 text-sm mt-1 max-w-[200px]"
          disabled={!editing}
        />
        <p className="text-[11px] text-muted-foreground mt-1.5">
          成人 + 計入容量的兒童總人數超過此值時，將無法入住/訂房並顯示警告
        </p>
      </Card>


      {showNote && (
        <div>
          <Label className="text-xs text-muted-foreground">備註（顯示於訂房頁）</Label>
          <Textarea
            value={rules.note}
            onChange={(e) => onChange({ ...rules, note: e.target.value })}
            placeholder="例如：12 歲以上以成人計，需另加成人床位費"
            rows={2}
            className="text-sm"
            disabled={!editing}
          />
        </div>
      )}
    </div>
  );
};

export default ChildAgeRulesEditor;
