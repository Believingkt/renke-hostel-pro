import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Save, AlertTriangle, Download, Copy, FileDown } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Accommodation {
  id: string;
  name: string;
}

interface OwltingConfig {
  id?: string;
  accommodation_id: string;
  owlting_hotel_code: string | null;
  sync_enabled: boolean;
  last_successful_sync_at: string | null;
}

interface RoomType {
  id: string;
  accommodation_id: string;
  name: string;
  numeric_code: number | null;
  capacity: number | null;
  is_exclusive_package: boolean | null;
}

interface PackageRow {
  id: string;
  accommodation_id: string;
  name: string;
  numeric_code: number | null;
  room_type_ids: string[] | null;
  sale_price: number | null;
}

interface PricingTemplate {
  id: string;
  accommodation_id: string;
  template_name: string;
  default_package_id: string | null;
  room_type_id: string | null;
  weekday_price: number | null;
}

interface OwltingGroup {
  id: string;
  accommodation_id: string;
  canonical_room_type_id: string | null;
  canonical_name: string;
}

interface OwltingGroupMember {
  id: string;
  group_id: string;
  room_type_id: string | null;
  rate_plan_template_id: string | null;
  rate_plan_name: string | null;
  display_order: number | null;
}

interface OwltingRoomTypeSync {
  accommodation_id: string;
  room_type_id: string;
  sync_enabled: boolean;
}


