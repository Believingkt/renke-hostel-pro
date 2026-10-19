import { BedDouble, Check, Home } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type Flow = "single" | "multi";

const OPTIONS: { flow: Flow; icon: LucideIcon; title: string; desc: string; fit: string }[] = [
  { flow: "single", icon: Home, title: "單棟包棟", desc: "整棟一起賣：建立 1 個房型（房間數固定 1），自動帶一個包棟方案。", fit: "適合：整棟出租的民宿、獨棟 villa、一次只接一組客人" },
  { flow: "multi", icon: BedDouble, title: "多房型", desc: "分房販售：可以建立多個房型，每個房型各自設定房間數與方案。", fit: "適合：有雙人房、四人房等多種房間，同時接多組客人" },
];

/** 民宿類型大卡片 */
export function FlowChooser({ value, onChoose }: { value: Flow | null; onChoose: (f: Flow) => void }) {
  return (
    <div className="space-y-4" data-testid="wizard-flow-chooser">
      <div>
        <h2 className="text-lg font-semibold">請選擇民宿類型</h2>
        <p className="text-sm text-muted-foreground">選好後會依類型帶入對應的步驟，之後仍可在一般 PMS 頁面調整。</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {OPTIONS.map(({ flow, icon: Icon, title, desc, fit }) => {
          const selected = value === flow;
          return (
            <button
              key={flow}
              type="button"
              onClick={() => onChoose(flow)}
              aria-pressed={selected}
              className={`relative flex flex-col gap-4 rounded-xl border-2 bg-card p-6 text-left transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-8 ${selected ? "border-primary bg-primary/5" : "border-border"}`}
              data-testid={`wizard-flow-${flow}`}
            >
              {selected && <span className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="h-4 w-4" /></span>}
              <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-6 w-6" /></span>
              <span className="text-lg font-semibold">{title}</span>
              <span className="text-sm leading-relaxed">{desc}</span>
              <span className="rounded-md bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">{fit}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
