import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Copy, Plus, Trash2 } from "lucide-react";
import VenueTierRulePreview from "./VenueTierRulePreview";
import VenueTierRuleAuditLog from "./VenueTierRuleAuditLog";

/* ------------------------------ 型別與常數 ------------------------------ */

export interface BonusTier {
  min_revenue: number;
  rate: number;
}

interface TierRuleRow {
  id: string;
  accommodation_id: string;
  bonus_type: string;
  effective_from: string;
  tiers: BonusTier[];
  note: string | null;
  created_at: string;
}

interface AccOption {
  id: string;
  name: string;
}

const BONUS_TYPES = [
  { value: "am_performance", label: "AM 績效獎金" },
  { value: "am_manager", label: "AM 總管獎金" },
  { value: "closer_performance", label: "成交大師績效獎金" },
] as const;

const bonusLabel = (v: string) => BONUS_TYPES.find((b) => b.value === v)?.label ?? v;

const twMoney = (n: number) =>
  `NT$ ${Math.round(n).toLocaleString("zh-TW", { maximumFractionDigits: 0 })}`;

const pct = (r: number) => `${(r * 100).toFixed(2).replace(/\.?0+$/, "")}%`;

/** effective_from 對齊資料月：落在資料月 1 日之後 → 該資料月仍用舊制 */
function payoutPeriodHint(effectiveFrom: string): string {
  const [y, m, d] = effectiveFrom.slice(0, 10).split("-").map(Number);
  // 生效日所在資料月（若不是 1 日則順延到下個資料月）
  let dataY = y;
  let dataM = m;
  if (d > 1) {
    dataM = m === 12 ? 1 : m + 1;
    dataY = m === 12 ? y + 1 : y;
  }
  // 發放期＝資料月次月 10 日
  const payM = dataM === 12 ? 1 : dataM + 1;
  const payY = dataM === 12 ? dataY + 1 : dataY;
  return `${dataY}/${String(dataM).padStart(2, "0")} 資料月 → 預計自 ${payY}/${String(payM).padStart(2, "0")}/10 期開始正式取用`;
}

