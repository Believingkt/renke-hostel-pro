import { Switch } from "@lakeze/shared/components/ui/switch";
import { Label } from "@lakeze/shared/components/ui/label";
import { fmtMoney, fmtRate, type Rates } from "@/hooks/use-venue-bonus-flags";

const SAMPLE_REVENUE = 100_000;

/** 「不列入抽成類獎金」：白話說明＋以目前費率帶入的例子 */
export function VenueExcludeSetting({ value, onChange, canEdit, rates }: {
  value: boolean; onChange: (v: boolean) => void; canEdit: boolean; rates: Rates;
}) {
  const amRate = rates.am_performance?.rate ?? null;
  const closing = rates.venue_closing?.fixed_amount ?? null;
  return (
    <div className="space-y-3 rounded-md border bg-background p-3" data-testid="bonus-exclude-setting">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <Label htmlFor="bonus-exclude" className="text-sm font-medium">① 這間館的營收要不要算進抽成類獎金？</Label>
          <p className="text-xs text-muted-foreground">一般館別保持「列入」。只有像旅行日系列這種不由團隊經營營收的館別才需要打開。</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`text-xs font-medium ${value ? "text-amber-700" : "text-emerald-700"}`} data-testid="bonus-exclude-state">
            {value ? "不列入" : "列入（一般）"}
          </span>
          <Switch id="bonus-exclude" checked={value} disabled={!canEdit} data-testid="bonus-exclude-switch" onCheckedChange={onChange} />
        </div>
      </div>
      <div className="grid gap-2 text-xs sm:grid-cols-2">
        <div className="rounded bg-amber-50 p-2" data-testid="bonus-exclude-affects">
          <p className="mb-1 font-medium text-amber-800">打開後，這間館「不會」算進：</p>
          <ul className="list-disc space-y-0.5 pl-4 text-amber-900">
            <li>AM 績效獎金、AM 總管獎金</li>
            <li>成交組績效獎金、成交大師管理獎金</li>
            <li>網紅營銷專利獎金（抽成）</li>
            <li>場域成交獎金（這間館不發）</li>
          </ul>
        </div>
        <div className="rounded bg-muted p-2" data-testid="bonus-exclude-not-affects">
          <p className="mb-1 font-medium">不受這個開關影響（由 ② 決定）：</p>
          <ul className="list-disc space-y-0.5 pl-4">
            <li>AM 場域獎金（每館固定金額）</li>
            <li>網紅營銷專利獎金（月費，每館固定金額）</li>
          </ul>
        </div>
      </div>
      <p className="rounded border border-dashed p-2 text-xs" data-testid="bonus-exclude-example">
        <span className="font-medium">例子（用目前設定）：</span>假設這間館一個月營收 {fmtMoney(SAMPLE_REVENUE)}，AM 績效獎金費率 {fmtRate(amRate)}。
        「列入」時，負責 AM 的績效獎金會因這間館多 {amRate == null ? "（未設定）" : fmtMoney(SAMPLE_REVENUE * amRate)}；
        「不列入」時這 {fmtMoney(SAMPLE_REVENUE)} 完全不計，AM 績效、成交組等獎金都不會因此增加，場域成交獎金（每館 {fmtMoney(closing)}）也不發。
      </p>
    </div>
  );
}
