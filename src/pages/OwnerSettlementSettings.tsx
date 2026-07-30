import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings, ArrowLeft, ChevronDown, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { getOrderSourceDisplayName } from "@/utils/orderHelpers";
import { useAccommodation } from "@/contexts/AccommodationContext";

interface SettlementConfig {
  commission_rate: number;
  marketing_fee_base: number;
  marketing_fee_per_extra_property: number;
  exempt_order_sources: string[];
  revenue_breakdown_type: "standard" | "guestcount";
  /* 門檻式收費規則（owner_settlement_pricing_rules） */
  commission_threshold: number;
  marketing_fee_low: number;
  marketing_fee_high: number;
  marketing_fee_threshold: number;
}

const DEFAULT_CONFIG: SettlementConfig = {
  commission_rate: 15,
  marketing_fee_base: 53000,
  marketing_fee_per_extra_property: 3000,
  exempt_order_sources: [],
  revenue_breakdown_type: "standard",
  commission_threshold: 0,
  marketing_fee_low: 53000,
  marketing_fee_high: 0,
  marketing_fee_threshold: 0,
};

interface AccommodationGroup {
  id: string;
  name: string;
  sources: string[];
}

const GLOBAL_SETTING_KEY = "owner_settlement_config";
const perAccKey = (accId: string) => `owner_settlement_config:${accId}`;

/** 當月月初（Asia/Taipei），格式 YYYY-MM-01 */
function currentMonthStartTaipei(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  return `${y}-${m}-01`;
}