function todayTaipei(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** 依生效日挑出目前生效版本（同館別＋同獎金類型） */
function currentVersionId(rows: TierRuleRow[]): string | null {
  const today = todayTaipei();
  const eligible = rows.filter((r) => r.effective_from <= today);
  if (eligible.length === 0) return null;
  return eligible.reduce((best, r) =>
    r.effective_from > best.effective_from ||
    (r.effective_from === best.effective_from && r.created_at > best.created_at)
      ? r
      : best,
  ).id;
}

/* ------------------------------ 主元件 ------------------------------ */

export default function VenueBonusTierRulesTab({ readOnly = false }: { readOnly?: boolean }) {
  const { toast } = useToast();
  const [accs, setAccs] = useState<AccOption[]>([]);
  const [rules, setRules] = useState<TierRuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAcc, setSelectedAcc] = useState<string | null>(null);
  const [selectedBonus, setSelectedBonus] = useState<string>("am_performance");
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);

  // 編輯 Dialog 狀態
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formAcc, setFormAcc] = useState<string>("");
  const [formBonus, setFormBonus] = useState<string>("am_performance");
  const [formDate, setFormDate] = useState<string>(todayTaipei());
  const [formNote, setFormNote] = useState<string>("");
  const [formTiers, setFormTiers] = useState<Array<{ min: string; rate: string }>>([
    { min: "0", rate: "0" },
  ]);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [accRes, ruleRes] = await Promise.all([
      supabase.from("accommodation_info").select("id, name").order("name"),
      supabase
        .from("venue_team_bonus_tier_rules")
        .select("id, accommodation_id, bonus_type, effective_from, tiers, note, created_at")
        .order("effective_from", { ascending: false }),
    ]);
    setAccs(((accRes.data ?? []) as AccOption[]).filter((a) => a.id && a.name));
    setRules(
      ((ruleRes.data ?? []) as any[]).map((r) => ({
        ...r,
        tiers: Array.isArray(r.tiers) ? (r.tiers as BonusTier[]) : [],
      })),
    );
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  /** 館別總覽：哪些館有獨立規則 */
  const overview = useMemo(() => {
    return accs.map((a) => {
      const own = rules.filter((r) => r.accommodation_id === a.id);
      const types = Array.from(new Set(own.map((r) => r.bonus_type)));
      return { acc: a, hasRule: own.length > 0, types, versionCount: own.length };
    });
  }, [accs, rules]);

  const venueRules = useMemo(
    () =>
      rules
        .filter((r) => r.accommodation_id === selectedAcc && r.bonus_type === selectedBonus)
        .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1)),
    [rules, selectedAcc, selectedBonus],
  );

  const currentId = useMemo(() => currentVersionId(venueRules), [venueRules]);
  const shownVersion = useMemo(
    () => venueRules.find((r) => r.id === activeVersionId) ?? venueRules.find((r) => r.id === currentId) ?? venueRules[0] ?? null,
    [venueRules, activeVersionId, currentId],
  );

  useEffect(() => {
    setActiveVersionId(null);
  }, [selectedAcc, selectedBonus]);

  /* ------------------------------ 表單操作 ------------------------------ */

  const openCreate = (accId?: string, bonusType?: string) => {
    setFormAcc(accId ?? selectedAcc ?? "");
    setFormBonus(bonusType ?? selectedBonus);
    setFormDate(todayTaipei());
    setFormNote("");
    setFormTiers([{ min: "0", rate: "0" }]);
    setDialogOpen(true);
  };

  const openCopyFrom = (row: TierRuleRow) => {
    setFormAcc("");
    setFormBonus(row.bonus_type);
    setFormDate(todayTaipei());
    setFormNote(`複製自 ${accs.find((a) => a.id === row.accommodation_id)?.name ?? ""}（${row.effective_from}）`);
    setFormTiers(
      row.tiers.map((t) => ({ min: String(t.min_revenue), rate: String(t.rate * 100) })),
    );
    setDialogOpen(true);
  };

  const save = async () => {
    if (!formAcc) {
      toast({ title: "請選擇館別", variant: "destructive" });
      return;
    }
    const tiers: BonusTier[] = formTiers
      .map((t) => ({ min_revenue: Number(t.min), rate: Number(t.rate) / 100 }))
      .filter((t) => Number.isFinite(t.min_revenue) && Number.isFinite(t.rate))
      .sort((a, b) => a.min_revenue - b.min_revenue);
    if (tiers.length === 0) {
      toast({ title: "請至少填一個級距", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("venue_team_bonus_tier_rules").insert({
      accommodation_id: formAcc,
      bonus_type: formBonus,
      effective_from: formDate,
      tiers: tiers as any,
      note: formNote || null,
      created_by: userData?.user?.id ?? null,
    });
    setSaving(false);
    if (error) {
      toast({ title: "儲存失敗", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "已新增版本", description: payoutPeriodHint(formDate) });
    setDialogOpen(false);
    setSelectedAcc(formAcc);
    setSelectedBonus(formBonus);
    await load();
  };

  const removeVersion = async (id: string) => {
    const { error } = await supabase.from("venue_team_bonus_tier_rules").delete().eq("id", id);
    if (error) {
      toast({ title: "刪除失敗", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "已刪除版本" });
    await load();
  };

  if (loading) return null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>館別獎金級距規則（總部集中管理）</CardTitle>
          <CardDescription>
            這裡設定的是「館別專屬階層級距」：有設定的館別，AM 績效／AM 總管／成交大師績效改以
            該館營收落在哪一階，整筆套用該階費率（非超額累進）；沒有設定的館別完全沿用現行系統費率，
            兩者可在同一期快照裡混算。AM 總管與成交大師績效仍是「逐館級距算完的池 ÷ 人數」，
            除人數與在職比例邏輯不變。
            <br />
            版本以資料月對齊：生效日落在資料月 1 日之後，該資料月仍用舊制；資料月次月 9 日 23:59
            定案後不回溯已定案金額。營收基準沿用現行來源白名單口徑，與住房率統計完全脫鉤。
          </CardDescription>
        </CardHeader>
      </Card>

      {/* 館別總覽 */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">館別總覽</CardTitle>
            <CardDescription>哪些館別已改用獨立業務規則</CardDescription>
          </div>
          {!readOnly && (
            <Button size="sm" onClick={() => openCreate()}>
              <Plus className="mr-1 h-4 w-4" />
              新增規則版本
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {overview.map(({ acc, hasRule, types, versionCount }) => (
            <button
              key={acc.id}
              type="button"
              onClick={() => setSelectedAcc(acc.id)}
              className={`flex w-full flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50 ${
                selectedAcc === acc.id ? "border-primary bg-muted/40" : "border-border"
              }`}
            >
              <span className="font-medium">{acc.name}</span>
              <span className="flex flex-wrap items-center gap-1">
                {hasRule ? (
                  <>
                    <Badge variant="default">已設獨立規則</Badge>
                    {types.map((t) => (
                      <Badge key={t} variant="outline">
                        {bonusLabel(t)}
                      </Badge>
                    ))}
                    <span className="text-xs text-muted-foreground">{versionCount} 個版本</span>
                  </>
                ) : (
                  <Badge variant="secondary">沿用系統費率</Badge>
                )}
              </span>
            </button>
          ))}
        </CardContent>
      </Card>

      {/* 級距表 + 版本列表 */}
      {selectedAcc && (
        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">
                {accs.find((a) => a.id === selectedAcc)?.name} ｜ 級距內容
              </CardTitle>
              {!readOnly && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => openCreate(selectedAcc)}>
                    <Plus className="mr-1 h-4 w-4" />
                    新增版本
                  </Button>
                  {shownVersion && (
                    <Button size="sm" variant="outline" onClick={() => openCopyFrom(shownVersion)}>
                      <Copy className="mr-1 h-4 w-4" />
                      複製到其他館別
                    </Button>
                  )}
                </div>
              )}
            </div>
            <Select value={selectedBonus} onValueChange={setSelectedBonus}>
              <SelectTrigger className="max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BONUS_TYPES.map((b) => (
                  <SelectItem key={b.value} value={b.value}>
                    {b.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="space-y-4">
            {!shownVersion ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                此館別的「{bonusLabel(selectedBonus)}」尚未設定獨立規則，目前沿用系統費率。
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full table-fixed text-sm tabular-nums">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="w-20 py-2 text-left font-medium">階層</th>
                        <th className="py-2 text-right font-medium whitespace-nowrap">
                          營收門檻（達到即整筆套用）
                        </th>
                        <th className="py-2 text-right font-medium whitespace-nowrap">費率</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shownVersion.tiers.map((t, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-2">第 {i + 1} 階</td>
                          <td className="py-2 text-right whitespace-nowrap">
                            {twMoney(t.min_revenue)} 以上
                          </td>
                          <td className="py-2 text-right whitespace-nowrap">{pct(t.rate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {shownVersion.note && (
                  <p className="text-xs text-muted-foreground">備註：{shownVersion.note}</p>
                )}

                <div>
                  <p className="mb-2 text-sm font-medium">版本列表</p>
                  <ul className="divide-y rounded-md border">
                    {venueRules.map((r) => {
                      const isCurrent = r.id === currentId;
                      const isFuture = r.effective_from > todayTaipei();
                      return (
                        <li
                          key={r.id}
                          className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm ${
                            shownVersion.id === r.id ? "bg-muted/40" : ""
                          }`}
                        >
                          <button
                            type="button"
                            className="flex flex-1 flex-wrap items-center gap-2 text-left"
                            onClick={() => setActiveVersionId(r.id)}
                          >
                            <span className="tabular-nums">生效日：{r.effective_from}</span>
                            {isCurrent ? (
                              <Badge variant="default">目前生效</Badge>
                            ) : isFuture ? (
                              <Badge variant="outline">待生效</Badge>
                            ) : (
                              <Badge variant="secondary">已過期</Badge>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {payoutPeriodHint(r.effective_from)}
                            </span>
                          </button>
                          {!readOnly && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => removeVersion(r.id)}
                              aria-label="刪除版本"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <VenueTierRulePreview accs={accs} rules={rules} />

      <VenueTierRuleAuditLog accs={accs} accountFilter={selectedAcc} />


      {/* 新增／複製版本 Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>新增級距規則版本</DialogTitle>
            <DialogDescription>
              新增後不回溯歷史期別，只影響尚未定案的未來期別。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>館別</Label>
              <Select value={formAcc} onValueChange={setFormAcc}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇館別" />
                </SelectTrigger>
                <SelectContent>
                  {accs.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>獎金類型</Label>
              <Select value={formBonus} onValueChange={setFormBonus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BONUS_TYPES.map((b) => (
                    <SelectItem key={b.value} value={b.value}>
                      {b.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>生效日</Label>
              <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
              <p className="text-xs text-muted-foreground">{payoutPeriodHint(formDate)}</p>
            </div>

            <div className="space-y-2">
              <Label>級距（門檻金額／費率 %）</Label>
              {formTiers.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    inputMode="numeric"
                    placeholder="門檻金額"
                    value={t.min}
                    onChange={(e) =>
                      setFormTiers((prev) =>
                        prev.map((x, xi) => (xi === i ? { ...x, min: e.target.value } : x)),
                      )
                    }
                  />
                  <Input
                    inputMode="decimal"
                    placeholder="費率 %"
                    value={t.rate}
                    onChange={(e) =>
                      setFormTiers((prev) =>
                        prev.map((x, xi) => (xi === i ? { ...x, rate: e.target.value } : x)),
                      )
                    }
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="刪除此階"
                    onClick={() => setFormTiers((prev) => prev.filter((_, xi) => xi !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                size="sm"
                variant="outline"
                onClick={() => setFormTiers((prev) => [...prev, { min: "", rate: "" }])}
              >
                <Plus className="mr-1 h-4 w-4" />
                新增一階
              </Button>
            </div>

            <div className="space-y-1.5">
              <Label>備註</Label>
              <Textarea value={formNote} onChange={(e) => setFormNote(e.target.value)} rows={2} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={save} disabled={saving}>
              儲存版本
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
