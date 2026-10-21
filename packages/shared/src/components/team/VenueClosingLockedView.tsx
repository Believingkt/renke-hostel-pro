import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Plus, UserCog } from "lucide-react";
import { Badge } from "@lakeze/shared/components/ui/badge";
import { Button } from "@lakeze/shared/components/ui/button";
import { Switch } from "@lakeze/shared/components/ui/switch";
import { Label } from "@lakeze/shared/components/ui/label";

type Period = {
  id: string;
  start_date: string;
  end_date: string | null;
  bonus_policy: string;
  counts_closer_commission?: boolean | null;
  counts_team_bonus?: boolean | null;
  note: string | null;
};
type Assignment = { id: string; member_id: string; effective_from: string };
type Flag = "counts_closer_commission" | "counts_team_bonus";

interface Props {
  accId: string;
  partnershipStartDate: string | null;
  periods: Period[];
  curPeriod: Period | null | undefined;
  upcoming: Period | undefined;
  history: Assignment[];
  cur: Assignment | null | undefined;
  today: string;
  memberName: (id: string) => string;
  readOnly?: boolean;
  onAddPeriod: () => void;
  onEndPeriod: (p: Period) => void;
  onEditCloser: () => void;
  onFlag: (p: Period, field: Flag, on: boolean) => void;
}

function statusBadge({ periods, curPeriod, upcoming }: Pick<Props, "periods" | "curPeriod" | "upcoming">) {
  if (curPeriod && curPeriod.bonus_policy === "full") return <Badge>{periods.length > 1 ? "已重啟" : "合作中"}</Badge>;
  if (curPeriod) return <Badge variant="secondary">合作中（不採計）</Badge>;
  if (upcoming) return <Badge variant="secondary">待生效</Badge>;
  if (periods.length > 0) return <Badge variant="outline">暫停中</Badge>;
  return <Badge variant="destructive">未設定合作期間</Badge>;
}

function Block({ title, actions, children, testId }: { title: string; actions?: ReactNode; children: ReactNode; testId: string }) {
  return (
    <div className="space-y-3 rounded-lg border p-4" data-testid={testId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">{title}</h4>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

function FlagRow({ id, label, hint, on, disabled, onChange }: { id: string; label: string; hint: string; on: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md bg-muted/40 px-3 py-2">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm">{label}</Label>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-xs text-muted-foreground" data-testid={`${id}-state`}>{on ? "採計" : "不採計"}</span>
        <Switch id={id} checked={on} disabled={disabled} onCheckedChange={onChange} data-testid={id} />
      </div>
    </div>
  );
}

/** 單館頁用：合作期間與採計（上）＋場域簽約人（下），不用多館表格 */
export function VenueClosingLockedView(p: Props) {
  const [showHistory, setShowHistory] = useState(false);
  const { curPeriod } = p;
  return (
    <div className="space-y-4" data-testid="venue-closing-locked-view">
      <Block
        title="合作期間與採計"
        testId="venue-closing-period-block"
        actions={!p.readOnly && (
          <>
            <Button size="sm" variant="outline" onClick={p.onAddPeriod} data-testid="venue-closing-add-period-btn"><Plus className="mr-1 h-4 w-4" />合作期間</Button>
            {curPeriod && !curPeriod.end_date && (
              <Button size="sm" variant="ghost" onClick={() => p.onEndPeriod(curPeriod)} data-testid="venue-closing-end-period-btn">結束合作</Button>
            )}
          </>
        )}
      >
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {statusBadge(p)}
          <span data-testid="venue-closing-period-range">
            {curPeriod ? `${curPeriod.start_date} ~ ${curPeriod.end_date ?? "迄今"}` : p.upcoming ? `${p.upcoming.start_date} 起（待生效）` : "尚無有效合作期間"}
          </span>
          <span className="text-xs text-muted-foreground">獎金採計起始日：{p.partnershipStartDate ?? "—"}</span>
        </div>
        {curPeriod ? (
          <div className="space-y-2">
            <FlagRow
              id="venue-closing-flag-closer"
              label="採計成交大師獎金"
              hint="這段期間的訂單要不要計入成交組分潤（成交大師獎金）。"
              on={curPeriod.counts_closer_commission !== false}
              disabled={!!p.readOnly}
              onChange={(v) => p.onFlag(curPeriod, "counts_closer_commission", v)}
            />
            <FlagRow
              id="venue-closing-flag-team"
              label="採計團隊獎金"
              hint="關閉＝這段期間營收完全不計入 AM／成交組／網紅營銷等以館別營收為基準的獎金。"
              on={curPeriod.counts_team_bonus !== false}
              disabled={!!p.readOnly}
              onChange={(v) => p.onFlag(curPeriod, "counts_team_bonus", v)}
            />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">沒有生效中的合作期間時，本館不計入任何團隊獎金；新增合作期間後才能設定採計開關。</p>
        )}
      </Block>

      <Block
        title="場域簽約人"
        testId="venue-closing-closer-block"
        actions={!p.readOnly && (
          <Button size="sm" variant="outline" onClick={p.onEditCloser} data-testid="venue-closing-edit-closer-btn"><UserCog className="mr-1 h-4 w-4" />修改簽約人</Button>
        )}
      >
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
          <span>目前簽約人：<span className="font-medium" data-testid="venue-closing-current-closer">{p.cur ? p.memberName(p.cur.member_id) : "尚無"}</span></span>
          <span className="text-muted-foreground">指派日：{p.cur?.effective_from ?? "—"}</span>
        </div>
        <p className="text-xs text-muted-foreground">場域成交獎金以這位簽約人為發放對象（另需本館「收取行銷推廣費」）。</p>
      </Block>

      <div>
        <Button variant="ghost" size="sm" className="px-1" onClick={() => setShowHistory((v) => !v)} data-testid="venue-closing-history-toggle">
          {showHistory ? <ChevronDown className="mr-1 h-4 w-4" /> : <ChevronRight className="mr-1 h-4 w-4" />}
          版本紀錄（合作期間 {p.periods.length} 筆、簽約人 {p.history.length} 筆）
        </Button>
        {showHistory && (
          <div className="mt-2 grid gap-4 rounded-md bg-muted/30 p-3 text-sm md:grid-cols-2" data-testid="venue-closing-history">
            <div>
              <div className="mb-1 font-medium">合作期間</div>
              {p.periods.length === 0 ? <p className="text-muted-foreground">尚無合作期間</p> : (
                <ul className="space-y-1">
                  {p.periods.map((x) => (
                    <li key={x.id} className="flex flex-wrap items-center gap-2">
                      <span>{x.start_date} ~ {x.end_date ?? "迄今"}</span>
                      <Badge variant={x.bonus_policy === "none" ? "secondary" : "outline"}>{x.bonus_policy === "none" ? "不採計獎金" : "採計"}</Badge>
                      {x.note && <span className="text-muted-foreground">{x.note}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <div className="mb-1 font-medium">簽約人</div>
              {p.history.length === 0 ? <p className="text-muted-foreground">尚無歷史版本</p> : (
                <ul className="space-y-1">
                  {p.history.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-2">
                      <span>{r.effective_from}</span>
                      <span>{p.memberName(r.member_id)}</span>
                      {p.cur?.id === r.id ? <Badge>目前生效</Badge> : r.effective_from > p.today ? <Badge variant="outline">未來生效</Badge> : <Badge variant="secondary">歷史</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