export default function OwnerSettlementSettings() {
  const navigate = useNavigate();
  const { currentAccommodationId } = useAccommodation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [config, setConfig] = useState<SettlementConfig>(DEFAULT_CONFIG);
  const [groups, setGroups] = useState<AccommodationGroup[]>([]);
  const [accName, setAccName] = useState<string>("");
  const [usingFallback, setUsingFallback] = useState(false);
  const [currentRuleId, setCurrentRuleId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRows, setHistoryRows] = useState<any[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [creatorNames, setCreatorNames] = useState<Record<string, string>>({});

  const loadHistory = async () => {
    if (!currentAccommodationId) {
      setHistoryRows([]);
      setHistoryLoaded(true);
      return;
    }
    setHistoryLoading(true);
    const { data } = await supabase
      .from("owner_settlement_pricing_rules")
      .select("*")
      .eq("accommodation_id", currentAccommodationId)
      .order("effective_from", { ascending: false })
      .order("created_at", { ascending: false });
    const rows = data ?? [];
    setHistoryRows(rows);
    const ids = Array.from(new Set(rows.map((r: any) => r.created_by).filter(Boolean)));
    if (ids.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, name, email")
        .in("id", ids as string[]);
      const map: Record<string, string> = {};
      for (const p of (profs ?? []) as Array<{ id: string; name: string | null; email: string | null }>) {
        map[p.id] = p.name || p.email || p.id;
      }
      setCreatorNames(map);
    }
    setHistoryLoading(false);
    setHistoryLoaded(true);
  };


  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const ordersQuery = supabase
        .from("orders")
        .select("accommodation_id, order_source")
        .not("order_source", "is", null);
      if (currentAccommodationId) ordersQuery.eq("accommodation_id", currentAccommodationId);

      const accQuery = supabase.from("accommodation_info").select("id, name");
      if (currentAccommodationId) accQuery.eq("id", currentAccommodationId);

      const configuredQuery = supabase
        .from("accommodation_order_sources")
        .select("accommodation_id, name");
      if (currentAccommodationId) configuredQuery.eq("accommodation_id", currentAccommodationId);

      const settingKeys = currentAccommodationId
        ? [perAccKey(currentAccommodationId), GLOBAL_SETTING_KEY]
        : [GLOBAL_SETTING_KEY];

      const [settingRes, accRes, ordersRes, configuredRes] = await Promise.all([
        supabase
          .from("system_settings")
          .select("setting_key, setting_value")
          .in("setting_key", settingKeys),
        accQuery.order("name", { ascending: true }),
        ordersQuery,
        configuredQuery,
      ]);

      const rows = (settingRes.data ?? []) as Array<{ setting_key: string; setting_value: any }>;
      const perAcc = currentAccommodationId
        ? rows.find((r) => r.setting_key === perAccKey(currentAccommodationId))
        : undefined;
      const global = rows.find((r) => r.setting_key === GLOBAL_SETTING_KEY);
      const picked = perAcc ?? global;
      setUsingFallback(!!currentAccommodationId && !perAcc);
      let baseConfig: SettlementConfig = DEFAULT_CONFIG;
      if (picked?.setting_value) {
        const raw = picked.setting_value as any;
        baseConfig = {
          ...DEFAULT_CONFIG,
          ...raw,
          exempt_order_sources: Array.isArray(raw.exempt_order_sources) ? raw.exempt_order_sources : [],
          revenue_breakdown_type: raw.revenue_breakdown_type === "guestcount" ? "guestcount" : "standard",
          // 舊制沒有門檻概念，門檻相關欄位一律預設 0（未啟用門檻機制）
          commission_threshold: 0,
          marketing_fee_low: 0,
          marketing_fee_high: 0,
          marketing_fee_threshold: 0,
        };
      }

      // 新制優先：取該館別 effective_from <= 當月的最新一筆生效規則
      let ruleRow: any = null;
      if (currentAccommodationId) {
        const { data } = await supabase
          .from("owner_settlement_pricing_rules")
          .select("*")
          .eq("accommodation_id", currentAccommodationId)
          .lte("effective_from", currentMonthStartTaipei())
          .order("effective_from", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        ruleRow = data ?? null;
      }
      setCurrentRuleId(ruleRow?.id ?? null);
      setHistoryOpen(false);
      setHistoryLoaded(false);
      setHistoryRows([]);
      if (ruleRow) {
        setConfig({
          ...baseConfig,
          // 資料表存小數，UI 以百分比顯示
          commission_rate: (Number(ruleRow.commission_rate) || 0) * 100,
          commission_threshold: Number(ruleRow.commission_threshold) || 0,
          marketing_fee_low: Number(ruleRow.marketing_fee_low) || 0,
          marketing_fee_high: Number(ruleRow.marketing_fee_high) || 0,
          marketing_fee_threshold: Number(ruleRow.marketing_fee_threshold) || 0,
          exempt_order_sources: Array.isArray(ruleRow.exempt_order_sources)
            ? ruleRow.exempt_order_sources
            : baseConfig.exempt_order_sources,
          revenue_breakdown_type:
            ruleRow.revenue_breakdown_type === "guestcount"
              ? "guestcount"
              : ruleRow.revenue_breakdown_type === "standard"
                ? "standard"
                : baseConfig.revenue_breakdown_type,
        });
      } else {
        setConfig(baseConfig);
      }


      const accList = (accRes.data ?? []) as Array<{ id: string; name: string }>;
      if (currentAccommodationId) {
        setAccName(accList.find((a) => a.id === currentAccommodationId)?.name ?? "");
      } else {
        setAccName("");
      }

      const sourcesByAcc = new Map<string, Set<string>>();
      for (const row of (ordersRes.data ?? []) as Array<{ accommodation_id: string | null; order_source: string | null }>) {
        if (!row.accommodation_id || !row.order_source) continue;
        const src = row.order_source.trim();
        if (!src) continue;
        if (!sourcesByAcc.has(row.accommodation_id)) sourcesByAcc.set(row.accommodation_id, new Set());
        sourcesByAcc.get(row.accommodation_id)!.add(src);
      }
      for (const row of (configuredRes.data ?? []) as Array<{ accommodation_id: string | null; name: string | null }>) {
        if (!row.accommodation_id || !row.name) continue;
        const src = row.name.trim();
        if (!src) continue;
        if (!sourcesByAcc.has(row.accommodation_id)) sourcesByAcc.set(row.accommodation_id, new Set());
        sourcesByAcc.get(row.accommodation_id)!.add(src);
      }
      const nextGroups: AccommodationGroup[] = accList
        .map((a) => ({
          id: a.id,
          name: a.name,
          sources: Array.from(sourcesByAcc.get(a.id) ?? []).sort(),
        }))
        .filter((g) => g.sources.length > 0);
      setGroups(nextGroups);

      setLoading(false);
    })();
  }, [currentAccommodationId]);

  const toggleSource = (value: string, checked: boolean) => {
    setConfig((prev) => {
      const set = new Set(prev.exempt_order_sources);
      if (checked) set.add(value);
      else set.delete(value);
      return { ...prev, exempt_order_sources: Array.from(set) };
    });
  };

  const handleSave = async () => {
    if (config.commission_rate < 0 || config.commission_rate > 100) {
      toast.error("服務費率需介於 0-100 之間");
      return;
    }
    if (config.marketing_fee_base < 0 || config.marketing_fee_per_extra_property < 0) {
      toast.error("行銷費不可為負數");
      return;
    }
    if (
      config.commission_threshold < 0 ||
      config.marketing_fee_low < 0 ||
      config.marketing_fee_high < 0 ||
      config.marketing_fee_threshold < 0
    ) {
      toast.error("門檻與行銷推廣費不可為負數");
      return;
    }
    const settingKey = currentAccommodationId
      ? perAccKey(currentAccommodationId)
      : GLOBAL_SETTING_KEY;
    setSaving(true);
    const { data: existing } = await supabase
      .from("system_settings")
      .select("setting_key")
      .eq("setting_key", settingKey)
      .maybeSingle();

    const payload = {
      setting_key: settingKey,
      setting_value: config as any,
    };
    const { error } = existing
      ? await supabase.from("system_settings").update(payload).eq("setting_key", settingKey)
      : await supabase.from("system_settings").insert(payload);

    if (error) {
      setSaving(false);
      toast.error(`儲存失敗：${error.message}`);
      return;
    }

    // 新制：append-only 寫入一筆當月版本（同月重複儲存即以最新一筆為準，使用者無感）
    if (currentAccommodationId) {
      const { data: { user } } = await supabase.auth.getUser();
      const { error: ruleError } = await supabase
        .from("owner_settlement_pricing_rules")
        .insert({
          accommodation_id: currentAccommodationId,
          effective_from: currentMonthStartTaipei(),
          // 費率一律小數存法（10% → 0.10）
          commission_rate: config.commission_rate / 100,
          commission_threshold: config.commission_threshold,
          marketing_fee_low: config.marketing_fee_low,
          marketing_fee_high: config.marketing_fee_high,
          marketing_fee_threshold: config.marketing_fee_threshold,
          tier_rate_enabled: false,
          exempt_order_sources: config.exempt_order_sources,
          revenue_breakdown_type: config.revenue_breakdown_type,
          created_by: user?.id ?? null,
        });
      if (ruleError) {
        setSaving(false);
        toast.error(`門檻式收費規則儲存失敗：${ruleError.message}`);
        return;
      }
    }

    setSaving(false);
    setUsingFallback(false);
    toast.success(currentAccommodationId ? `已儲存「${accName}」的設定` : "已儲存全站預設設定");
  };


  if (loading) return null;


  return (
    <div className="container mx-auto py-6 space-y-6">
      <AdminPageHeader
        title="業主月結設定"
        description={
          currentAccommodationId
            ? `目前編輯：${accName || "此民宿"}（每間民宿獨立設定，不影響其他民宿）`
            : "尚未選擇民宿，此處編輯的是全站預設值（僅套用於尚未設定的民宿）"
        }
        icon={Settings}
        action={
          <Button variant="outline" size="sm" onClick={() => navigate("/admin/owner-settlement")}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            回月結報表
          </Button>
        }
      />
      {currentAccommodationId && usingFallback && (
        <div className="rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
          此民宿尚未有獨立設定，目前顯示全站預設值。儲存後將建立「{accName || "此民宿"}」的專屬設定，不影響其他民宿。
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>收益拆解類型</CardTitle>
          <CardDescription>決定業主月結頁面的收益拆解結構與計算方式。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 max-w-sm">
          <Label htmlFor="revenue_breakdown_type">收益拆解類型</Label>
          <Select
            value={config.revenue_breakdown_type}
            onValueChange={(v) =>
              setConfig({ ...config, revenue_breakdown_type: v as SettlementConfig["revenue_breakdown_type"] })
            }
          >
            <SelectTrigger id="revenue_breakdown_type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="standard">standard（標準）</SelectItem>
              <SelectItem value="guestcount">guestcount（人數型）</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            guestcount 類型適用包棟訂房，溢價分潤依入住人數計算，加購項目不計入抽成基礎
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>服務費</CardTitle>
          <CardDescription>
            套用至所有訂單（除 <code>owner_direct = true</code> 或訂單來源被勾選為不抽成）。計算方式：本月分攤後金額 × 服務費率。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 max-w-sm">
            <Label htmlFor="commission_rate">服務費率（%）</Label>
            <Input
              id="commission_rate"
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={config.commission_rate}
              onChange={(e) => setConfig({ ...config, commission_rate: Number(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">
              目前：{config.commission_rate}%（含金流處理、客服、系統維運、訂單管理、網紅抽成）
            </p>
          </div>

          <div className="space-y-2 max-w-sm">
            <Label htmlFor="commission_threshold">抽成門檻（NT$）</Label>
            <Input
              id="commission_threshold"
              type="number"
              min={0}
              step={1000}
              value={config.commission_threshold}
              onChange={(e) => setConfig({ ...config, commission_threshold: Number(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">
              0 = 全額抽成，無門檻（與現行邏輯相同）；超過門檻部分才抽成。
              {config.commission_threshold > 0
                ? ` 目前設定：當月營收超過 NT$ ${config.commission_threshold.toLocaleString()} 的部分，才以 ${config.commission_rate}% 抽成。`
                : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              門檻判斷基礎為「單一館別當月營收」（未扣加購項目、排除非台幣與不抽成訂單）。
            </p>
          </div>
        </CardContent>
      </Card>




      <Card>
        <CardHeader>
          <CardTitle>不抽成的訂單來源</CardTitle>
          <CardDescription>
            依各民宿實際使用的訂單來源分組列出，勾選後該來源訂單於業主月結中不計服務費（等同「業主自帶」）。同名來源跨民宿共用同一設定。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {groups.length === 0 && (
            <p className="text-sm text-muted-foreground">目前尚未偵測到任何民宿使用中的訂單來源。</p>
          )}
          {groups.map((g) => (
            <div key={g.id} className="space-y-2">
              <div className="text-sm font-medium">{g.name}</div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {g.sources.map((src) => {
                  const checked = config.exempt_order_sources.includes(src);
                  return (
                    <label
                      key={`${g.id}-${src}`}
                      className="flex items-center gap-2 border rounded-md px-3 py-2 cursor-pointer hover:bg-muted/40"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => toggleSource(src, v === true)}
                      />
                      <span className="text-sm">{getOrderSourceDisplayName(src)}</span>
                      <span className="ml-auto text-[10px] font-mono text-muted-foreground">{src}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
          {config.exempt_order_sources.length > 0 && (
            <p className="text-xs text-muted-foreground">
              已選：{config.exempt_order_sources.join(", ")}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>行銷費</CardTitle>
          <CardDescription>
            公式：<code>基本服務費 + 每多一棟加收 × (棟數 - 1)</code>。棟數取自 <code>accommodation_info.building_count</code>。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 max-w-sm">
            <Label htmlFor="marketing_fee_base">基本服務費（NT$）</Label>
            <Input
              id="marketing_fee_base"
              type="number"
              min={0}
              step={100}
              value={config.marketing_fee_base}
              onChange={(e) => setConfig({ ...config, marketing_fee_base: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-2 max-w-sm">
            <Label htmlFor="marketing_fee_per_extra_property">每多一棟加收（NT$）</Label>
            <Input
              id="marketing_fee_per_extra_property"
              type="number"
              min={0}
              step={100}
              value={config.marketing_fee_per_extra_property}
              onChange={(e) =>
                setConfig({ ...config, marketing_fee_per_extra_property: Number(e.target.value) })
              }
            />
            <p className="text-xs text-muted-foreground">
              預覽：1 棟 NT$ {config.marketing_fee_base.toLocaleString()}；
              2 棟 NT$ {(config.marketing_fee_base + config.marketing_fee_per_extra_property).toLocaleString()}；
              3 棟 NT$ {(config.marketing_fee_base + config.marketing_fee_per_extra_property * 2).toLocaleString()}
            </p>
          </div>

          <div className="space-y-2 max-w-sm">
            <Label htmlFor="marketing_fee_threshold">行銷推廣費門檻（NT$）</Label>
            <Input
              id="marketing_fee_threshold"
              type="number"
              min={0}
              step={1000}
              value={config.marketing_fee_threshold}
              onChange={(e) => {
                const next = Number(e.target.value);
                setConfig((prev) => ({
                  ...prev,
                  marketing_fee_threshold: next,
                  ...(next > 0 ? {} : { marketing_fee_low: 0, marketing_fee_high: 0 }),
                }));
              }}
            />
            <p className="text-xs text-muted-foreground">
              0 = 恆用「未達門檻」金額，並沿用「每多一棟加收」的舊公式；超過門檻改用「超過門檻」金額。
              {config.marketing_fee_threshold > 0
                ? ` 目前設定：當月營收未達 NT$ ${config.marketing_fee_threshold.toLocaleString()} 收「未達門檻」金額，達標則收「超過門檻」金額。`
                : ""}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
            <div className="space-y-2">
              <Label htmlFor="marketing_fee_low" className={config.marketing_fee_threshold > 0 ? "" : "text-muted-foreground"}>
                行銷推廣費（未達門檻，NT$）
              </Label>
              <Input
                id="marketing_fee_low"
                type="number"
                min={0}
                step={100}
                disabled={!(config.marketing_fee_threshold > 0)}
                className={config.marketing_fee_threshold > 0 ? "" : "opacity-60"}
                value={config.marketing_fee_threshold > 0 ? config.marketing_fee_low : 0}
                onChange={(e) => setConfig({ ...config, marketing_fee_low: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="marketing_fee_high" className={config.marketing_fee_threshold > 0 ? "" : "text-muted-foreground"}>
                行銷推廣費（超過門檻，NT$）
              </Label>
              <Input
                id="marketing_fee_high"
                type="number"
                min={0}
                step={100}
                disabled={!(config.marketing_fee_threshold > 0)}
                className={config.marketing_fee_threshold > 0 ? "" : "opacity-60"}
                value={config.marketing_fee_threshold > 0 ? config.marketing_fee_high : 0}
                onChange={(e) => setConfig({ ...config, marketing_fee_high: Number(e.target.value) })}
              />
            </div>
            {!(config.marketing_fee_threshold > 0) && (
              <p className="sm:col-span-2 text-xs text-muted-foreground">
                門檻為 0，未啟用門檻機制：這兩個欄位停用，行銷費以「基本服務費 + 每多一棟加收」計算。
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col items-end gap-2">
        <p className="text-xs text-muted-foreground text-right">
          儲存後會建立一筆「{currentMonthStartTaipei().slice(0, 7)}」生效的版本；過去月份的規則不可修改，歷史月結報表金額不受影響。
        </p>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "儲存中..." : "儲存設定"}
        </Button>
      </div>

    </div>
  );
}
