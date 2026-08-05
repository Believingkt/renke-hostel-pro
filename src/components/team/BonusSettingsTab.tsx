import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Plus, Lock, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { getOrderSourceConfig, ORDER_SOURCE_DISPLAY_NAMES } from "@/utils/orderHelpers";

/* ------------------------------ 共用工具 ------------------------------ */

/** 今天（Asia/Taipei）的 yyyy-MM-dd */
function taipeiToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * 取「目前生效版本」：effective_from <= 今天(台北) 中 effective_from 最大者。
 * 不可直接取陣列第一筆（會誤取未來生效版本）。
 */
function pickCurrent<T extends { effective_from: string; created_at?: string }>(
  rows: T[],
): T | null {
  const today = taipeiToday();
  const eligible = rows.filter((r) => r.effective_from <= today);
  if (eligible.length === 0) return null;
  return eligible.reduce((best, r) => {
    if (r.effective_from > best.effective_from) return r;
    if (r.effective_from === best.effective_from && (r.created_at ?? "") > (best.created_at ?? ""))
      return r;
    return best;
  });
}

const BONUS_TYPES: { type: string; label: string; field: "rate" | "fixed_amount" }[] = [
  { type: "venue_closing", label: "場域成交獎金", field: "fixed_amount" },
  { type: "am_performance", label: "AM績效獎金", field: "rate" },
  { type: "am_venue_bonus", label: "AM場域獎金", field: "fixed_amount" },
  { type: "am_manager", label: "AM總管獎金", field: "rate" },
  { type: "closer_performance", label: "成交組績效獎金", field: "rate" },
  { type: "closer_manager", label: "成交大師管理獎金", field: "rate" },
  { type: "kol_commission", label: "網紅營銷專利獎金", field: "rate" },
  { type: "kol_monthly", label: "網紅營銷月獎金", field: "fixed_amount" },
];

/** 費率設定表格的分類與顯示順序 */
const BONUS_GROUPS: { title: string; types: string[] }[] = [
  { title: "場域成交", types: ["venue_closing"] },
  { title: "AM", types: ["am_performance", "am_venue_bonus", "am_manager"] },
  { title: "成交組／成交大師", types: ["closer_performance", "closer_manager"] },
  { title: "網紅營銷", types: ["kol_commission", "kol_monthly"] },
];


const ROLE_TYPES: { type: string; label: string }[] = [
  { type: "am_manager", label: "AM總管" },
  { type: "closer_manager", label: "成交組主管" },
  { type: "kol_bonus_recipient", label: "網紅營銷專利獎金受領人" },
];

interface RateRow {
  id: string;
  bonus_type: string;
  rate: number | null;
  fixed_amount: number | null;
  effective_from: string;
  created_at: string;
}

interface SourceRow {
  id: string;
  included_order_sources: string[];
  effective_from: string;
  created_at: string;
}

interface BindingRow {
  id: string;
  role_type: string;
  member_id: string;
  effective_from: string;
  created_at: string;
}

interface MemberOption {
  id: string;
  display_name: string | null;
  is_active: boolean | null;
}

const money = (n: number | null | undefined) =>
  `NT$ ${Math.round(Number(n ?? 0)).toLocaleString()}`;

/* ------------------------------ 主元件 ------------------------------ */

