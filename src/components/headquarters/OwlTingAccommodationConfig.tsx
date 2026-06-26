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
import { Loader2, Save, AlertTriangle } from "lucide-react";
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
}

interface PackageRow {
  id: string;
  accommodation_id: string;
  name: string;
  numeric_code: number | null;
}

interface PricingTemplate {
  id: string;
  accommodation_id: string;
  template_name: string;
  default_package_id: string | null;
}

export function OwlTingAccommodationConfig() {
  const [loading, setLoading] = useState(true);
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [configs, setConfigs] = useState<Record<string, OwltingConfig>>({});
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [templates, setTemplates] = useState<PricingTemplate[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [hotelCodeDrafts, setHotelCodeDrafts] = useState<Record<string, string>>({});
  const [pendingToggle, setPendingToggle] = useState<{ accId: string; nextValue: boolean } | null>(null);

  const load = async () => {
    setLoading(true);
    const [accRes, cfgRes, rtRes, pkgRes, tplRes] = await Promise.all([
      supabase.from("accommodation_info").select("id, name").eq("is_active", true).order("display_order"),
      supabase.from("accommodation_owlting_config").select("id, accommodation_id, owlting_hotel_code, sync_enabled, last_successful_sync_at"),
      supabase.from("room_types").select("id, accommodation_id, name, numeric_code").order("display_order"),
      supabase.from("accommodation_packages").select("id, accommodation_id, name, numeric_code, enabled").order("display_order"),
      supabase.from("pricing_templates").select("id, accommodation_id, template_name, default_package_id").order("display_order"),
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
                          tpls.map((t) => {
                            const unset = !t.default_package_id;
                            return (
                              <TableRow
                                key={t.id}
                                className={unset ? "bg-amber-50 dark:bg-amber-950/20" : ""}
                              >
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    {t.template_name}
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
                          })
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
    </div>
  );
}
