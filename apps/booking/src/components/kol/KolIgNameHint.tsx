import { Button } from "@lakeze/shared/components/ui/button";
import { groupKolNames, useKolIgRecords } from "@/hooks/useKolIgRecords";

type Props = {
  igHandle: string;
  currentName: string;
  excludeId: string | null;
  onApply: (name: string) => void;
};

/** 輸入 IG 時即時帶出「此 IG 已登記的 KOL 名稱」，一鍵套用 */
export const KolIgNameHint = ({ igHandle, currentName, excludeId, onApply }: Props) => {
  const { records } = useKolIgRecords(igHandle, excludeId);
  const names = groupKolNames(records);
  if (names.length === 0) return null;
  const current = currentName.trim();
  const allSame = names.length === 1 && names[0].name === current;

  if (allSame) {
    return (
      <div className="mt-1 text-xs text-emerald-700" data-testid="kol-ig-name-hint-ok">
        ✓ 名稱與此 IG 既有的 {names[0].count} 筆紀錄一致
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-md border border-sky-300 bg-sky-50 p-2 text-xs text-sky-900 space-y-1.5" data-testid="kol-ig-name-hint">
      <div className="font-medium">此 IG 已登記的 KOL 名稱：</div>
      {names.map((n) => (
        <div key={n.name} className="flex flex-wrap items-center gap-2">
          <span>
            「{n.name}」（{n.count} 筆）
          </span>
          {n.name === current ? (
            <span className="text-emerald-700">目前使用中</span>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs"
              onClick={() => onApply(n.name)}
              data-testid={`kol-ig-name-apply-${n.name}`}
            >
              套用這個名稱
            </Button>
          )}
        </div>
      ))}
      {names.length > 1 && (
        <div className="text-amber-700">同一個 IG 有多種寫法，請統一成同一個名稱；若無法修改舊紀錄，請通知星探主管。</div>
      )}
    </div>
  );
};