export default function BonusSettingsTab() {
  const [uid, setUid] = useState<string | null>(null);
  const [isKolEditor, setIsKolEditor] = useState(false);
  const [sourceOptions, setSourceOptions] = useState<string[]>([]);
  const [sourceOwners, setSourceOwners] = useState<Record<string, string[]>>({});

  const [rates, setRates] = useState<RateRow[]>([]);
  const [sharedSources, setSharedSources] = useState<SourceRow[]>([]);
  const [kolSources, setKolSources] = useState<SourceRow[]>([]);
  const [bindings, setBindings] = useState<BindingRow[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ratesRes, sharedRes, kolRes, bindRes, memberRes, ordersRes] = await Promise.all([
        (supabase as any)
          .from("teamcommission_bonus_rate_settings")
          .select("id, bonus_type, rate, fixed_amount, effective_from, created_at")
          .order("effective_from", { ascending: false }),
        (supabase as any)
          .from("teamcommission_shared_revenue_source_whitelist")
          .select("id, included_order_sources, effective_from, created_at")
          .order("effective_from", { ascending: false }),
        (supabase as any)
          .from("teamcommission_kol_revenue_source_whitelist")
          .select("id, included_order_sources, effective_from, created_at")
          .order("effective_from", { ascending: false }),
        (supabase as any)
          .from("teamcommission_role_bindings")
          .select("id, role_type, member_id, effective_from, created_at")
          .order("effective_from", { ascending: false }),
        supabase
          .from("team_member_profiles")
          .select("id, user_id, display_name, is_active")
          .order("display_name", { ascending: true }),
        (supabase as any).rpc("get_all_order_sources"),
      ]);

      setRates(ratesRes.data ?? []);
      setSharedSources(sharedRes.data ?? []);
      setKolSources(kolRes.data ?? []);
      setBindings(bindRes.data ?? []);
      setMembers((memberRes.data ?? []) as MemberOption[]);

      const set = new Set<string>(Object.keys(ORDER_SOURCE_DISPLAY_NAMES));
      if (ordersRes.error || !Array.isArray(ordersRes.data)) {
        toast.warning("來源清單載入不完整，僅顯示預設來源");
      } else {
        for (const v of ordersRes.data as string[]) {
          const s = (v ?? "").trim();
          if (s) set.add(s);
        }
      }
      setSourceOptions(Array.from(set));

      const { data: ownerRows } = await (supabase as any).rpc("get_order_source_owners");
      const map: Record<string, string[]> = {};
      for (const r of (ownerRows ?? []) as any[]) {
        const s = String(r?.source ?? "").trim();
        if (!s) continue;
        map[s] = Array.isArray(r?.accommodation_names) ? r.accommodation_names : [];
      }
      setSourceOwners(map);
    } catch (e: any) {
      toast.error("讀取獎金設定失敗：" + (e?.message ?? ""));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data.user?.id ?? null;
      setUid(id);
      if (id) {
        const { data: ok } = await (supabase as any).rpc("is_kol_bonus_editor", {
          check_user_id: id,
        });
        setIsKolEditor(ok === true);
      }
    })();
    loadAll();
  }, [loadAll]);

  const memberName = useCallback(
    (id: string) => members.find((m) => m.id === id)?.display_name ?? id.slice(0, 8),
    [members],
  );

  // 依「使用館別」分組：多館共用一區，單一館別各自成區
  const sourceGroups = useMemo(() => {
    const common: string[] = [];
    const byAcc = new Map<string, string[]>();
    for (const s of sourceOptions) {
      const owners = sourceOwners[s] ?? [];
      if (owners.length === 1) {
        const key = owners[0];
        const list = byAcc.get(key) ?? [];
        list.push(s);
        byAcc.set(key, list);
      } else {
        common.push(s);
      }
    }
    const groups: { title: string; sources: string[] }[] = [];
    if (common.length > 0) groups.push({ title: "共用來源（多館別通用）", sources: common });
    for (const [name, list] of Array.from(byAcc.entries()).sort((a, b) =>
      a[0].localeCompare(b[0], "zh-TW"),
    )) {
      groups.push({ title: `${name} 專屬來源`, sources: list });
    }
    return groups;
  }, [sourceOptions, sourceOwners]);

  return (
    <div className="space-y-6 pt-4">
      <RateSection
        rows={rates}
        loading={loading}
        uid={uid}
        onSaved={loadAll}
      />
      <SourceSection
        title="共用來源白名單"
        description="AM績效、成交組績效等共用獎金採計的訂單來源"
        rows={sharedSources}
        loading={loading}
        uid={uid}
        table="teamcommission_shared_revenue_source_whitelist"
        sourceGroups={sourceGroups}
        canEdit
        onSaved={loadAll}
      />
      <SourceSection
        title="KOL 專用來源白名單"
        description="網紅營銷專利獎金採計的訂單來源（僅指定人員可編輯）"
        rows={kolSources}
        loading={loading}
        uid={uid}
        table="teamcommission_kol_revenue_source_whitelist"
        sourceGroups={sourceGroups}
        canEdit={isKolEditor}
        onSaved={loadAll}
      />
      <BindingSection
        rows={bindings}
        members={members}
        memberName={memberName}
        loading={loading}
        uid={uid}
        onSaved={loadAll}
      />
      <VenueClosingAssignmentSection members={members} memberName={memberName} uid={uid} />
      <AmVenueOverviewSection />
    </div>

  );
}

