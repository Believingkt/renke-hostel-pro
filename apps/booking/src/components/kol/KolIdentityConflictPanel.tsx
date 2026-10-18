import { Button } from "@lakeze/shared/components/ui/button";
import { groupKolNames, useKolIgRecords } from "@/hooks/useKolIgRecords";

type Props = {
  igHandle: string;
  currentName: string;
  excludeId: string | null;
  onUseName: (name: string) => void;
  onFixIg: () => void;
};

/** 擋下視窗：列出同 IG 的既有紀錄，並給「是同一人／IG 貼錯」兩個選擇 */
export const KolIdentityConflictPanel = ({ igHandle, currentName, excludeId, onUseName, onFixIg }: Props) => {
  const { records, loading } = useKolIgRecords(igHandle, excludeId);
  const current = currentName.trim();
  const otherNames = groupKolNames(records).filter((n) => n.name !== current);

  if (loading && records.length === 0) {
    return <div className="mt-2 text-xs text-muted-foreground">正在查詢同 IG 的既有紀錄…</div>;
  }
  if (records.length === 0) return null;

  return (
    <div className="mt-2 space-y-2 text-xs" data-testid="kol-identity-conflict-panel">
      <div className="font-medium text-foreground">這個 IG 已經有以下邀約紀錄：</div>
      <div className="overflow-x-auto rounded border">
        <table className="w-full text-left">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-2 py-1">KOL 名稱</th>
              <th className="px-2 py-1">館別</th>
              <th className="px-2 py-1">填寫人</th>
              <th className="px-2 py-1">邀約日</th>
              <th className="px-2 py-1">折扣碼</th>
              <th className="px-2 py-1">狀態</th>
            </tr>
          </thead>
          <tbody>
            {records.slice(0, 10).map((r) => (
              <tr key={r.id} className="border-t" data-testid={`kol-conflict-row-${r.id}`}>
                <td className="px-2 py-1 font-medium">
                  {r.name ?? "-"}
                  {r.primary_profile_id && <span className="ml-1 text-muted-foreground">（附屬）</span>}
                </td>
                <td className="px-2 py-1">{r.venue_name ?? "-"}</td>
                <td className="px-2 py-1">{r.scout_name ?? "-"}</td>
                <td className="px-2 py-1">{r.invited_at ?? "-"}</td>
                <td className="px-2 py-1">{r.cid_code ?? "-"}</td>
                <td className="px-2 py-1">{r.booking_status ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {records.length > 10 && <div className="text-muted-foreground">另有 {records.length - 10} 筆未列出</div>}
      <div className="rounded-md border bg-background p-2 space-y-2">
        <div className="font-medium text-foreground">請選一個：</div>
        {otherNames.map((n) => (
          <Button
            key={n.name}
            type="button"
            size="sm"
            className="h-auto w-full justify-start whitespace-normal py-1.5 text-left text-xs"
            onClick={() => onUseName(n.name)}
            data-testid={`kol-conflict-use-name-${n.name}`}
          >
            是同一人 → 改用既有名稱「{n.name}」
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-auto w-full justify-start whitespace-normal py-1.5 text-left text-xs"
          onClick={onFixIg}
          data-testid="kol-conflict-fix-ig"
        >
          不是同一人 → IG 連結貼錯，回去修改 IG
        </Button>
      </div>
    </div>
  );
};
