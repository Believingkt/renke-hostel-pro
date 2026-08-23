import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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

type BonusType = (typeof BONUS_TYPES)[number]["value"];

const bonusLabel = (v: string) => BONUS_TYPES.find((b) => b.value === v)?.label ?? v;

const twMoney = (n: number) =>
  `NT$ ${Math.round(n).toLocaleString("zh-TW", { maximumFractionDigits: 0 })}`;

const pct = (r: number) => `${(r * 100).toFixed(2).replace(/\.?0+$/, "")}%`;

/** effective_from 對齊資料月：落在資料月 1 日之後 → 該資料月仍用舊制 */
function payoutPeriodHint(effectiveFrom: string): string {
  const [y, m, d] = effectiveFrom.slice(0, 10).split("-").map(Number);
  let dataY = y;
  let dataM = m;
  if (d > 1) {
    dataM = m === 12 ? 1 : m + 1;
    dataY = m === 12 ? y + 1 : y;
  }
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

/* ------------------------------ 版本聚合 ------------------------------ */

interface VenueVersion {
  key: string; // accommodation_id|effective_from
  accommodation_id: string;
  effective_from: string;
  rows: Partial<Record<BonusType, TierRuleRow>>;
  /** 三種獎金的門檻是否一致（不一致代表是舊資料，需降級顯示） */
  consistent: boolean;
  thresholds: number[];
  note: string | null;
}

function buildVersions(rules: TierRuleRow[], accId: string): VenueVersion[] {
  const map = new Map<string, VenueVersion>();
  for (const r of rules) {
    if (r.accommodation_id !== accId) continue;
    const key = `${r.accommodation_id}|${r.effective_from}`;
    let v = map.get(key);
    if (!v) {
      v = {
        key,
        accommodation_id: r.accommodation_id,
        effective_from: r.effective_from,
        rows: {},
        consistent: true,
        thresholds: [],
        note: null,
      };
      map.set(key, v);
    }
    v.rows[r.bonus_type as BonusType] = r;
    if (!v.note && r.note) v.note = r.note;
  }
  for (const v of map.values()) {
    const sets = Object.values(v.rows).map((r) =>
      (r as TierRuleRow).tiers.map((t) => t.min_revenue).sort((a, b) => a - b),
    );
    const union = Array.from(new Set(sets.flat())).sort((a, b) => a - b);
    v.thresholds = union;
    v.consistent = sets.every((s) => s.length === union.length && s.every((n, i) => n === union[i]));
  }
  return Array.from(map.values()).sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
}

function currentVersionKey(versions: VenueVersion[]): string | null {
  const today = todayTaipei();
  const eligible = versions.filter((v) => v.effective_from <= today);
  if (eligible.length === 0) return null;
  return eligible.reduce((best, v) => (v.effective_from > best.effective_from ? v : best)).key;
}

/* ------------------------------ 表單型別 ------------------------------ */

interface FormRow {
  min: string;
  rates: Record<BonusType, string>;
}

const emptyRow = (): FormRow => ({
  min: "",
  rates: { am_performance: "", am_manager: "", closer_performance: "" },
});

/* ------------------------------ 主元件 ------------------------------ */

export default function VenueBonusTierRulesTab({ readOnly = false }: { readOnly?: boolean }) {
  const { toast } = useToast();
  const [accs, setAccs] = useState<AccOption[]>([]);
  const [rules, setRules] = useState<TierRuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAcc, setSelectedAcc] = useState<string | null>(null);
  const [activeVersionKey, setActiveVersionKey] = useState<string | null>(null);

  // 編輯 Dialog 狀態
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formAcc, setFormAcc] = useState<string>("");
  const [formDate, setFormDate] = useState<string>(todayTaipei());
  const [formNote, setFormNote] = useState<string>("");
  const [formEnabled, setFormEnabled] = useState<Record<BonusType, boolean>>({
    am_performance: true,
    am_manager: true,
    closer_performance: true,
  });
  const [formRows, setFormRows] = useState<FormRow[]>([emptyRow()]);
  const [errors, setErrors] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const fieldRefs = useRef<Record<string, HTMLElement | null>>({});
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

  const overview = useMemo(() => {
    return accs.map((a) => {
      const own = rules.filter((r) => r.accommodation_id === a.id);
      const types = Array.from(new Set(own.map((r) => r.bonus_type)));
      const versionCount = new Set(own.map((r) => r.effective_from)).size;
      return { acc: a, hasRule: own.length > 0, types, versionCount };
    });
  }, [accs, rules]);

  const versions = useMemo(
    () => (selectedAcc ? buildVersions(rules, selectedAcc) : []),
    [rules, selectedAcc],
  );
  const currentKey = useMemo(() => currentVersionKey(versions), [versions]);
  const shownVersion = useMemo(
    () =>
      versions.find((v) => v.key === activeVersionKey) ??
      versions.find((v) => v.key === currentKey) ??
      versions[0] ??
      null,
    [versions, activeVersionKey, currentKey],
  );

  useEffect(() => {
    setActiveVersionKey(null);
  }, [selectedAcc]);

  /* ------------------------------ 表單操作 ------------------------------ */

  const openCreate = (accId?: string) => {
    setFormAcc(accId ?? selectedAcc ?? "");
    setFormDate(todayTaipei());
    setFormNote("");
    setFormEnabled({ am_performance: true, am_manager: true, closer_performance: true });
    setFormRows([emptyRow()]);
    setErrors([]);
    setFieldErrors({});
    setDialogOpen(true);
  };

  const versionToRows = (v: VenueVersion): FormRow[] =>
    v.thresholds.map((min) => ({
      min: String(min),
      rates: {
        am_performance: rateAt(v, "am_performance", min),
        am_manager: rateAt(v, "am_manager", min),
        closer_performance: rateAt(v, "closer_performance", min),
      },
    }));

  const openCopyFrom = (v: VenueVersion) => {
    setFormAcc("");
    setFormDate(todayTaipei());
    setFormNote(
      `複製自 ${accs.find((a) => a.id === v.accommodation_id)?.name ?? ""}（${v.effective_from}）`,
    );
    setFormEnabled({
      am_performance: !!v.rows.am_performance,
      am_manager: !!v.rows.am_manager,
      closer_performance: !!v.rows.closer_performance,
    });
    setFormRows(versionToRows(v));
    setErrors([]);
    setFieldErrors({});
    setDialogOpen(true);
  };

  /** 以此版本為基礎新增下一版（同館別） */
  const openBasedOn = (v: VenueVersion) => {
    setFormAcc(v.accommodation_id);
    setFormDate(todayTaipei());
    setFormNote("");
    setFormEnabled({
      am_performance: !!v.rows.am_performance,
      am_manager: !!v.rows.am_manager,
      closer_performance: !!v.rows.closer_performance,
    });
    setFormRows(versionToRows(v));
    setErrors([]);
    setFieldErrors({});
    setDialogOpen(true);
  };

  const enabledTypes = BONUS_TYPES.filter((b) => formEnabled[b.value]).map((b) => b.value);

  /** 逐欄位錯誤：key 為 acc / date / types / rows / min-i / rate-i-type */
  const validate = (): { list: string[]; fields: Record<string, string>; firstKey?: string } => {
    const errs: string[] = [];
    const fields: Record<string, string> = {};
    const order: string[] = [];
    const put = (key: string, msg: string) => {
      if (!fields[key]) {
        fields[key] = msg;
        order.push(key);
      }
      errs.push(msg);
    };

    if (!formAcc) put("acc", "請選擇館別");
    if (!formDate) put("date", "請選擇生效日");
    if (enabledTypes.length === 0)
      put("types", "至少要有一種獎金使用本館級距，否則此版本沒有意義");
    if (formRows.length === 0) put("rows", "請至少填一個級距");

    const mins: Array<number | null> = [];
    formRows.forEach((row, i) => {
      const min = Number(row.min);
      if (row.min.trim() === "") {
        put(`min-${i}`, `第 ${i + 1} 階：營收門檻必填`);
        mins.push(null);
      } else if (!Number.isFinite(min) || min < 0) {
        put(`min-${i}`, `第 ${i + 1} 階：營收門檻必須是 0 以上的數字`);
        mins.push(null);
      } else {
        mins.push(min);
      }
      for (const t of enabledTypes) {
        const raw = row.rates[t];
        const rate = Number(raw);
        if (raw.trim() === "") {
          put(`rate-${i}-${t}`, `第 ${i + 1} 階「${bonusLabel(t)}」費率必填（不發請填 0）`);
        } else if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
          put(`rate-${i}-${t}`, `第 ${i + 1} 階「${bonusLabel(t)}」費率必須是 0–100 之間的數字`);
        }
      }
    });

    // 門檻必須由小到大遞增且不重複
    const seen = new Map<number, number>();
    mins.forEach((m, i) => {
      if (m === null) return;
      const dup = seen.get(m);
      if (dup !== undefined) {
        put(`min-${i}`, `第 ${i + 1} 階：門檻 ${m.toLocaleString()} 與第 ${dup + 1} 階重複`);
        return;
      }
      seen.set(m, i);
      for (let j = i - 1; j >= 0; j--) {
        const prev = mins[j];
        if (prev === null) continue;
        if (m <= prev) {
          put(
            `min-${i}`,
            `第 ${i + 1} 階：門檻必須大於第 ${j + 1} 階（${prev.toLocaleString()}）`,
          );
        }
        break;
      }
    });

    return { list: errs, fields, firstKey: order[0] };
  };

  const save = async () => {
    const { list, fields, firstKey } = validate();
    setErrors(list);
    setFieldErrors(fields);
    if (list.length > 0) {
      toast({ title: "尚有欄位需修正", description: list[0], variant: "destructive" });
      if (firstKey) {
        requestAnimationFrame(() => {
          const el = fieldRefs.current[firstKey];
          el?.scrollIntoView({ block: "center", behavior: "smooth" });
          el?.focus?.();
        });
      }
      return;
    }


    const sortedRows = [...formRows].sort((a, b) => Number(a.min) - Number(b.min));
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const payload = enabledTypes.map((t) => ({
      accommodation_id: formAcc,
      bonus_type: t,
      effective_from: formDate,
      tiers: sortedRows.map((r) => ({
        min_revenue: Number(r.min),
        rate: Number(r.rates[t]) / 100,
      })) as any,
      note: formNote || null,
      created_by: userData?.user?.id ?? null,
    }));
    const { error } = await supabase.from("venue_team_bonus_tier_rules").insert(payload);
    setSaving(false);
    if (error) {
      toast({ title: "儲存失敗", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "已新增版本", description: payoutPeriodHint(formDate) });
    setDialogOpen(false);
    setSelectedAcc(formAcc);
    setActiveVersionKey(`${formAcc}|${formDate}`);
    await load();
  };

  const removeVersion = async (v: VenueVersion) => {
    const { error } = await supabase
      .from("venue_team_bonus_tier_rules")
      .delete()
      .eq("accommodation_id", v.accommodation_id)
      .eq("effective_from", v.effective_from);
    if (error) {
      toast({ title: "刪除失敗", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "已刪除版本" });
    setActiveVersionKey(null);
    await load();
  };

  if (loading) return null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>館別獎金級距規則（總部集中管理）</CardTitle>
          <CardDescription>
            這裡設定的是「館別專屬階層級距」：一個館別、一個生效日，就是一組完整的級距表——
            營收門檻只定義一次，AM 績效／AM 總管／成交大師績效各自對應一欄費率。
            有設定的館別，該館營收落在哪一階就整筆套用該階費率（非超額累進）；
            沒有勾選「使用本館級距」的獎金類型則完全沿用系統費率，兩者可在同一期快照裡混算。
            AM 總管與成交大師績效仍是「逐館級距算完的池 ÷ 人數」，除人數與在職比例邏輯不變。
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

      {/* 級距矩陣 + 版本列表 */}
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
                    <>
                      <Button size="sm" variant="outline" onClick={() => openBasedOn(shownVersion)}>
                        <Copy className="mr-1 h-4 w-4" />
                        以此版本為基礎新增
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openCopyFrom(shownVersion)}>
                        <Copy className="mr-1 h-4 w-4" />
                        複製到其他館別
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!shownVersion ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                此館別尚未設定獨立級距規則，目前三種獎金皆沿用系統費率。
              </p>
            ) : (
              <>
                {!shownVersion.consistent && (
                  <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                    此版本的三種獎金門檻不一致（舊資料）。下表以聯集門檻顯示，缺該門檻的欄位標示為「—」。
                    建議以此版本為基礎新增一版，統一門檻後再使用。
                  </p>
                )}

                {/* 桌機：矩陣表 */}
                <div className="hidden overflow-x-auto sm:block">
                  <table className="w-full text-sm tabular-nums">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="w-16 py-2 text-left font-medium">階層</th>
                        <th className="py-2 text-right font-medium whitespace-nowrap">
                          營收門檻（達到即整筆套用）
                        </th>
                        {BONUS_TYPES.map((b) => (
                          <th key={b.value} className="py-2 text-right font-medium whitespace-nowrap">
                            {b.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {shownVersion.thresholds.map((min, i) => (
                        <tr key={min} className="border-b last:border-0">
                          <td className="py-2">第 {i + 1} 階</td>
                          <td className="py-2 text-right whitespace-nowrap">
                            {twMoney(min)} 以上
                          </td>
                          {BONUS_TYPES.map((b) => (
                            <td key={b.value} className="py-2 text-right whitespace-nowrap">
                              {displayRate(shownVersion, b.value, min)}
                            </td>
                          ))}
                        </tr>
                      ))}
                      <tr className="text-xs text-muted-foreground">
                        <td className="py-2" />
                        <td className="py-2 text-right">未設定門檻的獎金類型</td>
                        {BONUS_TYPES.map((b) => (
                          <td key={b.value} className="py-2 text-right">
                            {shownVersion.rows[b.value] ? "本館級距" : "沿用系統費率"}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* 手機：每階一張卡 */}
                <div className="space-y-2 sm:hidden">
                  {shownVersion.thresholds.map((min, i) => (
                    <div key={min} className="rounded-md border px-3 py-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">第 {i + 1} 階</span>
                        <span className="tabular-nums">{twMoney(min)} 以上</span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                        {BONUS_TYPES.map((b) => (
                          <div key={b.value} className="rounded bg-muted/50 px-1 py-1">
                            <div className="text-muted-foreground">{b.label}</div>
                            <div className="tabular-nums font-medium">
                              {displayRate(shownVersion, b.value, min)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-1">
                    {BONUS_TYPES.map((b) => (
                      <Badge key={b.value} variant={shownVersion.rows[b.value] ? "default" : "secondary"}>
                        {b.label}：{shownVersion.rows[b.value] ? "本館級距" : "沿用系統費率"}
                      </Badge>
                    ))}
                  </div>
                </div>

                {shownVersion.note && (
                  <p className="text-xs text-muted-foreground">備註：{shownVersion.note}</p>
                )}

                <div>
                  <p className="mb-2 text-sm font-medium">版本列表</p>
                  <ul className="divide-y rounded-md border">
                    {versions.map((v) => {
                      const isCurrent = v.key === currentKey;
                      const isFuture = v.effective_from > todayTaipei();
                      return (
                        <li
                          key={v.key}
                          className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm ${
                            shownVersion.key === v.key ? "bg-muted/40" : ""
                          }`}
                        >
                          <button
                            type="button"
                            className="flex flex-1 flex-wrap items-center gap-2 text-left"
                            onClick={() => setActiveVersionKey(v.key)}
                          >
                            <span className="tabular-nums">生效日：{v.effective_from}</span>
                            {isCurrent ? (
                              <Badge variant="default">目前生效</Badge>
                            ) : isFuture ? (
                              <Badge variant="outline">待生效</Badge>
                            ) : (
                              <Badge variant="secondary">已過期</Badge>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {payoutPeriodHint(v.effective_from)}
                            </span>
                          </button>
                          {!readOnly && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => removeVersion(v)}
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

      <VenueTierRuleAuditLog accs={accs} accountFilter={selectedAcc} />

      {/* 新增／複製版本 Dialog：整張級距表一次編輯 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-h-[88vh] sm:w-full sm:max-w-4xl">
          <DialogHeader className="shrink-0 border-b px-4 py-3 text-left sm:px-6 sm:py-4">
            <DialogTitle className="text-base sm:text-lg">新增級距規則版本</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              門檻只需定義一次，三種獎金各填一欄費率。新增後不回溯歷史期別，只影響尚未定案的未來期別。
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>館別</Label>
                <Select value={formAcc} onValueChange={setFormAcc}>
                  <SelectTrigger
                    ref={(el) => (fieldRefs.current["acc"] = el)}
                    className={fieldErrors.acc ? "border-destructive" : ""}
                  >
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
                {fieldErrors.acc && (
                  <p className="text-xs text-destructive">{fieldErrors.acc}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>生效日</Label>
                <Input
                  type="date"
                  ref={(el) => (fieldRefs.current["date"] = el)}
                  className={fieldErrors.date ? "border-destructive" : ""}
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                />
                {fieldErrors.date ? (
                  <p className="text-xs text-destructive">{fieldErrors.date}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">{payoutPeriodHint(formDate)}</p>
                )}
              </div>
            </div>


            <div className="space-y-2">
              <Label>哪些獎金使用本館級距？</Label>
              <div className="grid gap-2 sm:grid-cols-3">
                {BONUS_TYPES.map((b) => (
                  <div
                    key={b.value}
                    className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                  >
                    <span className="text-sm">{b.label}</span>
                    <Switch
                      checked={formEnabled[b.value]}
                      onCheckedChange={(c) =>
                        setFormEnabled((prev) => ({ ...prev, [b.value]: c }))
                      }
                      aria-label={`${b.label} 使用本館級距`}
                    />
                  </div>
                ))}
              </div>
              {fieldErrors.types ? (
                <p
                  className="text-xs text-destructive"
                  ref={(el) => (fieldRefs.current["types"] = el)}
                >
                  {fieldErrors.types}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  關閉的獎金類型不會建立本館規則，該獎金在此館維持沿用全站系統費率。
                </p>
              )}
            </div>


            <div className="space-y-2">
              <Label>級距表（門檻金額／各獎金費率 %）</Label>
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full min-w-[560px] text-sm">

                  <thead>
                    <tr className="text-xs text-muted-foreground">
                      <th className="w-14 py-1 text-left font-medium">階層</th>
                      <th className="py-1 text-left font-medium">營收門檻</th>
                      {BONUS_TYPES.map((b) => (
                        <th
                          key={b.value}
                          className={`py-1 text-left font-medium ${
                            formEnabled[b.value] ? "" : "opacity-40"
                          }`}
                        >
                          {b.label} %
                        </th>
                      ))}
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {formRows.map((row, i) => (
                      <tr key={i}>
                        <td className="py-1 pr-2 text-xs text-muted-foreground whitespace-nowrap">
                          第 {i + 1} 階
                        </td>
                        <td className="py-1 pr-2 align-top">
                          <Input
                            inputMode="numeric"
                            placeholder="1000000"
                            ref={(el) => (fieldRefs.current[`min-${i}`] = el)}
                            className={`tabular-nums ${
                              fieldErrors[`min-${i}`] ? "border-destructive" : ""
                            }`}
                            value={row.min}
                            onChange={(e) =>
                              setFormRows((prev) =>
                                prev.map((x, xi) =>
                                  xi === i ? { ...x, min: e.target.value } : x,
                                ),
                              )
                            }
                          />
                          {fieldErrors[`min-${i}`] && (
                            <p className="mt-1 text-xs text-destructive">
                              {fieldErrors[`min-${i}`]}
                            </p>
                          )}
                        </td>
                        {BONUS_TYPES.map((b) => (
                          <td key={b.value} className="py-1 pr-2 align-top">
                            <Input
                              inputMode="decimal"
                              placeholder={formEnabled[b.value] ? "0.80" : "沿用系統"}
                              ref={(el) => (fieldRefs.current[`rate-${i}-${b.value}`] = el)}
                              className={`tabular-nums ${
                                fieldErrors[`rate-${i}-${b.value}`] ? "border-destructive" : ""
                              }`}
                              disabled={!formEnabled[b.value]}
                              value={row.rates[b.value]}
                              onChange={(e) =>
                                setFormRows((prev) =>
                                  prev.map((x, xi) =>
                                    xi === i
                                      ? { ...x, rates: { ...x.rates, [b.value]: e.target.value } }
                                      : x,
                                  ),
                                )
                              }
                            />
                            {fieldErrors[`rate-${i}-${b.value}`] && (
                              <p className="mt-1 text-xs text-destructive">
                                {fieldErrors[`rate-${i}-${b.value}`]}
                              </p>
                            )}
                          </td>
                        ))}

                        <td className="py-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="刪除此階"
                            onClick={() =>
                              setFormRows((prev) => prev.filter((_, xi) => xi !== i))
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setFormRows((prev) => [...prev, emptyRow()])}
              >
                <Plus className="mr-1 h-4 w-4" />
                新增一階
              </Button>
            </div>

            {errors.length > 0 && (
              <ul className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {errors.map((e, i) => (
                  <li key={i}>・{e}</li>
                ))}
              </ul>
            )}

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

/* ------------------------------ 顯示輔助 ------------------------------ */

function rateAt(v: VenueVersion, type: BonusType, min: number): string {
  const row = v.rows[type];
  if (!row) return "";
  const hit = row.tiers.find((t) => t.min_revenue === min);
  return hit ? String(Number((hit.rate * 100).toFixed(4))) : "";
}

function displayRate(v: VenueVersion, type: BonusType, min: number): string {
  const row = v.rows[type];
  if (!row) return "沿用系統";
  const hit = row.tiers.find((t) => t.min_revenue === min);
  return hit ? pct(hit.rate) : "—";
}