/* ------------------------------ (a) 費率設定 ------------------------------ */

function RateSection({
  rows,
  loading,
  uid,
  onSaved,
}: {
  rows: RateRow[];
  loading: boolean;
  uid: string | null;
  onSaved: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialogType, setDialogType] = useState<string | null>(null);
  const [rateInput, setRateInput] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(taipeiToday());
  const [saving, setSaving] = useState(false);

  const byType = useMemo(() => {
    const m = new Map<string, RateRow[]>();
    for (const r of rows) {
      const arr = m.get(r.bonus_type) ?? [];
      arr.push(r);
      m.set(r.bonus_type, arr);
    }
    for (const [, arr] of m) arr.sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
    return m;
  }, [rows]);

  const def = BONUS_TYPES.find((b) => b.type === dialogType);

  function openDialog(type: string) {
    const cur = pickCurrent(byType.get(type) ?? []);
    setRateInput(cur?.rate != null ? String(Number((cur.rate * 100).toFixed(4))) : "");
    setAmountInput(cur?.fixed_amount != null ? String(Math.round(Number(cur.fixed_amount))) : "");
    setEffectiveFrom(taipeiToday());
    setDialogType(type);
  }

  async function submit() {
    if (!def || !uid) return;
    const payload: Record<string, unknown> = {
      bonus_type: def.type,
      effective_from: effectiveFrom,
      created_by: uid,
      rate: null,
      fixed_amount: null,
    };
    if (def.field === "rate") {
      const v = Number(rateInput);
      if (!rateInput.trim() || Number.isNaN(v)) return toast.error("請輸入有效的百分比");
      payload.rate = v / 100;
    } else {
      const v = Number(amountInput);
      if (!amountInput.trim() || Number.isNaN(v)) return toast.error("請輸入有效的金額");
      payload.fixed_amount = Math.round(v);
    }
    setSaving(true);
    const { error } = await (supabase as any)
      .from("teamcommission_bonus_rate_settings")
      .insert(payload);
    setSaving(false);
    if (error) return toast.error("新增版本失敗：" + error.message);
    toast.success("已新增版本");
    setDialogType(null);
    onSaved();
  }

  function toggle(type: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">獎金費率／金額設定</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? null : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>獎金項目</TableHead>
                <TableHead>目前生效值</TableHead>
                <TableHead>生效日</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {BONUS_GROUPS.flatMap((g) => [
                <TableRow key={`g-${g.title}`} className="bg-muted/50 hover:bg-muted/50">
                  <TableCell colSpan={5} className="py-1 text-xs font-medium text-muted-foreground">
                    {g.title}
                  </TableCell>
                </TableRow>,
                ...g.types.map((t) => BONUS_TYPES.find((b) => b.type === t)!).filter(Boolean),
              ]).map((b: any) => {
                if (b?.props !== undefined) return b; // 分類標題列


                const history = byType.get(b.type) ?? [];
                const cur = pickCurrent(history);
                const isOpen = expanded.has(b.type);
                return (
                  <Fragment key={b.type}>
                    <TableRow>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => toggle(b.type)}>
                          {isOpen ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{b.label}</TableCell>
                      <TableCell className="tabular-nums">
                        {cur == null
                          ? "—"
                          : b.field === "rate"
                            ? `${Number(((cur.rate ?? 0) * 100).toFixed(4))}%`
                            : money(cur.fixed_amount)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{cur?.effective_from ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => openDialog(b.type)}>
                          <Plus className="mr-1 h-4 w-4" />
                          新增版本
                        </Button>
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow>
                        <TableCell colSpan={5} className="bg-muted/40">
                          {history.length === 0 ? (
                            <div className="py-2 text-sm text-muted-foreground">尚無版本紀錄</div>
                          ) : (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>生效日</TableHead>
                                  <TableHead>數值</TableHead>
                                  <TableHead>狀態</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {history.map((h) => (
                                  <TableRow key={h.id}>
                                    <TableCell className="whitespace-nowrap">
                                      {h.effective_from}
                                    </TableCell>
                                    <TableCell className="tabular-nums">
                                      {h.rate != null
                                        ? `${Number((h.rate * 100).toFixed(4))}%`
                                        : money(h.fixed_amount)}
                                    </TableCell>
                                    <TableCell>
                                      {cur?.id === h.id ? (
                                        <Badge>目前生效</Badge>
                                      ) : h.effective_from > taipeiToday() ? (
                                        <Badge variant="outline">未來生效</Badge>
                                      ) : (
                                        <Badge variant="secondary">歷史</Badge>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={dialogType != null} onOpenChange={(o) => !o && setDialogType(null)}>
        <DialogContent className="overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>新增版本：{def?.label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {def?.field === "rate" ? (
              <div className="space-y-2">
                <Label>比例（%）</Label>
                <Input
                  type="number"
                  step="0.0001"
                  value={rateInput}
                  onChange={(e) => setRateInput(e.target.value)}
                  placeholder="例如 0.8 代表 0.8%"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label>固定金額（NT$）</Label>
                <Input
                  type="number"
                  step="1"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  placeholder="例如 1000"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>生效日</Label>
              <Input
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)}>
              取消
            </Button>
            <Button onClick={submit} disabled={saving}>
              儲存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ------------------------- (b)(c) 來源白名單 ------------------------- */

function SourceSection({
  title,
  description,
  rows,
  loading,
  uid,
  table,
  sourceGroups,
  canEdit,
  onSaved,
}: {
  title: string;
  description: string;
  rows: SourceRow[];
  loading: boolean;
  uid: string | null;
  table: string;
  sourceGroups: { title: string; sources: string[] }[];
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [effectiveFrom, setEffectiveFrom] = useState(taipeiToday());
  const [saving, setSaving] = useState(false);

  const cur = useMemo(() => pickCurrent(rows), [rows]);

  function openDialog() {
    setSelected(cur?.included_order_sources ?? []);
    setEffectiveFrom(taipeiToday());
    setOpen(true);
  }

  async function submit() {
    if (!uid) return;
    setSaving(true);
    const { error } = await (supabase as any).from(table).insert({
      included_order_sources: selected,
      effective_from: effectiveFrom,
      created_by: uid,
    });
    setSaving(false);
    if (error) return toast.error("新增版本失敗：" + error.message);
    toast.success("已新增版本");
    setOpen(false);
    onSaved();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {canEdit ? (
          <Button variant="outline" size="sm" onClick={openDialog}>
            <Plus className="mr-1 h-4 w-4" />
            新增版本
          </Button>
        ) : (
          <Badge variant="secondary" className="gap-1">
            <Lock className="h-3 w-3" />
            唯讀
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? null : (
          <>
            <div className="text-sm text-muted-foreground">
              目前生效版本：{cur?.effective_from ?? "尚無"}
            </div>
            <div className="flex flex-wrap gap-2">
              {(cur?.included_order_sources ?? []).length === 0 ? (
                <span className="text-sm text-muted-foreground">尚未設定任何來源</span>
              ) : (
                cur!.included_order_sources.map((s) => (
                  <Badge key={s} variant="outline" className={getOrderSourceConfig(s).className}>
                    {getOrderSourceConfig(s).label}
                  </Badge>
                ))
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowHistory((v) => !v)}>
              {showHistory ? (
                <ChevronDown className="mr-1 h-4 w-4" />
              ) : (
                <ChevronRight className="mr-1 h-4 w-4" />
              )}
              歷史版本（{rows.length}）
            </Button>
            {showHistory && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>生效日</TableHead>
                    <TableHead>來源</TableHead>
                    <TableHead>狀態</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap">{r.effective_from}</TableCell>
                      <TableCell>
                        {r.included_order_sources
                          .map((s) => getOrderSourceConfig(s).label)
                          .join("、") || "—"}
                      </TableCell>
                      <TableCell>
                        {cur?.id === r.id ? (
                          <Badge>目前生效</Badge>
                        ) : r.effective_from > taipeiToday() ? (
                          <Badge variant="outline">未來生效</Badge>
                        ) : (
                          <Badge variant="secondary">歷史</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>新增版本：{title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-4">
              <Label>採計的訂單來源</Label>
              {sourceGroups.map((g) => (
                <div key={g.title} className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    {g.title}（{g.sources.length}）
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {g.sources.map((s) => (
                      <label key={s} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={selected.includes(s)}
                          onCheckedChange={(c) =>
                            setSelected((prev) =>
                              c ? Array.from(new Set([...prev, s])) : prev.filter((x) => x !== s),
                            )
                          }
                        />
                        <span>{getOrderSourceConfig(s).label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <Label>生效日</Label>
              <Input
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button onClick={submit} disabled={saving}>
              儲存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ------------------------------ (d) 角色綁定 ------------------------------ */

function BindingSection({
  rows,
  members,
  memberName,
  loading,
  uid,
  onSaved,
}: {
  rows: BindingRow[];
  members: MemberOption[];
  memberName: (id: string) => string;
  loading: boolean;
  uid: string | null;
  onSaved: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialogRole, setDialogRole] = useState<string | null>(null);
  const [memberId, setMemberId] = useState<string>("none");
  const [effectiveFrom, setEffectiveFrom] = useState(taipeiToday());
  const [saving, setSaving] = useState(false);

  const byRole = useMemo(() => {
    const m = new Map<string, BindingRow[]>();
    for (const r of rows) {
      const arr = m.get(r.role_type) ?? [];
      arr.push(r);
      m.set(r.role_type, arr);
    }
    for (const [, arr] of m) arr.sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
    return m;
  }, [rows]);

  function openDialog(role: string) {
    const cur = pickCurrent(byRole.get(role) ?? []);
    setMemberId(cur?.member_id ?? "none");
    setEffectiveFrom(taipeiToday());
    setDialogRole(role);
  }

  async function submit() {
    if (!uid || !dialogRole) return;
    if (memberId === "none") return toast.error("請選擇人員");
    setSaving(true);
    const { error } = await (supabase as any).from("teamcommission_role_bindings").insert({
      role_type: dialogRole,
      member_id: memberId,
      effective_from: effectiveFrom,
      created_by: uid,
    });
    setSaving(false);
    if (error) return toast.error("新增版本失敗：" + error.message);
    toast.success("已新增版本");
    setDialogRole(null);
    onSaved();
  }

  function toggle(role: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(role) ? next.delete(role) : next.add(role);
      return next;
    });
  }

  const roleLabel = ROLE_TYPES.find((r) => r.type === dialogRole)?.label ?? "";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">角色綁定</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? null : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>角色</TableHead>
                <TableHead>目前綁定人員</TableHead>
                <TableHead>生效日</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ROLE_TYPES.map((r) => {
                const history = byRole.get(r.type) ?? [];
                const cur = pickCurrent(history);
                const isOpen = expanded.has(r.type);
                return (
                  <Fragment key={r.type}>
                    <TableRow>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => toggle(r.type)}>
                          {isOpen ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{r.label}</TableCell>
                      <TableCell>{cur ? memberName(cur.member_id) : "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {cur?.effective_from ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.type === "am_manager" || r.type === "closer_manager" ? (
                          <Button variant="ghost" size="icon" asChild title="前往成員管理設定">
                            <Link to="/team/members" aria-label="前往成員管理設定">
                              <ExternalLink className="h-4 w-4" />
                            </Link>
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => openDialog(r.type)}>
                            <Plus className="mr-1 h-4 w-4" />
                            新增版本
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow>
                        <TableCell colSpan={5} className="bg-muted/40">
                          {history.length === 0 ? (
                            <div className="py-2 text-sm text-muted-foreground">尚無版本紀錄</div>
                          ) : (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>生效日</TableHead>
                                  <TableHead>人員</TableHead>
                                  <TableHead>狀態</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {history.map((h) => (
                                  <TableRow key={h.id}>
                                    <TableCell className="whitespace-nowrap">
                                      {h.effective_from}
                                    </TableCell>
                                    <TableCell>{memberName(h.member_id)}</TableCell>
                                    <TableCell>
                                      {cur?.id === h.id ? (
                                        <Badge>目前生效</Badge>
                                      ) : h.effective_from > taipeiToday() ? (
                                        <Badge variant="outline">未來生效</Badge>
                                      ) : (
                                        <Badge variant="secondary">歷史</Badge>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={dialogRole != null} onOpenChange={(o) => !o && setDialogRole(null)}>
        <DialogContent className="overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>新增版本：{roleLabel}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>人員</Label>
              <Select value={memberId} onValueChange={setMemberId}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇人員" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">請選擇</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.display_name ?? m.id.slice(0, 8)}
                      {m.is_active === false ? "（已停用）" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>生效日</Label>
              <Input
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogRole(null)}>
              取消
            </Button>
            <Button onClick={submit} disabled={saving}>
              儲存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* --------------------------- (e) 場域簽約人 --------------------------- */

interface AccOption {
  id: string;
  name: string;
}

interface VenueAssignmentRow {
  id: string;
  accommodation_id: string;
  member_id: string;
  effective_from: string;
  created_at: string;
}

function VenueClosingAssignmentSection({
  members,
  memberName,
  uid,
}: {
  members: MemberOption[];
  memberName: (id: string) => string;
  uid: string | null;
}) {
  const [accs, setAccs] = useState<AccOption[]>([]);
  const [rows, setRows] = useState<VenueAssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialogAcc, setDialogAcc] = useState<string | null>(null);
  const [memberId, setMemberId] = useState<string>("none");
  const [effectiveFrom, setEffectiveFrom] = useState(taipeiToday());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [accRes, rowRes] = await Promise.all([
        supabase
          .from("accommodation_info")
          .select("id, name")
          .eq("is_active", true)
          .order("name", { ascending: true }),
        (supabase as any)
          .from("teamcommission_venue_closing_assignments")
          .select("id, accommodation_id, member_id, effective_from, created_at")
          .order("effective_from", { ascending: false }),
      ]);
      setAccs(
        ((accRes.data ?? []) as AccOption[]).filter(
          (a) => !String(a.name ?? "").startsWith("旅行日"),
        ),
      );
      setRows((rowRes.data ?? []) as VenueAssignmentRow[]);
    } catch (e: any) {
      toast.error("讀取場域簽約人失敗：" + (e?.message ?? ""));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const byAcc = useMemo(() => {
    const m = new Map<string, VenueAssignmentRow[]>();
    for (const r of rows) {
      const arr = m.get(r.accommodation_id) ?? [];
      arr.push(r);
      m.set(r.accommodation_id, arr);
    }
    for (const [, arr] of m) arr.sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
    return m;
  }, [rows]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function openDialog(accId: string) {
    const cur = pickCurrent(byAcc.get(accId) ?? []);
    setMemberId(cur?.member_id ?? "none");
    setEffectiveFrom(taipeiToday());
    setDialogAcc(accId);
  }

  async function submit() {
    if (!uid || !dialogAcc) return;
    if (memberId === "none") return toast.error("請選擇人員");
    setSaving(true);
    const { error } = await (supabase as any)
      .from("teamcommission_venue_closing_assignments")
      .insert({
        accommodation_id: dialogAcc,
        member_id: memberId,
        effective_from: effectiveFrom,
        created_by: uid,
      });
    setSaving(false);
    if (error) return toast.error("新增版本失敗：" + error.message);
    toast.success("已新增版本");
    setDialogAcc(null);
    load();
  }

  const accName = (id: string) => accs.find((a) => a.id === id)?.name ?? id.slice(0, 8);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">場域簽約人</CardTitle>
        <p className="text-sm text-muted-foreground">
          場域成交獎金以此指定的簽約人為發放對象（另需該館「收取行銷推廣費」為發放判斷基準）
        </p>
      </CardHeader>
      <CardContent>
        {loading ? null : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>館別</TableHead>
                <TableHead>目前簽約人</TableHead>
                <TableHead>生效日</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accs.map((a) => {
                const history = byAcc.get(a.id) ?? [];
                const cur = pickCurrent(history);
                const isOpen = expanded.has(a.id);
                return (
                  <Fragment key={a.id}>
                    <TableRow>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => toggle(a.id)}>
                          {isOpen ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{a.name}</TableCell>
                      <TableCell>{cur ? memberName(cur.member_id) : "尚無"}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {cur?.effective_from ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => openDialog(a.id)}>
                          <Plus className="mr-1 h-4 w-4" />
                          新增版本
                        </Button>
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow>
                        <TableCell colSpan={5} className="bg-muted/30">
                          {history.length === 0 ? (
                            <div className="py-2 text-sm text-muted-foreground">尚無歷史版本</div>
                          ) : (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>生效日</TableHead>
                                  <TableHead>簽約人</TableHead>
                                  <TableHead>狀態</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {history.map((r) => (
                                  <TableRow key={r.id}>
                                    <TableCell className="whitespace-nowrap">
                                      {r.effective_from}
                                    </TableCell>
                                    <TableCell>{memberName(r.member_id)}</TableCell>
                                    <TableCell>
                                      {cur?.id === r.id ? (
                                        <Badge>目前生效</Badge>
                                      ) : r.effective_from > taipeiToday() ? (
                                        <Badge variant="outline">未來生效</Badge>
                                      ) : (
                                        <Badge variant="secondary">歷史</Badge>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={!!dialogAcc} onOpenChange={(o) => !o && setDialogAcc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新增版本：{dialogAcc ? accName(dialogAcc) : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>簽約人</Label>
              <Select value={memberId} onValueChange={setMemberId}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇人員" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">未指定</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.display_name ?? m.id.slice(0, 8)}
                      {m.is_active === false ? "（停用）" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>生效日</Label>
              <Input
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAcc(null)}>
              取消
            </Button>
            <Button onClick={submit} disabled={saving}>
              儲存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* --------------------- (f) AM 場域總覽（唯讀） --------------------- */

function AmVenueOverviewSection() {
  const [accs, setAccs] = useState<AccOption[]>([]);
  const [amByAcc, setAmByAcc] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [accRes, roleRes] = await Promise.all([
          supabase
            .from("accommodation_info")
            .select("id, name")
            .eq("is_active", true)
            .order("name", { ascending: true }),
          supabase
            .from("user_roles")
            .select("user_id")
            .eq("role", "am")
            .is("accommodation_id", null),
        ]);

        setAccs(
          ((accRes.data ?? []) as AccOption[]).filter(
            (a) => !String(a.name ?? "").startsWith("旅行日"),
          ),
        );

        const userIds = Array.from(
          new Set(((roleRes.data ?? []) as { user_id: string }[]).map((r) => r.user_id).filter(Boolean)),
        );

        const map: Record<string, string[]> = {};
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from("team_member_profiles")
            .select("id, user_id, display_name, am_managed_accommodation_ids")
            .in("user_id", userIds);

          for (const p of (profiles ?? []) as {
            id: string;
            display_name: string | null;
            am_managed_accommodation_ids: string[] | null;
          }[]) {
            const name = p.display_name ?? p.id.slice(0, 8);
            for (const accId of p.am_managed_accommodation_ids ?? []) {
              if (!accId) continue;
              const list = map[accId] ?? [];
              list.push(name);
              map[accId] = list;
            }
          }
        }
        setAmByAcc(map);
      } catch (e: any) {
        toast.error("讀取 AM 場域總覽失敗：" + (e?.message ?? ""));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">AM 場域總覽</CardTitle>
        <p className="text-sm text-muted-foreground">
          逐館顯示目前負責的 AM（唯讀），如需調整請至成員管理設定
        </p>
      </CardHeader>
      <CardContent>
        {loading ? null : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>館別</TableHead>
                <TableHead>負責 AM</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accs.map((a) => {
                const names = amByAcc[a.id] ?? [];
                return (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap">{a.name}</TableCell>
                    <TableCell>
                      {names.length === 0 ? (
                        <span className="text-muted-foreground">尚無</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {names.map((n) => (
                            <Badge key={n} variant="secondary">
                              {n}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" asChild title="前往成員管理設定">
                        <a
                          href="/team/members"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="前往成員管理設定"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