export function OwlTingAccommodationConfig() {
  const [loading, setLoading] = useState(true);
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [configs, setConfigs] = useState<Record<string, OwltingConfig>>({});
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [templates, setTemplates] = useState<PricingTemplate[]>([]);
  const [groups, setGroups] = useState<OwltingGroup[]>([]);
  const [groupMembers, setGroupMembers] = useState<OwltingGroupMember[]>([]);
  const [roomTypeSync, setRoomTypeSync] = useState<OwltingRoomTypeSync[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [hotelCodeDrafts, setHotelCodeDrafts] = useState<Record<string, string>>({});
  const [pendingToggle, setPendingToggle] = useState<{ accId: string; nextValue: boolean } | null>(null);
  const [exportAccId, setExportAccId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [accRes, cfgRes, rtRes, pkgRes, tplRes, grpRes, memRes, syncRes] = await Promise.all([
      supabase.from("accommodation_info").select("id, name").eq("is_active", true).order("display_order"),
      supabase.from("accommodation_owlting_config").select("id, accommodation_id, owlting_hotel_code, sync_enabled, last_successful_sync_at"),
      supabase.from("room_types").select("id, accommodation_id, name, numeric_code, capacity, is_exclusive_package").order("display_order"),
      supabase.from("accommodation_packages").select("id, accommodation_id, name, numeric_code, enabled, room_type_ids, sale_price").order("display_order"),
      supabase.from("pricing_templates").select("id, accommodation_id, template_name, default_package_id, room_type_id, weekday_price").order("display_order"),
      supabase.from("owlting_room_type_groups").select("id, accommodation_id, canonical_room_type_id, canonical_name").order("display_order"),
      supabase.from("owlting_room_type_group_members").select("id, group_id, room_type_id, rate_plan_template_id, rate_plan_name, display_order").order("display_order"),
      supabase.from("owlting_room_type_sync").select("accommodation_id, room_type_id, sync_enabled"),
    ]);

    if (accRes.error) toast.error("載入民宿失敗：" + accRes.error.message);
    if (cfgRes.error) toast.error("載入奧丁丁設定失敗：" + cfgRes.error.message);

    const accs = (accRes.data ?? []) as Accommodation[];
    setAccommodations(accs);

    const cfgMap: Record<string, OwltingConfig> = {};
    (cfgRes.data ?? []).forEach((c: any) => {
      cfgMap[c.accommodation_id] = c;
    });
    setConfigs(cfgMap);

    const drafts: Record<string, string> = {};
    accs.forEach((a) => {
      drafts[a.id] = cfgMap[a.id]?.owlting_hotel_code ?? "";
    });
    setHotelCodeDrafts(drafts);

    setRoomTypes((rtRes.data ?? []) as RoomType[]);
    setPackages(((pkgRes.data ?? []) as any[]).filter((p) => p.enabled !== false));
    setTemplates((tplRes.data ?? []) as PricingTemplate[]);
    setGroups((grpRes.data ?? []) as OwltingGroup[]);
    setGroupMembers((memRes.data ?? []) as OwltingGroupMember[]);
    setRoomTypeSync((syncRes.data ?? []) as OwltingRoomTypeSync[]);

    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const grouped = useMemo(() => {
    return accommodations.map((a) => ({
      acc: a,
      cfg: configs[a.id],
      roomTypes: roomTypes.filter((r) => r.accommodation_id === a.id),
      packages: packages.filter((p) => p.accommodation_id === a.id),
      templates: templates.filter((t) => t.accommodation_id === a.id),
    }));
  }, [accommodations, configs, roomTypes, packages, templates]);

  const upsertConfig = async (accId: string, patch: Partial<OwltingConfig>) => {
    setSavingId(accId);
    const existing = configs[accId];
    const payload: any = {
      accommodation_id: accId,
      owlting_hotel_code: patch.owlting_hotel_code ?? existing?.owlting_hotel_code ?? null,
      sync_enabled: patch.sync_enabled ?? existing?.sync_enabled ?? false,
    };
    let res;
    if (existing?.id) {
      res = await supabase
        .from("accommodation_owlting_config")
        .update(payload)
        .eq("id", existing.id)
        .select("id, accommodation_id, owlting_hotel_code, sync_enabled, last_successful_sync_at")
        .maybeSingle();
    } else {
      res = await supabase
        .from("accommodation_owlting_config")
        .insert(payload)
        .select("id, accommodation_id, owlting_hotel_code, sync_enabled, last_successful_sync_at")
        .maybeSingle();
    }
    setSavingId(null);
    if (res.error) {
      toast.error("儲存失敗：" + res.error.message);
      return false;
    }
    if (res.data) {
      setConfigs((prev) => ({ ...prev, [accId]: res.data as OwltingConfig }));
    }
    toast.success("已儲存");
    return true;
  };

  const handleToggle = (accId: string, value: boolean) => {
    setPendingToggle({ accId, nextValue: value });
  };

  const confirmToggle = async () => {
    if (!pendingToggle) return;
    const { accId, nextValue } = pendingToggle;
    setPendingToggle(null);
    await upsertConfig(accId, { sync_enabled: nextValue });
  };

  const handleSaveHotelCode = async (accId: string) => {
    const draft = (hotelCodeDrafts[accId] ?? "").trim();
    await upsertConfig(accId, { owlting_hotel_code: draft || null });
  };

  const handleSetDefaultPackage = async (templateId: string, packageId: string | null) => {
    const { error } = await supabase
      .from("pricing_templates")
      .update({ default_package_id: packageId })
      .eq("id", templateId);
    if (error) {
      toast.error("更新失敗：" + error.message);
      return;
    }
    setTemplates((prev) => prev.map((t) => (t.id === templateId ? { ...t, default_package_id: packageId } : t)));
    toast.success("方案對應已更新");
  };

  // ============ Export mapping ============
  const buildExport = (accId: string) => {
    const acc = accommodations.find((a) => a.id === accId);
    const cfg = configs[accId];
    const rts = roomTypes.filter((r) => r.accommodation_id === accId);
    const pkgs = packages.filter((p) => p.accommodation_id === accId);
    const grps = groups.filter((g) => g.accommodation_id === accId);
    const syncMap = new Map(
      roomTypeSync
        .filter((s) => s.accommodation_id === accId)
        .map((s) => [s.room_type_id, s.sync_enabled])
    );
    const isRtSynced = (rtId: string) => syncMap.get(rtId) ?? true; // default sync

    // build per-group canonical info & members with rate plan numeric code (via template.default_package_id)
    const groupsData = grps.map((g) => {
      const canonical = rts.find((r) => r.id === g.canonical_room_type_id);
      const mems = groupMembers
        .filter((m) => m.group_id === g.id)
        .map((m) => {
          const memRt = rts.find((r) => r.id === m.room_type_id);
          const tpl = templates.find((t) => t.id === m.rate_plan_template_id);
          const pkg = tpl?.default_package_id ? packages.find((p) => p.id === tpl.default_package_id) : null;
          return {
            member_room_type_name: memRt?.name ?? "(未知)",
            member_room_type_code: memRt?.numeric_code ?? null,
            capacity: memRt?.capacity ?? null,
            rate_plan_name: m.rate_plan_name ?? pkg?.name ?? tpl?.template_name ?? "(未設定)",
            rate_plan_code: pkg?.numeric_code ?? null,
          };
        });
      return {
        canonical_name: g.canonical_name,
        canonical_code: canonical?.numeric_code ?? null,
        members: mems,
      };
    });

    // for each room type: which group canonical it belongs to (as member)
    const rtGroupMap = new Map<string, { canonical_name: string; canonical_code: number | null }>();
    grps.forEach((g) => {
      const canonical = rts.find((r) => r.id === g.canonical_room_type_id);
      groupMembers
        .filter((m) => m.group_id === g.id && m.room_type_id)
        .forEach((m) => {
          rtGroupMap.set(m.room_type_id!, {
            canonical_name: g.canonical_name,
            canonical_code: canonical?.numeric_code ?? null,
          });
        });
    });

    return {
      acc,
      cfg,
      rts: rts.map((r) => ({
        ...r,
        synced: isRtSynced(r.id),
        group: rtGroupMap.get(r.id) ?? null,
      })),
      pkgs: pkgs.map((p) => ({
        ...p,
        room_type_names: (p.room_type_ids ?? [])
          .map((id) => rts.find((r) => r.id === id)?.name)
          .filter(Boolean) as string[],
      })),
      groupsData,
    };
  };

  const buildPlainText = (accId: string) => {
    const d = buildExport(accId);
    if (!d.acc) return "";
    const lines: string[] = [];
    lines.push(`【物業】${d.acc.name}　HotelCode：${d.cfg?.owlting_hotel_code ?? "(未設定)"}　同步：${d.cfg?.sync_enabled ? "開啟" : "關閉"}`);
    lines.push(
      `【房型】` +
        (d.rts.length === 0
          ? "無"
          : d.rts
              .map(
                (r) =>
                  `${r.name}(${r.numeric_code ?? "無代碼"})${r.is_exclusive_package ? "[包棟]" : ""}${r.synced ? "" : "[不同步]"}`
              )
              .join(" / "))
    );
    lines.push(
      `【方案】` +
        (d.pkgs.length === 0
          ? "無"
          : d.pkgs.map((p) => `${p.name}=${p.numeric_code ?? "無代碼"}`).join("、"))
    );
    if (d.groupsData.length > 0) {
      d.groupsData.forEach((g) => {
        lines.push(
          `【包區群組】${g.canonical_name}=canonical ${g.canonical_code ?? "無代碼"}，底下 ` +
            g.members
              .map((m) => `${m.capacity ?? "?"}人=${m.rate_plan_code ?? "無代碼"}`)
              .join("、")
        );
      });
    }
    return lines.join("\n");
  };

  const buildCsv = (accId: string) => {
    const d = buildExport(accId);
    if (!d.acc) return "";
    const esc = (v: any) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows: string[] = [];
    rows.push(`# 物業資訊`);
    rows.push(`名稱,HotelCode,sync_enabled`);
    rows.push([d.acc.name, d.cfg?.owlting_hotel_code ?? "", d.cfg?.sync_enabled ? "TRUE" : "FALSE"].map(esc).join(","));
    rows.push("");
    rows.push(`# 房型清單`);
    rows.push(`名稱,numeric_code(RoomTypeCode),capacity,is_exclusive_package,是否同步,所屬群組canonical名稱,所屬群組canonical代碼`);
    d.rts.forEach((r) =>
      rows.push(
        [
          r.name,
          r.numeric_code ?? "",
          r.capacity ?? "",
          r.is_exclusive_package ? "TRUE" : "FALSE",
          r.synced ? "同步" : "不同步",
          r.group?.canonical_name ?? "",
          r.group?.canonical_code ?? "",
        ]
          .map(esc)
          .join(",")
      )
    );
    rows.push("");
    rows.push(`# 方案清單`);
    rows.push(`名稱,numeric_code(RatePlanCode),涵蓋房型,平日售價(sale_price)`);
    d.pkgs.forEach((p) =>
      rows.push(
        [p.name, p.numeric_code ?? "", p.room_type_names.join(" | "), p.sale_price ?? ""].map(esc).join(",")
      )
    );
    if (d.groupsData.length > 0) {
      rows.push("");
      rows.push(`# 包區群組`);
      rows.push(`canonical名稱,canonical代碼,成員房型,成員人數,成員方案名稱,成員方案代碼`);
      d.groupsData.forEach((g) => {
        g.members.forEach((m) =>
          rows.push(
            [
              g.canonical_name,
              g.canonical_code ?? "",
              m.member_room_type_name,
              m.capacity ?? "",
              m.rate_plan_name,
              m.rate_plan_code ?? "",
            ]
              .map(esc)
              .join(",")
          )
        );
      });
    }
    return rows.join("\n");
  };

  const handleCopyText = async () => {
    if (!exportAccId) return;
    const text = buildPlainText(exportAccId);
    try {
      await navigator.clipboard.writeText(text);
      toast.success("已複製對應清單");
    } catch {
      toast.error("複製失敗，請手動選取");
    }
  };

  const handleDownloadCsv = () => {
    if (!exportAccId) return;
    const acc = accommodations.find((a) => a.id === exportAccId);
    const csv = buildCsv(exportAccId);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `owlting-mapping-${acc?.name ?? exportAccId}-${format(new Date(), "yyyyMMdd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportData = exportAccId ? buildExport(exportAccId) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>奧丁丁物業設定</CardTitle>
          <CardDescription>
            管理各物業的奧丁丁 Hotel Code、訂單即時同步開關，並檢視房型 / 方案代碼與價格方案對應（交付奧丁丁 mapping 用）。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[160px]">物業名</TableHead>
                <TableHead className="min-w-[220px]">Owlting Hotel Code</TableHead>
                <TableHead className="w-[140px]">同步狀態</TableHead>
                <TableHead className="min-w-[160px]">最近成功同步</TableHead>
                <TableHead className="w-[180px]">動作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grouped.map(({ acc, cfg }) => {
                const draft = hotelCodeDrafts[acc.id] ?? "";
                const dirty = draft !== (cfg?.owlting_hotel_code ?? "");
                return (
                  <TableRow key={acc.id}>
                    <TableCell className="font-medium">{acc.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Input
                          value={draft}
                          onChange={(e) =>
                            setHotelCodeDrafts((prev) => ({ ...prev, [acc.id]: e.target.value }))
                          }
                          placeholder="奧丁丁分配的 Hotel Code"
                          className="max-w-[200px]"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!dirty || savingId === acc.id}
                          onClick={() => handleSaveHotelCode(acc.id)}
                        >
                          {savingId === acc.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Save className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={!!cfg?.sync_enabled}
                          onCheckedChange={(v) => handleToggle(acc.id, v)}
                          disabled={savingId === acc.id}
                        />
                        <Badge variant={cfg?.sync_enabled ? "default" : "secondary"}>
                          {cfg?.sync_enabled ? "開啟" : "關閉"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {cfg?.last_successful_sync_at
                        ? format(new Date(cfg.last_successful_sync_at), "yyyy-MM-dd HH:mm")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => setExportAccId(acc.id)}>
                        <Download className="h-3.5 w-3.5 mr-1" />
                        匯出對應清單
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>房型 / 方案代碼 與 方案對應</CardTitle>
          <CardDescription>
            房型與方案 numeric_code 唯讀；可設定每個價格範本（pricing_templates）的預設方案（default_package_id）。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" className="w-full">
            {grouped.map(({ acc, roomTypes: rts, packages: pkgs, templates: tpls }) => (
              <AccordionItem key={acc.id} value={acc.id}>
                <AccordionTrigger>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{acc.name}</span>
                    <Badge variant="outline">房型 {rts.length}</Badge>
                    <Badge variant="outline">方案 {pkgs.length}</Badge>
                    <Badge variant="outline">範本 {tpls.length}</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-6">
                  <div>
                    <Label className="text-sm font-semibold">房型代碼（唯讀）</Label>
                    <Table className="mt-2">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[100px]">numeric_code</TableHead>
                          <TableHead>名稱</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rts.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={2} className="text-sm text-muted-foreground">
                              無房型
                            </TableCell>
                          </TableRow>
                        ) : (
                          rts.map((rt) => (
                            <TableRow key={rt.id}>
                              <TableCell className="font-mono text-sm">
                                {rt.numeric_code ?? (
                                  <span className="text-destructive flex items-center gap-1">
                                    <AlertTriangle className="h-3 w-3" /> 未設定
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>{rt.name}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  <div>
                    <Label className="text-sm font-semibold">方案代碼（唯讀）</Label>
                    <Table className="mt-2">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[100px]">numeric_code</TableHead>
                          <TableHead>名稱</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pkgs.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={2} className="text-sm text-muted-foreground">
                              無方案
                            </TableCell>
                          </TableRow>
                        ) : (
                          pkgs.map((p) => (
                            <TableRow key={p.id}>
                              <TableCell className="font-mono text-sm">
                                {p.numeric_code ?? (
                                  <span className="text-destructive flex items-center gap-1">
                                    <AlertTriangle className="h-3 w-3" /> 未設定
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>{p.name}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  <div>
                    <Label className="text-sm font-semibold">方案對應 (default_package_id)</Label>
                    <Table className="mt-2">
                      <TableHeader>
                        <TableRow>
                          <TableHead>範本名稱</TableHead>
                          <TableHead className="w-[280px]">預設方案</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tpls.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={2} className="text-sm text-muted-foreground">
                              無價格範本
                            </TableCell>
                          </TableRow>
                        ) : (
                          (() => {
                            const rtName = (id: string | null) =>
                              rts.find((r) => r.id === id)?.name ?? "未指定房型";
                            const baseLabels = new Map<string, string>();
                            tpls.forEach((t) => {
                              baseLabels.set(t.id, `${rtName(t.room_type_id)} · ${t.template_name}`);
                            });
                            const counts = new Map<string, number>();
                            baseLabels.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
                            const finalLabel = (t: PricingTemplate) => {
                              const base = baseLabels.get(t.id)!;
                              if ((counts.get(base) ?? 0) > 1) {
                                const price = t.weekday_price != null
                                  ? `平日 NT$${Number(t.weekday_price).toLocaleString()}`
                                  : "未設平日價";
                                return `${base} · ${price}`;
                              }
                              return base;
                            };
                            return tpls.map((t) => {
                              const unset = !t.default_package_id;
                              return (
                                <TableRow
                                  key={t.id}
                                  className={unset ? "bg-amber-50 dark:bg-amber-950/20" : ""}
                                >
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      {finalLabel(t)}
                                      {unset && (
                                        <Badge variant="destructive" className="gap-1">
                                          <AlertTriangle className="h-3 w-3" /> 未設定
                                        </Badge>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <Select
                                      value={t.default_package_id ?? "none"}

                                    onValueChange={(v) =>
                                      handleSetDefaultPackage(t.id, v === "none" ? null : v)
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="選擇方案" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">未設定</SelectItem>
                                      {pkgs.map((p) => (
                                        <SelectItem key={p.id} value={p.id}>
                                          {p.name}
                                          {p.numeric_code != null ? `（#${p.numeric_code}）` : ""}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                              </TableRow>
                            );
                          });
                          })()
                        )}

                      </TableBody>
                    </Table>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      <AlertDialog open={!!pendingToggle} onOpenChange={(o) => !o && setPendingToggle(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingToggle?.nextValue ? "確認開啟奧丁丁同步？" : "確認關閉奧丁丁同步？"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingToggle?.nextValue
                ? "開啟＝該物業訂單會即時推送到奧丁丁。請確認 Hotel Code 與方案對應已正確設定。"
                : "關閉後，該物業新訂單將不再推送到奧丁丁。已在佇列中的訊息不受影響。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmToggle}>確認</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!exportAccId} onOpenChange={(o) => !o && setExportAccId(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>奧丁丁對應清單匯出 · {exportData?.acc?.name}</DialogTitle>
            <DialogDescription>
              純唯讀彙整。用於交付奧丁丁對窗口的房型 / 方案 / 包區群組 mapping。
            </DialogDescription>
          </DialogHeader>

          {exportData && (
            <div className="space-y-6 text-sm">
              <section>
                <h4 className="font-semibold mb-2">物業</h4>
                <div className="rounded border p-3 bg-muted/30">
                  <div>名稱：{exportData.acc?.name}</div>
                  <div>HotelCode：<span className="font-mono">{exportData.cfg?.owlting_hotel_code ?? "(未設定)"}</span></div>
                  <div>sync_enabled：{exportData.cfg?.sync_enabled ? "開啟" : "關閉"}</div>
                </div>
              </section>

              <section>
                <h4 className="font-semibold mb-2">房型清單（RoomTypeCode）</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>名稱</TableHead>
                      <TableHead className="w-[110px]">numeric_code</TableHead>
                      <TableHead className="w-[80px]">capacity</TableHead>
                      <TableHead className="w-[80px]">包棟</TableHead>
                      <TableHead className="w-[90px]">同步</TableHead>
                      <TableHead>所屬群組</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {exportData.rts.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.name}</TableCell>
                        <TableCell className="font-mono">{r.numeric_code ?? "—"}</TableCell>
                        <TableCell>{r.capacity ?? "—"}</TableCell>
                        <TableCell>{r.is_exclusive_package ? "是" : "—"}</TableCell>
                        <TableCell>
                          <Badge variant={r.synced ? "default" : "secondary"}>{r.synced ? "同步" : "不同步"}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.group ? `${r.group.canonical_name}（canonical ${r.group.canonical_code ?? "—"}）` : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </section>

              <section>
                <h4 className="font-semibold mb-2">方案清單（RatePlanCode）</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>名稱</TableHead>
                      <TableHead className="w-[110px]">numeric_code</TableHead>
                      <TableHead>涵蓋房型</TableHead>
                      <TableHead className="w-[110px]">sale_price</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {exportData.pkgs.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>{p.name}</TableCell>
                        <TableCell className="font-mono">{p.numeric_code ?? "—"}</TableCell>
                        <TableCell className="text-xs">{p.room_type_names.join(" / ") || "—"}</TableCell>
                        <TableCell>{p.sale_price ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </section>

              {exportData.groupsData.length > 0 && (
                <section>
                  <h4 className="font-semibold mb-2">包區群組</h4>
                  {exportData.groupsData.map((g, i) => (
                    <div key={i} className="mb-3">
                      <div className="mb-1">
                        <Badge variant="outline">canonical {g.canonical_code ?? "—"}</Badge>
                        <span className="ml-2 font-medium">{g.canonical_name}</span>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>成員房型</TableHead>
                            <TableHead className="w-[80px]">人數</TableHead>
                            <TableHead>方案</TableHead>
                            <TableHead className="w-[110px]">方案代碼</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {g.members.map((m, j) => (
                            <TableRow key={j}>
                              <TableCell>{m.member_room_type_name}</TableCell>
                              <TableCell>{m.capacity ?? "—"}</TableCell>
                              <TableCell>{m.rate_plan_name}</TableCell>
                              <TableCell className="font-mono">{m.rate_plan_code ?? "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ))}
                </section>
              )}

              <section>
                <h4 className="font-semibold mb-2">LINE 貼文預覽</h4>
                <pre className="whitespace-pre-wrap rounded border p-3 bg-muted/30 text-xs font-mono">
{buildPlainText(exportAccId!)}
                </pre>
              </section>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleCopyText}>
              <Copy className="h-3.5 w-3.5 mr-1" />
              複製文字
            </Button>
            <Button variant="outline" onClick={handleDownloadCsv}>
              <FileDown className="h-3.5 w-3.5 mr-1" />
              下載 CSV
            </Button>
            <Button onClick={() => setExportAccId(null)}>關閉</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
