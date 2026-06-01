import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { maskEmail, maskPhone, maskName } from "@/utils/maskSensitive";
import type { Json } from "@/integrations/supabase/types";
import { HQSystemSkeleton } from "@/components/skeletons/HQSkeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { AccommodationApiKeysManagement } from "@/components/headquarters/AccommodationApiKeysManagement";
import { OwlTingServiceAccountManagement } from "@/components/headquarters/OwlTingServiceAccountManagement";
import { AccommodationOwnersManagement } from "@/components/headquarters/AccommodationOwnersManagement";
import { SystemHealthMonitor } from "@/components/headquarters/SystemHealthMonitor";
import { 
  ScrollText,
  Database,
  Settings,
  RefreshCw,
  Calendar,
  Shield,
  User,
  Building2,
  Clock,
  Filter,
  Loader2,
  Save,
  AlertCircle,
  CheckCircle,
  XCircle,
  Info
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { zhTW } from "date-fns/locale";
import { toast } from "sonner";

interface AuditLog {
  id: string;
  accommodation_id: string | null;
  user_id: string;
  user_email: string | null;
  action_type: string;
  action_category: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_name: string | null;
  details: unknown;
  created_at: string;
}

interface SystemSetting {
  id: string;
  setting_key: string;
  setting_value: unknown;
  description: string | null;
  updated_at: string;
}

interface SystemManagementProps {
  accommodations: { id: string; name: string }[];
}

const ACTION_CATEGORY_LABELS: Record<string, string> = {
  accommodation: "民宿管理",
  user: "帳號管理",
  order: "訂單管理",
  system: "系統設定",
  backup: "資料備份",
  auth: "身份驗證",
};

const ACTION_TYPE_LABELS: Record<string, string> = {
  create: "新增",
  update: "更新",
  delete: "刪除",
  enable: "啟用",
  disable: "停用",
  clone: "複製",
  backup: "備份",
  restore: "還原",
  login: "登入",
  logout: "登出",
  sync: "同步",
};

export function SystemManagement({ accommodations }: SystemManagementProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const section = searchParams.get("section") || "settings";
  const activeTab = section; // section values match tab values: logs, facilities, backup, settings
  
  const [loading, setLoading] = useState(true);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [systemSettings, setSystemSettings] = useState<SystemSetting[]>([]);
  const [savingSettings, setSavingSettings] = useState(false);
  
  // Filters
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [accommodationFilter, setAccommodationFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("7");
  
  // Holiday sync
  const [selectedYears, setSelectedYears] = useState<number[]>(() => {
    const currentYear = new Date().getFullYear();
    return [currentYear, currentYear + 1];
  });
  const [syncedHolidays, setSyncedHolidays] = useState<{ date: string; name: string; type: string; is_custom: boolean }[]>([]);
  const [previewYear, setPreviewYear] = useState<number>(new Date().getFullYear());
  const [loadingHolidays, setLoadingHolidays] = useState(false);
  const [newCustomHoliday, setNewCustomHoliday] = useState<{ date: string; name: string; type: string }>({
    date: "",
    name: "",
    type: "holiday",
  });
  const [addingCustom, setAddingCustom] = useState(false);

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: "system", section: value });
  };

  useEffect(() => {
    loadData();
  }, [activeTab, categoryFilter, accommodationFilter, dateRange]);

  useEffect(() => {
    if (activeTab === "settings") {
      loadSyncedHolidays();
    }
  }, [previewYear, accommodations]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === "logs") {
        await loadAuditLogs();
      } else if (activeTab === "settings") {
        await loadSystemSettings();
        await loadSyncedHolidays();
      }
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadAuditLogs = async () => {
    let query = supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    // Apply filters
    if (categoryFilter !== "all") {
      query = query.eq("action_category", categoryFilter);
    }

    if (accommodationFilter !== "all") {
      query = query.eq("accommodation_id", accommodationFilter);
    }

    if (dateRange !== "all") {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - parseInt(dateRange));
      query = query.gte("created_at", daysAgo.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error loading audit logs:", error);
      return;
    }

    setAuditLogs(data || []);
  };

  const loadSystemSettings = async () => {
    const { data, error } = await supabase
      .from("system_settings")
      .select("*")
      .order("setting_key");

    if (error) {
      console.error("Error loading system settings:", error);
      return;
    }

    setSystemSettings(data || []);
  };

  const loadSyncedHolidays = async () => {
    if (accommodations.length === 0) return;
    
    setLoadingHolidays(true);
    try {
      // Load holidays from the first accommodation (all should have the same data)
      const { data, error } = await supabase
        .from("public_holidays")
        .select("holiday_date, holiday_name, holiday_type, is_custom")
        .eq("accommodation_id", accommodations[0].id)
        .gte("holiday_date", `${previewYear}-01-01`)
        .lte("holiday_date", `${previewYear}-12-31`)
        .order("holiday_date");

      if (error) {
        console.error("Error loading holidays:", error);
        return;
      }

      setSyncedHolidays(
        (data || []).map(h => ({
          date: h.holiday_date,
          name: h.holiday_name,
          type: h.holiday_type,
          is_custom: (h as { is_custom?: boolean }).is_custom ?? false,
        }))
      );
    } finally {
      setLoadingHolidays(false);
    }
  };

  const addCustomHoliday = async () => {
    if (!newCustomHoliday.date || !newCustomHoliday.name.trim()) {
      toast.error("請填寫日期與名稱");
      return;
    }
    if (accommodations.length === 0) {
      toast.error("尚未載入民宿資料");
      return;
    }
    setAddingCustom(true);
    try {
      const rows = accommodations.map(a => ({
        accommodation_id: a.id,
        holiday_date: newCustomHoliday.date,
        holiday_name: newCustomHoliday.name.trim(),
        holiday_type: newCustomHoliday.type,
        is_custom: true,
      }));
      const { error } = await supabase
        .from("public_holidays")
        .upsert(rows, { onConflict: "accommodation_id,holiday_date" });
      if (error) throw error;
      await logAction("create", "system", "holidays", "custom", newCustomHoliday.name.trim(), {
        date: newCustomHoliday.date,
        type: newCustomHoliday.type,
        accommodations: accommodations.length,
      });
      toast.success(`已新增自訂假日（套用至 ${accommodations.length} 間民宿）`);
      setNewCustomHoliday({ date: "", name: "", type: "holiday" });
      await loadSyncedHolidays();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "新增失敗");
    } finally {
      setAddingCustom(false);
    }
  };

  const deleteHolidayByDate = async (date: string, name: string) => {
    if (!confirm(`確定刪除 ${date} ${name}？將同步從所有民宿移除。`)) return;
    try {
      const { error } = await supabase
        .from("public_holidays")
        .delete()
        .eq("holiday_date", date)
        .in("accommodation_id", accommodations.map(a => a.id));
      if (error) throw error;
      await logAction("delete", "system", "holidays", "custom", name, { date });
      toast.success("已刪除");
      await loadSyncedHolidays();
    } catch (e) {
      console.error(e);
      toast.error("刪除失敗");
    }
  };

  const updateSetting = async (key: string, value: Record<string, unknown>) => {
    setSavingSettings(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from("system_settings")
        .update({ 
          setting_value: value as Json,
          updated_by: user?.id,
          updated_at: new Date().toISOString()
        })
        .eq("setting_key", key);

      if (error) throw error;

      // Log the action
      await logAction("update", "system", "system_setting", key, key, { new_value: value });

      toast.success("設定已更新");
      await loadSystemSettings();
    } catch (error) {
      console.error("Error updating setting:", error);
      toast.error("更新設定失敗");
    } finally {
      setSavingSettings(false);
    }
  };

  const logAction = async (
    actionType: string,
    actionCategory: string,
    entityType: string,
    entityId: string,
    entityName: string,
    details: Record<string, unknown> = {}
  ) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from("audit_logs").insert([{
        user_id: user.id,
        user_email: user.email,
        action_type: actionType,
        action_category: actionCategory,
        entity_type: entityType,
        entity_id: entityId,
        entity_name: entityName,
        details: details as Json,
      }]);
    } catch (error) {
      console.error("Error logging action:", error);
    }
  };

  const [syncingHolidays, setSyncingHolidays] = useState(false);

  const syncHolidays = async () => {
    if (selectedYears.length === 0) {
      toast.error("請至少選擇一個年份");
      return;
    }

    setSyncingHolidays(true);
    const toastId = toast.loading("正在同步國定假日...");

    try {
      const { data, error } = await supabase.functions.invoke("sync-taiwan-holidays", {
        body: { years: selectedYears },
      });

      if (error) {
        throw error;
      }

      if (!data?.success) {
        throw new Error(data?.error || "同步國定假日失敗");
      }

      const totalSynced = Number(data.totalSynced || 0);
      const accommodationsCount = Number(data.accommodationsCount || accommodations.length);

      const holidaySetting = systemSettings.find(s => s.setting_key === "holiday_sync");
      if (holidaySetting && typeof holidaySetting.setting_value === "object" && holidaySetting.setting_value !== null) {
        const currentValue = holidaySetting.setting_value as Record<string, unknown>;
        await updateSetting("holiday_sync", {
          ...currentValue,
          last_sync: new Date().toISOString(),
        });
      }

      await logAction("sync", "system", "holidays", "taiwan", "台灣國定假日", {
        years: selectedYears,
        total_synced: totalSynced,
        accommodations_count: accommodationsCount,
      });

      await loadSyncedHolidays();
      toast.success(`國定假日同步完成，共更新 ${totalSynced} 筆資料`, { id: toastId });
    } catch (error) {
      console.error("Error syncing holidays:", error);
      const message = error instanceof Error ? error.message : "同步國定假日失敗";
      toast.error(message, { id: toastId });
    } finally {
      setSyncingHolidays(false);
    }
  };

  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case "create":
        return <CheckCircle className="h-4 w-4 text-primary" />;
      case "delete":
        return <XCircle className="h-4 w-4 text-destructive" />;
      case "update":
        return <RefreshCw className="h-4 w-4 text-blue-500" />;
      default:
        return <Info className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getAccommodationName = (id: string | null) => {
    if (!id) return "系統";
    const acc = accommodations.find(a => a.id === id);
    return acc?.name || "未知";
  };

  if (loading && activeTab === "logs" && auditLogs.length === 0) {
    return <HQSystemSkeleton />;
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={handleTabChange}>

        {/* Audit Logs Tab */}
        <TabsContent value="logs" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Filter className="h-4 w-4" />
                篩選條件
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>操作類別</Label>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="全部類別" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部類別</SelectItem>
                      {Object.entries(ACTION_CATEGORY_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>民宿</Label>
                  <Select value={accommodationFilter} onValueChange={setAccommodationFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="全部民宿" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部民宿</SelectItem>
                      {accommodations.map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>時間範圍</Label>
                  <Select value={dateRange} onValueChange={setDateRange}>
                    <SelectTrigger>
                      <SelectValue placeholder="選擇時間範圍" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">最近 1 天</SelectItem>
                      <SelectItem value="7">最近 7 天</SelectItem>
                      <SelectItem value="30">最近 30 天</SelectItem>
                      <SelectItem value="90">最近 90 天</SelectItem>
                      <SelectItem value="all">全部時間</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Logs Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ScrollText className="h-5 w-5" />
                操作日誌
              </CardTitle>
              <CardDescription>
                記錄系統重要操作，包含用戶、時間和詳細資訊
              </CardDescription>
            </CardHeader>
            <CardContent>
              {auditLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <ScrollText className="h-12 w-12 mb-4 opacity-50" />
                  <p>尚無操作日誌記錄</p>
                  <p className="text-sm">系統操作將自動記錄在此</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-[140px]">時間</TableHead>
                        <TableHead>操作</TableHead>
                        <TableHead>類別</TableHead>
                        <TableHead>目標</TableHead>
                        <TableHead>民宿</TableHead>
                        <TableHead>操作者</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-sm">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              {format(new Date(log.created_at), "MM/dd HH:mm", { locale: zhTW })}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: zhTW })}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getActionIcon(log.action_type)}
                              <span>{ACTION_TYPE_LABELS[log.action_type] || log.action_type}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {ACTION_CATEGORY_LABELS[log.action_category] || log.action_category}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm font-medium">
                              {log.entity_type === "customer" || log.entity_type === "user" || log.entity_type === "user_role"
                                ? maskName(log.entity_name) || "-"
                                : log.entity_name || "-"}
                            </div>
                            <div className="text-xs text-muted-foreground">{log.entity_type}</div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Building2 className="h-3 w-3 text-muted-foreground" />
                              <span className="text-sm">{getAccommodationName(log.accommodation_id)}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3 text-muted-foreground" />
                              <span className="text-sm truncate max-w-[160px]" title={log.user_email || "系統"}>
                                {log.user_email ? maskEmail(log.user_email) : "系統"}
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-4">
          {/* Holiday Sync Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                國定假日同步
              </CardTitle>
              <CardDescription>
                自動同步台灣國定假日資料至所有民宿
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(() => {
                const setting = systemSettings.find(s => s.setting_key === "holiday_sync");
                const value = setting?.setting_value as { enabled?: boolean; last_sync?: string; auto_sync_interval_days?: number } || {};
                
                return (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>啟用自動同步</Label>
                        <p className="text-sm text-muted-foreground">
                          定期自動同步國定假日資料
                        </p>
                      </div>
                      <Switch
                        checked={value.enabled ?? true}
                        onCheckedChange={(checked) => {
                          updateSetting("holiday_sync", { ...value, enabled: checked });
                        }}
                        disabled={savingSettings}
                      />
                    </div>

                    <div className="space-y-2 pt-4 border-t">
                      <Label>選擇同步年份</Label>
                      <div className="flex flex-wrap gap-2">
                        {(() => {
                          const currentYear = new Date().getFullYear();
                          const availableYears = [currentYear - 1, currentYear, currentYear + 1, currentYear + 2];
                          return availableYears.map((year) => (
                            <Button
                              key={year}
                              variant={selectedYears.includes(year) ? "default" : "outline"}
                              size="sm"
                              onClick={() => {
                                setSelectedYears(prev => 
                                  prev.includes(year) 
                                    ? prev.filter(y => y !== year)
                                    : [...prev, year].sort()
                                );
                              }}
                              disabled={syncingHolidays}
                            >
                              {year}
                            </Button>
                          ));
                        })()}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        已選擇 {selectedYears.length} 個年份
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t">
                      <div className="space-y-0.5">
                        <Label>上次同步時間</Label>
                        <p className="text-sm text-muted-foreground">
                          {value.last_sync 
                            ? format(new Date(value.last_sync), "yyyy/MM/dd HH:mm", { locale: zhTW })
                            : "尚未同步"}
                        </p>
                      </div>
                      <Button onClick={syncHolidays} variant="outline" className="gap-2" disabled={syncingHolidays || selectedYears.length === 0}>
                        {syncingHolidays ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                        {syncingHolidays ? "同步中..." : "立即同步"}
                      </Button>
                    </div>

                    {/* 假日預覽 + 自訂假日 */}
                    <div className="space-y-3 pt-4 border-t">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <Label>已同步 / 自訂假日</Label>
                        <Select value={String(previewYear)} onValueChange={(v) => setPreviewYear(Number(v))}>
                          <SelectTrigger className="w-[120px] h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(() => {
                              const cy = new Date().getFullYear();
                              return [cy - 1, cy, cy + 1, cy + 2].map(y => (
                                <SelectItem key={y} value={String(y)}>{y} 年</SelectItem>
                              ));
                            })()}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* 新增自訂假日 */}
                      <div className="grid grid-cols-1 md:grid-cols-[160px_1fr_140px_auto] gap-2 items-end p-3 rounded-md bg-muted/30">
                        <div className="space-y-1">
                          <Label className="text-xs">日期</Label>
                          <Input
                            type="date"
                            value={newCustomHoliday.date}
                            onChange={(e) => setNewCustomHoliday(p => ({ ...p, date: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">名稱</Label>
                          <Input
                            placeholder="例如：公司週年慶"
                            value={newCustomHoliday.name}
                            onChange={(e) => setNewCustomHoliday(p => ({ ...p, name: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">類型</Label>
                          <Select
                            value={newCustomHoliday.type}
                            onValueChange={(v) => setNewCustomHoliday(p => ({ ...p, type: v }))}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="holiday">假日（假日定價）</SelectItem>
                              <SelectItem value="compensatory_day_off">補假（假日定價）</SelectItem>
                              <SelectItem value="work_on_weekend">補班（平日定價）</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Button onClick={addCustomHoliday} disabled={addingCustom} size="sm" className="gap-1">
                          {addingCustom ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                          新增
                        </Button>
                      </div>

                      {/* 列表 */}
                      <div className="rounded-md border max-h-[360px] overflow-auto">
                        {loadingHolidays ? (
                          <div className="p-6 text-center text-sm text-muted-foreground">載入中…</div>
                        ) : syncedHolidays.length === 0 ? (
                          <div className="p-6 text-center text-sm text-muted-foreground">{previewYear} 年尚無假日資料</div>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-[120px]">日期</TableHead>
                                <TableHead>名稱</TableHead>
                                <TableHead className="w-[110px]">類型</TableHead>
                                <TableHead className="w-[80px]">來源</TableHead>
                                <TableHead className="w-[60px]"></TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {syncedHolidays.map(h => (
                                <TableRow key={h.date + h.name}>
                                  <TableCell className="tabular-nums">{h.date}</TableCell>
                                  <TableCell>{h.name}</TableCell>
                                  <TableCell>
                                    {h.type === "work_on_weekend" || h.type === "workday" ? (
                                      <Badge variant="secondary">補班</Badge>
                                    ) : h.type === "compensatory_day_off" ? (
                                      <Badge>補假</Badge>
                                    ) : (
                                      <Badge>假日</Badge>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {h.is_custom ? (
                                      <Badge variant="outline">自訂</Badge>
                                    ) : (
                                      <Badge variant="outline">政府</Badge>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => deleteHolidayByDate(h.date, h.name)}
                                    >
                                      <XCircle className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        新增自訂假日會套用至所有民宿，且不會被「立即同步」覆寫。
                      </p>
                    </div>
                  </>

                );
              })()}
            </CardContent>
          </Card>

          {/* 業主月結設定 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                業主月結設定
              </CardTitle>
              <CardDescription>
                設定平台抽成比例與每月行銷費用，套用於所有民宿的「業主月結」報表
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(() => {
                const setting = systemSettings.find(s => s.setting_key === "owner_settlement_config");
                const value = (setting?.setting_value as {
                  commission_rate?: number;
                  marketing_fee_base?: number;
                  marketing_fee_per_extra_property?: number;
                }) || {};
                const commission = value.commission_rate ?? 15;
                const baseFee = value.marketing_fee_base ?? 48000;
                const extraFee = value.marketing_fee_per_extra_property ?? 3000;

                return (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>平台抽成比例 (%)</Label>
                      <Input
                        type="number"
                        defaultValue={commission}
                        min={0}
                        max={100}
                        step={0.1}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v !== commission) {
                            updateSetting("owner_settlement_config", { ...value, commission_rate: v });
                          }
                        }}
                        disabled={savingSettings}
                      />
                      <p className="text-xs text-muted-foreground">餐飲費用不抽成</p>
                    </div>
                    <div className="space-y-2">
                      <Label>每月行銷費 (1 棟，NT$)</Label>
                      <Input
                        type="number"
                        defaultValue={baseFee}
                        min={0}
                        step={100}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v !== baseFee) {
                            updateSetting("owner_settlement_config", { ...value, marketing_fee_base: v });
                          }
                        }}
                        disabled={savingSettings}
                      />
                      <p className="text-xs text-muted-foreground">業主基本行銷費</p>
                    </div>
                    <div className="space-y-2">
                      <Label>每多 1 棟加收 (NT$)</Label>
                      <Input
                        type="number"
                        defaultValue={extraFee}
                        min={0}
                        step={100}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v !== extraFee) {
                            updateSetting("owner_settlement_config", { ...value, marketing_fee_per_extra_property: v });
                          }
                        }}
                        disabled={savingSettings}
                      />
                      <p className="text-xs text-muted-foreground">每多 1 棟自動加上此金額</p>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>

        </TabsContent>

        {/* API Keys Tab */}
        <TabsContent value="health" className="space-y-4">
          <SystemHealthMonitor />
        </TabsContent>

        <TabsContent value="api-keys" className="space-y-4">
          <AccommodationApiKeysManagement />
        </TabsContent>

        <TabsContent value="owlting" className="space-y-4">
          <OwlTingServiceAccountManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
}
