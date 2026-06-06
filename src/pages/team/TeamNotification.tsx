import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/components/team/TeamContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Accommodation {
  id: string;
  name: string;
}

interface FlagsRow {
  accommodation_id: string;
  has_franchise: boolean;
  has_starlink: boolean;
}

interface SettingsRow {
  accommodation_id: string;
  enabled: boolean;
  notify_time: string;
  show_general_booking: boolean;
  general_booking_target: number | null;
  show_franchise_sales: boolean;
  franchise_sales_target: number | null;
  franchise_sales_year_target: number | null;
  show_franchise_booking: boolean;
  franchise_booking_target: number | null;
  show_starlink: boolean;
  starlink_target: number | null;
  email_template: string | null;
}

const DEFAULT_SETTINGS: Omit<SettingsRow, "accommodation_id"> = {
  enabled: false,
  notify_time: "23:30",
  show_general_booking: true,
  general_booking_target: 400000,
  show_franchise_sales: false,
  franchise_sales_target: 6000000,
  franchise_sales_year_target: 24000000,
  show_franchise_booking: false,
  franchise_booking_target: 300000,
  show_starlink: false,
  starlink_target: null,
  email_template: "",
};

const TIME_OPTIONS = (() => {
  const arr: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      arr.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return arr;
})();

const TEMPLATE_VARS = [
  "{日期}",
  "{民宿名稱}",
  "{今日訂單}",
  "{今日取消筆數}",
  "{今日取消金額}",
  "{月累積}",
  "{月目標}",
  "{達成率}",
  "{前月累積}",
  "{年度累積}",
];

const DEFAULT_TEMPLATE = `{日期}

【{民宿名稱}進單業績】

今日訂單：{今日訂單}

今日訂單取消：{今日取消筆數} 筆，{今日取消金額}

本月累積訂房業績：{月累積}

目標訂房業績：{月目標}／月

本月訂房達成率：{達成率}%

前月累積訂房業績：{前月累積}

年度累積訂房金額：{年度累積}`;


