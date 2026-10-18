import { useState } from "react";
import { PackageForm } from "./PackageForm";
import type { SavePackageResult } from "@/lib/onboarding/wizardApi";
import type { useWizardData } from "@/hooks/use-wizard-data";

type Data = ReturnType<typeof useWizardData>;

/** 方案步驟：儲存後顯示自動建立的專案與房型是否一致 */
export function PackageStep({ accommodationId, data, single }: { accommodationId: string; data: Data; single: boolean }) {
  const [last, setLast] = useState<SavePackageResult | null>(null);
  const fixed = single ? data.roomTypes[0] : undefined;
  if (data.roomTypes.length === 0) return <p className="text-sm text-muted-foreground">請先建立房型。</p>;
  const tplOf = (pkgId: string) => data.templates.find((t) => t.default_package_id === pkgId);
  const rtName = (id: string | null) => data.roomTypes.find((r) => r.id === id)?.name ?? "（無）";
  const onSaved = (r: SavePackageResult) => { setLast(r); void data.reload(); };

  return (
    <div className="space-y-4" data-testid="package-step">
      {last && (
        <div className={`rounded-md border px-4 py-3 text-sm ${last.room_type_matches ? "border-primary/40 bg-primary/5" : "border-destructive/40 bg-destructive/5"}`} data-testid="package-auto-template-msg">
          {last.template_id
            ? `已自動建立專案：${last.template_name}（房型 ${last.room_type_name ?? "未設定"}）`
            : "沒有找到自動建立的專案，請聯絡總部"}
          {last.template_id && (last.room_type_matches
            ? "，專案房型 = 方案主房型。"
            : `，但專案房型與方案主房型「${last.primary_room_type_name}」不一致，請聯絡總部。`)}
        </div>
      )}
      {data.packages.map((p) => {
        const tpl = tplOf(p.id);
        return (
          <div key={p.id} className="space-y-1">
            <p className="text-xs text-muted-foreground" data-testid={`package-template-${p.id}`}>
              專案：{tpl ? `${tpl.template_name}（房型 ${rtName(tpl.room_type_id)}）${tpl.room_type_id === p.primary_room_type_id ? "" : "⚠ 與主房型不一致"}` : "尚未建立"}
            </p>
            <PackageForm accommodationId={accommodationId} pkg={p} roomTypes={data.roomTypes} fixedRoomType={fixed} locked={data.locked} onSaved={onSaved} />
          </div>
        );
      })}
      {!data.locked && (!single || data.packages.length === 0) && (
        <PackageForm key={data.packages.length} accommodationId={accommodationId} roomTypes={data.roomTypes} fixedRoomType={fixed} locked={false} onSaved={onSaved} />
      )}
    </div>
  );
}
