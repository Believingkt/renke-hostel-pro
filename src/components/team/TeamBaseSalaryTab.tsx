import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2 } from "lucide-react";

interface SalaryVersion {
  id: string;
  user_id: string;
  amount: number;
  effective_from: string;
  note: string | null;
  created_at: string;
  created_by_email: string | null;
}

interface MemberRow {
  user_id: string;
  display_name: string;
}

function todayTaipei() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function firstOfThisMonthTaipei() {
  return `${todayTaipei().slice(0, 7)}-01`;
}

function fmtTime(iso: string) {
  const d = new Date(new Date(iso).getTime() + 8 * 3600 * 1000);
  return d.toISOString().slice(0, 16).replace("T", " ");
}

/**
 * 成員底薪設定（總部限定）— 版本制。
 * 一位成員只需在「調整當下」新增一筆生效日版本，之後每個月自動沿用，
 * 直到有更新的生效日版本為止。歷史版本不可修改（append-only），
 * 未生效的版本才能刪除。每筆版本都記錄建立者與建立時間。
 */
export default function TeamBaseSalaryTab() {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [versions, setVersions] = useState<SalaryVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, { amount: string; effective_from: string; note: string }>>({});

  const load = async () => {
    setLoading(true);
    const [{ data: profiles }, { data: rows }] = await Promise.all([
      supabase.from("team_member_profiles").select("user_id, display_name"),
      supabase
        .from("team_base_salaries")
        .select("id, user_id, amount, effective_from, note, created_at, created_by_email")
        .order("effective_from", { ascending: false }),
    ]);
    setMembers(
      ((profiles ?? []) as any[])
        .filter((p) => p?.user_id)
        .map((p) => ({ user_id: p.user_id as string, display_name: (p.display_name as string) || "未命名" }))
        .sort((a, b) => a.display_name.localeCompare(b.display_name, "zh-Hant")),
    );
    setVersions((rows ?? []) as any as SalaryVersion[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const byUser = useMemo(() => {
    const m = new Map<string, SalaryVersion[]>();
    versions.forEach((v) => {
      const list = m.get(v.user_id) ?? [];
      list.push(v);
      m.set(v.user_id, list);
    });
    return m;
  }, [versions]);

  const today = todayTaipei();

  const currentAmount = (userId: string) => {
    const list = byUser.get(userId) ?? [];
    const eff = list.find((v) => v.effective_from <= today);
    return eff ? Number(eff.amount) : null;
  };

  const totalCurrent = members.reduce((s, m) => s + (currentAmount(m.user_id) ?? 0), 0);

  const addVersion = async (userId: string) => {
    const d = draft[userId];
    if (!d || d.amount === "") {
      toast({ title: "請先輸入底薪金額", variant: "destructive" });
      return;
    }
    setSavingId(userId);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("team_base_salaries").insert({
      user_id: userId,
      amount: Number(d.amount || 0),
      effective_from: d.effective_from || firstOfThisMonthTaipei(),
      note: d.note || null,
      created_by: userData?.user?.id ?? null,
      created_by_email: userData?.user?.email ?? null,
    });
    setSavingId(null);
    if (error) {
      toast({
        title: "新增失敗",
        description: error.message.includes("duplicate")
          ? "同一位成員的同一個生效日已存在版本"
          : error.message,
        variant: "destructive",
      });
      return;
    }
    setDraft((p) => ({ ...p, [userId]: { amount: "", effective_from: firstOfThisMonthTaipei(), note: "" } }));
    toast({ title: "已新增底薪版本" });
    load();
  };

  const removeVersion = async (v: SalaryVersion) => {
    const { error } = await supabase.from("team_base_salaries").delete().eq("id", v.id);
    if (error) {
      toast({ title: "刪除失敗", description: "只有尚未生效的版本可以刪除", variant: "destructive" });
      return;
    }
    toast({ title: "已刪除未生效版本" });
    load();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>成員底薪設定（版本制）</CardTitle>
        <CardDescription>
          不需要每個月重設：只在「底薪有調整」時新增一筆版本並指定生效日，系統會自動沿用到下一次調整。
          底薪會顯示在月結期（每月 10 日期）的 TeamHome 總收入旁，並註明實際領款時須扣除勞健保相關金額。
          已建立的版本為存證紀錄不可修改，僅未生效版本可刪除；每筆版本都會記錄建立者與建立時間。
          此頁僅總部管理員可讀寫。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground tabular-nums">
          目前生效底薪合計 ${totalCurrent.toLocaleString()}
        </p>

        {loading ? (
          <p className="text-sm text-muted-foreground">讀取中…</p>
        ) : (
          <div className="space-y-3">
            {members.map((m) => {
              const list = byUser.get(m.user_id) ?? [];
              const cur = currentAmount(m.user_id);
              const d = draft[m.user_id] ?? {
                amount: "",
                effective_from: firstOfThisMonthTaipei(),
                note: "",
              };
              return (
                <div key={m.user_id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{m.display_name}</span>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      目前底薪 {cur === null ? "未設定" : `$${cur.toLocaleString()}`}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Input
                      type="number"
                      inputMode="numeric"
                      placeholder="新底薪"
                      value={d.amount}
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, [m.user_id]: { ...d, amount: e.target.value } }))
                      }
                      className="h-9 w-32 tabular-nums"
                    />
                    <Input
                      type="date"
                      value={d.effective_from}
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, [m.user_id]: { ...d, effective_from: e.target.value } }))
                      }
                      className="h-9 w-40"
                    />
                    <Input
                      placeholder="備註（選填）"
                      value={d.note}
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, [m.user_id]: { ...d, note: e.target.value } }))
                      }
                      className="h-9 flex-1 min-w-[8rem]"
                    />
                    <Button size="sm" onClick={() => addVersion(m.user_id)} disabled={savingId === m.user_id}>
                      {savingId === m.user_id ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="mr-1 h-4 w-4" />
                      )}
                      新增版本
                    </Button>
                  </div>

                  {list.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {list.map((v) => {
                        const future = v.effective_from > today;
                        return (
                          <li key={v.id} className="flex flex-wrap items-center gap-2">
                            <span className="tabular-nums">
                              {v.effective_from} 起 ${Number(v.amount).toLocaleString()}
                            </span>
                            {future && <span className="text-primary">（未生效）</span>}
                            {v.note && <span>· {v.note}</span>}
                            <span>
                              · 由 {v.created_by_email ?? "未知"} 於 {fmtTime(v.created_at)} 設定
                            </span>
                            {future && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-1"
                                onClick={() => removeVersion(v)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