export default function TeamNotification() {
  const { roles } = useTeam();
  const canAccess = roles.includes("super_admin") || roles.includes("admin");

  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [flags, setFlags] = useState<Record<string, FlagsRow>>({});
  const [settingsMap, setSettingsMap] = useState<Record<string, SettingsRow>>({});
  const [selectedId, setSelectedId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const templateRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!canAccess) return;
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccess]);

  const loadAll = async () => {
    const [accRes, flagRes, setRes] = await Promise.all([
      supabase.from("accommodation_info").select("id,name").order("name"),
      supabase.from("accommodation_info_flags").select("accommodation_id,has_franchise,has_starlink"),
      supabase.from("performance_notification_settings").select("*"),
    ]);
    if (accRes.error) return toast.error("載入館別失敗");
    const accs = (accRes.data || []) as Accommodation[];
    setAccommodations(accs);
    const fMap: Record<string, FlagsRow> = {};
    ((flagRes.data || []) as FlagsRow[]).forEach((f) => (fMap[f.accommodation_id] = f));
    setFlags(fMap);
    const sMap: Record<string, SettingsRow> = {};
    ((setRes.data || []) as SettingsRow[]).forEach((s) => (sMap[s.accommodation_id] = s));
    setSettingsMap(sMap);
    if (accs.length > 0 && !selectedId) setSelectedId(accs[0].id);
  };

  const current = useMemo<SettingsRow | null>(() => {
    if (!selectedId) return null;
    return (
      settingsMap[selectedId] || {
        accommodation_id: selectedId,
        ...DEFAULT_SETTINGS,
      }
    );
  }, [selectedId, settingsMap]);

  const currentFlags = selectedId ? flags[selectedId] : undefined;
  const hasFranchise = !!currentFlags?.has_franchise;
  const hasStarlink = !!currentFlags?.has_starlink;

  const patchCurrent = (patch: Partial<SettingsRow>) => {
    if (!selectedId) return;
    setSettingsMap((prev) => ({
      ...prev,
      [selectedId]: {
        ...(prev[selectedId] || { accommodation_id: selectedId, ...DEFAULT_SETTINGS }),
        ...patch,
      },
    }));
  };

  const handleSave = async () => {
    if (!current) return;
    setSaving(true);
    const payload = {
      accommodation_id: current.accommodation_id,
      enabled: current.enabled,
      notify_time: current.notify_time,
      show_general_booking: current.show_general_booking,
      general_booking_target: current.general_booking_target,
      show_franchise_sales: hasFranchise ? current.show_franchise_sales : false,
      franchise_sales_target: hasFranchise ? current.franchise_sales_target : null,
      franchise_sales_year_target: hasFranchise ? current.franchise_sales_year_target : null,
      show_franchise_booking: hasFranchise ? current.show_franchise_booking : false,
      franchise_booking_target: hasFranchise ? current.franchise_booking_target : null,
      show_starlink: hasStarlink ? current.show_starlink : false,
      starlink_target: hasStarlink ? current.starlink_target : null,

      email_template: current.email_template,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from("performance_notification_settings")
      .upsert(payload, { onConflict: "accommodation_id" });
    setSaving(false);
    if (error) {
      toast.error("儲存失敗：" + error.message);
      return;
    }
    toast.success("已儲存");
    await loadAll();
  };

  const insertVar = (v: string) => {
    const el = templateRef.current;
    const tmpl = current?.email_template || DEFAULT_TEMPLATE;
    if (!el) {
      patchCurrent({ email_template: tmpl + v });
      return;
    }
    const start = el.selectionStart ?? tmpl.length;
    const end = el.selectionEnd ?? tmpl.length;
    const next = tmpl.slice(0, start) + v + tmpl.slice(end);
    patchCurrent({ email_template: next });

    requestAnimationFrame(() => {
      el.focus();
      const pos = start + v.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const toggleFlag = async (accId: string, field: "has_franchise" | "has_starlink", value: boolean) => {
    const existing = flags[accId];
    const payload = {
      accommodation_id: accId,
      has_franchise: existing?.has_franchise ?? false,
      has_starlink: existing?.has_starlink ?? false,
      [field]: value,
      updated_at: new Date().toISOString(),
    };
    setFlags((prev) => ({ ...prev, [accId]: { ...payload } as FlagsRow }));
    const { error } = await supabase
      .from("accommodation_info_flags")
      .upsert(payload, { onConflict: "accommodation_id" });
    if (error) {
      toast.error("更新失敗：" + error.message);
      void loadAll();
    } else {
      toast.success("已更新");
    }
  };

  if (!canAccess) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">業績通報設定</h2>
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            您沒有權限訪問此頁面
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">業績通報設定</h2>

      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4">
        {/* Left list */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">館別列表</CardTitle>
          </CardHeader>
          <CardContent className="p-2 space-y-1 max-h-[70vh] overflow-auto">
            {accommodations.map((a) => {
              const s = settingsMap[a.id];
              const enabled = !!s?.enabled;
              const active = selectedId === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedId(a.id)}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2 rounded-md text-left text-sm transition-colors",
                    active ? "bg-primary/10 text-primary" : "hover:bg-muted",
                  )}
                >
                  <span className="truncate">{a.name}</span>
                  <Badge variant={enabled ? "success" : "secondary"} className="shrink-0 ml-2">
                    {enabled ? "啟用" : "停用"}
                  </Badge>
                </button>
              );
            })}
            {accommodations.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">無資料</p>
            )}
          </CardContent>
        </Card>

        {/* Right settings */}
        <Card>
          {current ? (
            <>
              <CardHeader>
                <CardTitle className="text-base">
                  {accommodations.find((a) => a.id === selectedId)?.name} — 通報設定
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Basic */}
                <section className="space-y-4">
                  <h3 className="font-semibold">基本設定</h3>
                  <div className="flex items-center justify-between">
                    <Label>啟用每日通報</Label>
                    <Switch
                      checked={current.enabled}
                      onCheckedChange={(v) => patchCurrent({ enabled: v })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>通報時間</Label>
                    <Select
                      value={current.notify_time}
                      onValueChange={(v) => patchCurrent({ notify_time: v })}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        {TIME_OPTIONS.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      ⚠️ 注意：通報時間為系統發送 Email 的時間。LINE 群收到訊息因轉接關係，實際時間可能延遲數分鐘，屬正常現象。
                    </p>
                  </div>
                </section>

                {/* Content */}
                <section className="space-y-4">
                  <h3 className="font-semibold">通報內容設定</h3>

                  <div className="space-y-2 border rounded-md p-3">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="show_general_booking"
                        checked={current.show_general_booking}
                        onCheckedChange={(v) =>
                          patchCurrent({ show_general_booking: !!v })
                        }
                      />
                      <Label htmlFor="show_general_booking">一般訂房業績</Label>
                    </div>
                    {current.show_general_booking && (
                      <div className="pl-7 space-y-1">
                        <Label className="text-xs">月目標金額</Label>
                        <Input
                          type="number"
                          value={current.general_booking_target ?? ""}
                          onChange={(e) =>
                            patchCurrent({
                              general_booking_target: e.target.value === "" ? null : Number(e.target.value),
                            })
                          }
                        />
                      </div>
                    )}
                  </div>

                  {hasFranchise && (
                    <>
                      <div className="space-y-2 border rounded-md p-3">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="show_franchise_sales"
                            checked={current.show_franchise_sales}
                            onCheckedChange={(v) =>
                              patchCurrent({ show_franchise_sales: !!v })
                            }
                          />
                          <Label htmlFor="show_franchise_sales">特許加盟銷售</Label>
                        </div>
                        {current.show_franchise_sales && (
                          <div className="pl-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs">月目標銷售</Label>
                              <Input
                                type="number"
                                value={current.franchise_sales_target ?? ""}
                                onChange={(e) =>
                                  patchCurrent({
                                    franchise_sales_target:
                                      e.target.value === "" ? null : Number(e.target.value),
                                  })
                                }
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">年度目標銷售</Label>
                              <Input
                                type="number"
                                value={current.franchise_sales_year_target ?? ""}
                                onChange={(e) =>
                                  patchCurrent({
                                    franchise_sales_year_target:
                                      e.target.value === "" ? null : Number(e.target.value),
                                  })
                                }
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="space-y-2 border rounded-md p-3">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="show_franchise_booking"
                            checked={current.show_franchise_booking}
                            onCheckedChange={(v) =>
                              patchCurrent({ show_franchise_booking: !!v })
                            }
                          />
                          <Label htmlFor="show_franchise_booking">特許加盟訂房業績</Label>
                        </div>
                        {current.show_franchise_booking && (
                          <div className="pl-7 space-y-1">
                            <Label className="text-xs">月目標</Label>
                            <Input
                              type="number"
                              value={current.franchise_booking_target ?? ""}
                              onChange={(e) =>
                                patchCurrent({
                                  franchise_booking_target:
                                    e.target.value === "" ? null : Number(e.target.value),
                                })
                              }
                            />
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {hasStarlink && (
                    <div className="space-y-2 border rounded-md p-3">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="show_starlink"
                          checked={current.show_starlink}
                          onCheckedChange={(v) => patchCurrent({ show_starlink: !!v })}
                        />
                        <Label htmlFor="show_starlink">星鏈業績</Label>
                      </div>
                      {current.show_starlink && (
                        <div className="pl-7 space-y-1">
                          <Label className="text-xs">月目標</Label>
                          <Input
                            type="number"
                            value={current.starlink_target ?? ""}
                            onChange={(e) =>
                              patchCurrent({
                                starlink_target:
                                  e.target.value === "" ? null : Number(e.target.value),
                              })
                            }
                          />
                        </div>
                      )}
                    </div>
                  )}
                </section>

                {/* Email */}
                <section className="space-y-2">
                  <h3 className="font-semibold">Email 通知</h3>
                  <p className="text-sm text-muted-foreground">
                    Email 固定發送至：<span className="font-mono">service@lakeze.com</span>
                  </p>
                </section>

                {/* Template */}
                <section className="space-y-2">
                  <h3 className="font-semibold">通知模板</h3>
                  <div className="flex flex-wrap gap-1">
                    {TEMPLATE_VARS.map((v) => (
                      <Badge
                        key={v}
                        variant="outline"
                        className="cursor-pointer hover:bg-muted"
                        onClick={() => insertVar(v)}
                      >
                        {v}
                      </Badge>
                    ))}
                  </div>
                  <Textarea
                    ref={templateRef}
                    rows={10}
                    value={current.email_template ? current.email_template : DEFAULT_TEMPLATE}
                    onChange={(e) => patchCurrent({ email_template: e.target.value })}
                    placeholder="留空則使用系統預設模板"
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    留空則使用系統預設模板。可用變數：{TEMPLATE_VARS.join("、")}
                  </p>
                </section>

                <div className="flex justify-end">
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? "儲存中..." : "儲存設定"}
                  </Button>
                </div>
              </CardContent>
            </>
          ) : (
            <CardContent className="py-16 text-center text-muted-foreground">
              請從左側選擇館別
            </CardContent>
          )}
        </Card>
      </div>

      {/* Flags table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">館別特殊屬性</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>館別名稱</TableHead>
                <TableHead className="w-40">有特許加盟業務</TableHead>
                <TableHead className="w-40">有星鏈業務</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accommodations.map((a) => {
                const f = flags[a.id];
                return (
                  <TableRow key={a.id}>
                    <TableCell>{a.name}</TableCell>
                    <TableCell>
                      <Switch
                        checked={!!f?.has_franchise}
                        onCheckedChange={(v) => toggleFlag(a.id, "has_franchise", v)}
                      />
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={!!f?.has_starlink}
                        onCheckedChange={(v) => toggleFlag(a.id, "has_starlink", v)}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
