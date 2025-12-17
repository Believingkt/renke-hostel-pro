import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
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
  user: "用戶管理",
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
  const [activeTab, setActiveTab] = useState("logs");
  const [loading, setLoading] = useState(true);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [systemSettings, setSystemSettings] = useState<SystemSetting[]>([]);
  const [savingSettings, setSavingSettings] = useState(false);
  
  // Filters
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [accommodationFilter, setAccommodationFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("7");

  useEffect(() => {
    loadData();
  }, [activeTab, categoryFilter, accommodationFilter, dateRange]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === "logs") {
        await loadAuditLogs();
      } else if (activeTab === "settings") {
        await loadSystemSettings();
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
    setSyncingHolidays(true);
    const toastId = toast.loading("正在同步國定假日...");
    
    try {
      const currentYear = new Date().getFullYear();
      const yearsToSync = [currentYear, currentYear + 1];
      let totalSynced = 0;
      
      for (const year of yearsToSync) {
        // Call the fetch-taiwan-holidays edge function
        const { data, error } = await supabase.functions.invoke("fetch-taiwan-holidays", {
          body: { year }
        });
        
        if (error) {
          console.error(`Error fetching holidays for ${year}:`, error);
          continue;
        }

        if (data?.holidays && Array.isArray(data.holidays)) {
          // Save holidays to all accommodations
          for (const acc of accommodations) {
            // Delete existing holidays for this year and accommodation
            await supabase
              .from("public_holidays")
              .delete()
              .eq("accommodation_id", acc.id)
              .gte("holiday_date", `${year}-01-01`)
              .lte("holiday_date", `${year}-12-31`);

            // Insert new holidays
            const holidaysToInsert = data.holidays.map((holiday: { date: string; name: string; type: string }) => ({
              accommodation_id: acc.id,
              holiday_date: holiday.date,
              holiday_name: holiday.name,
              holiday_type: holiday.type || "holiday",
            }));

            if (holidaysToInsert.length > 0) {
              const { error: insertError } = await supabase
                .from("public_holidays")
                .insert(holidaysToInsert);

              if (insertError) {
                console.error(`Error inserting holidays for ${acc.name}:`, insertError);
              } else {
                totalSynced += holidaysToInsert.length;
              }
            }
          }
        }
      }

      // Update the last sync time
      const holidaySetting = systemSettings.find(s => s.setting_key === "holiday_sync");
      if (holidaySetting && typeof holidaySetting.setting_value === "object" && holidaySetting.setting_value !== null) {
        const currentValue = holidaySetting.setting_value as Record<string, unknown>;
        await updateSetting("holiday_sync", {
          ...currentValue,
          last_sync: new Date().toISOString(),
        });
      }

      await logAction("sync", "system", "holidays", "taiwan", "台灣國定假日", {
        years: yearsToSync,
        total_synced: totalSynced,
        accommodations_count: accommodations.length,
      });

      toast.success(`國定假日同步完成，共更新 ${totalSynced} 筆資料`, { id: toastId });
    } catch (error) {
      console.error("Error syncing holidays:", error);
      toast.error("同步國定假日失敗", { id: toastId });
    } finally {
      setSyncingHolidays(false);
    }
  };

  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case "create":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
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
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="logs" className="gap-2">
            <ScrollText className="h-4 w-4" />
            操作日誌
          </TabsTrigger>
          <TabsTrigger value="backup" className="gap-2">
            <Database className="h-4 w-4" />
            資料備份
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="h-4 w-4" />
            系統設定
          </TabsTrigger>
        </TabsList>

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
                            <div className="text-sm font-medium">{log.entity_name || "-"}</div>
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
                              <span className="text-sm truncate max-w-[120px]">{log.user_email || "系統"}</span>
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

        {/* Backup Tab */}
        <TabsContent value="backup" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                資料備份管理
              </CardTitle>
              <CardDescription>
                管理所有民宿的資料備份與還原功能
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {accommodations.map((acc) => (
                  <Card key={acc.id} className="border-dashed">
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{acc.name}</span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            window.location.href = `/data-backup?accommodation=${acc.id}`;
                          }}
                        >
                          管理備份
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {accommodations.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Database className="h-12 w-12 mb-4 opacity-50" />
                  <p>尚無民宿資料</p>
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

                    <div className="flex items-center justify-between pt-4 border-t">
                      <div className="space-y-0.5">
                        <Label>上次同步時間</Label>
                        <p className="text-sm text-muted-foreground">
                          {value.last_sync 
                            ? format(new Date(value.last_sync), "yyyy/MM/dd HH:mm", { locale: zhTW })
                            : "尚未同步"}
                        </p>
                      </div>
                      <Button onClick={syncHolidays} variant="outline" className="gap-2" disabled={syncingHolidays}>
                        {syncingHolidays ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                        {syncingHolidays ? "同步中..." : "立即同步"}
                      </Button>
                    </div>
                  </>
                );
              })()}
            </CardContent>
          </Card>

          {/* Backup Retention Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                備份保留設定
              </CardTitle>
              <CardDescription>
                設定備份檔案的保留期限和數量限制
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(() => {
                const setting = systemSettings.find(s => s.setting_key === "backup_retention");
                const value = setting?.setting_value as { days?: number; max_backups_per_accommodation?: number } || {};
                
                return (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>備份保留天數</Label>
                        <Input
                          type="number"
                          value={value.days ?? 90}
                          onChange={(e) => {
                            const days = parseInt(e.target.value) || 90;
                            updateSetting("backup_retention", { ...value, days });
                          }}
                          min={7}
                          max={365}
                          disabled={savingSettings}
                        />
                        <p className="text-xs text-muted-foreground">
                          超過此天數的備份將自動刪除
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label>每民宿最大備份數</Label>
                        <Input
                          type="number"
                          value={value.max_backups_per_accommodation ?? 10}
                          onChange={(e) => {
                            const max = parseInt(e.target.value) || 10;
                            updateSetting("backup_retention", { ...value, max_backups_per_accommodation: max });
                          }}
                          min={1}
                          max={50}
                          disabled={savingSettings}
                        />
                        <p className="text-xs text-muted-foreground">
                          超過此數量時將刪除最舊的備份
                        </p>
                      </div>
                    </div>
                  </>
                );
              })()}
            </CardContent>
          </Card>

          {/* Notification Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                通知設定
              </CardTitle>
              <CardDescription>
                設定系統通知和警報
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(() => {
                const setting = systemSettings.find(s => s.setting_key === "notification_settings");
                const value = setting?.setting_value as { email_notifications?: boolean; system_alerts?: boolean } || {};
                
                return (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>電子郵件通知</Label>
                        <p className="text-sm text-muted-foreground">
                          發送重要系統事件通知到管理員信箱
                        </p>
                      </div>
                      <Switch
                        checked={value.email_notifications ?? true}
                        onCheckedChange={(checked) => {
                          updateSetting("notification_settings", { ...value, email_notifications: checked });
                        }}
                        disabled={savingSettings}
                      />
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t">
                      <div className="space-y-0.5">
                        <Label>系統警報</Label>
                        <p className="text-sm text-muted-foreground">
                          顯示系統異常和安全警報
                        </p>
                      </div>
                      <Switch
                        checked={value.system_alerts ?? true}
                        onCheckedChange={(checked) => {
                          updateSetting("notification_settings", { ...value, system_alerts: checked });
                        }}
                        disabled={savingSettings}
                      />
                    </div>
                  </>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
