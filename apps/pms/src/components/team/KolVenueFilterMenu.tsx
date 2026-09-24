import { useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@lakeze/shared/components/ui/button";
import { Checkbox } from "@lakeze/shared/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@lakeze/shared/components/ui/popover";
import { cn } from "@lakeze/shared/lib/utils";

export interface KolVenueFilterOption {
  value: string;
  label: string;
  source: "pms" | "venue" | string;
  badge?: string | null;
}

interface Props {
  options: KolVenueFilterOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  triggerClassName?: string;
}

/** 由館別名稱推導群組前綴（例如「旅行日-光」→「旅行日」） */
function prefixOf(label: string): string | null {
  const m = label.split(/[-－—·・]/)[0]?.trim();
  if (!m || m.length < 2 || m === label.trim()) return null;
  return m;
}

export function KolVenueFilterMenu({ options, selected, onChange, triggerClassName }: Props) {
  const pms = options.filter((o) => o.source === "pms");
  const external = options.filter((o) => o.source !== "pms");

  const groups = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const o of options) {
      const p = prefixOf(o.label);
      if (!p) continue;
      map.set(p, [...(map.get(p) ?? []), o.value]);
    }
    return Array.from(map.entries())
      .filter(([, vals]) => vals.length >= 2)
      .sort((a, b) => b[1].length - a[1].length);
  }, [options]);

  const allSelected = options.length > 0 && selected.length === options.length;
  const setOnly = (vals: string[]) => onChange(vals);
  const isExactly = (vals: string[]) =>
    vals.length > 0 && vals.length === selected.length && vals.every((v) => selected.includes(v));

  const renderSection = (title: string, list: KolVenueFilterOption[]) => {
    if (list.length === 0) return null;
    const vals = list.map((o) => o.value);
    return (
      <div>
        <div className="flex items-center justify-between bg-muted/60 px-3 py-1 text-[11px] font-medium text-muted-foreground">
          <span>
            {title}（{list.length}）
          </span>
          <button type="button" className="text-primary hover:underline" onClick={() => setOnly(vals)}>
            只看這類
          </button>
        </div>
        {list.map((opt) => {
          const checked = selected.includes(opt.value);
          return (
            <label
              key={opt.value}
              className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent cursor-pointer"
            >
              <Checkbox
                checked={checked}
                onCheckedChange={(v) =>
                  onChange(v ? [...selected, opt.value] : selected.filter((x) => x !== opt.value))
                }
              />
              <span className="flex-1 truncate">{opt.label}</span>
              <span className="text-[10px] text-muted-foreground">{opt.badge}</span>
            </label>
          );
        })}
      </div>
    );
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("justify-between font-normal", triggerClassName)}>
          <span className="truncate">
            {allSelected ? `全部館別（${options.length}）` : `已選 ${selected.length} 個館別`}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="flex items-center justify-between border-b px-3 py-2 text-xs">
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => onChange(options.map((o) => o.value))}
          >
            全選
          </button>
          <button type="button" className="text-muted-foreground hover:underline" onClick={() => onChange([])}>
            全清
          </button>
        </div>

        {(groups.length > 0 || external.length > 0) && (
          <div className="flex flex-wrap gap-1 border-b px-3 py-2">
            <button
              type="button"
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] hover:bg-accent",
                isExactly(pms.map((o) => o.value)) && "border-primary bg-primary/10 text-primary",
              )}
              onClick={() => setOnly(pms.map((o) => o.value))}
            >
              PMS 母館
            </button>
            {external.length > 0 && (
              <button
                type="button"
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[11px] hover:bg-accent",
                  isExactly(external.map((o) => o.value)) && "border-primary bg-primary/10 text-primary",
                )}
                onClick={() => setOnly(external.map((o) => o.value))}
              >
                外部合作場域
              </button>
            )}
            {groups.map(([name, vals]) => (
              <button
                key={name}
                type="button"
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[11px] hover:bg-accent",
                  isExactly(vals) && "border-primary bg-primary/10 text-primary",
                )}
                onClick={() => setOnly(vals)}
              >
                {name}
              </button>
            ))}
          </div>
        )}

        <div className="max-h-72 overflow-y-auto py-1">
          {renderSection("PMS 母館", pms)}
          {renderSection("外部合作場域", external)}
        </div>
      </PopoverContent>
    </Popover>
  );
}
