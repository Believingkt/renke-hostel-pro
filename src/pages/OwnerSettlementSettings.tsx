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
import { FALLBACK_ORDER_SOURCES } from "@/hooks/use-order-sources";
import { useAccommodation } from "@/contexts/AccommodationContext";

/** 中文標籤 → raw key，避免「官網訂房」與 website 重複出現 */
const LABEL_TO_KEY: Record<string, string> = FALLBACK_ORDER_SOURCES.reduce(
  (acc, o) => {
    acc[o.label] = o.value;
    return acc;
  },
  { 住宿票卷: "accommodation_voucher" } as Record<string, string>,
);

function normalizeOrderSourceKey(raw: string | null | undefined): string {
  const v = String(raw ?? "").trim();
  if (!v) return "";
  return LABEL_TO_KEY[v] ?? v;
}


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
  /** 合約層面是否約定收取行銷推廣費（獨立判斷，不影響金額計算欄位） */
  charges_marketing_fee: boolean;
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
  charges_marketing_fee: false,
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


export default function OwnerSettlementSettings({
  accommodationIdOverride,
  hideBackButton,
}: {
  /** HQ 整合頁使用：由外層選擇館別，不吃 admin 的 AccommodationContext */
  accommodationIdOverride?: string | null;
  hideBackButton?: boolean;
} = {}) {
  const navigate = useNavigate();
  const { currentAccommodationId: ctxAccommodationId } = useAccommodation();
  const currentAccommodationId =
    accommodationIdOverride !== undefined ? accommodationIdOverride : ctxAccommodationId;
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
  /** 該館別實際設定過的增值服務項目（addon_settings 的 id + addon_type，依名稱去重） */
  const [addonOptions, setAddonOptions] = useState<Array<{ id: string; addon_type: string }>>([]);
  /** 不列入平台服務費抽成的增值服務項目（以 addon_settings.id 為主） */
  const [excludedAddonIds, setExcludedAddonIds] = useState<string[]>([]);
  /** 舊版只存了文字、但目前 addon_settings 找不到對應項目的名稱（保留以維持向下相容） */
  const [legacyOnlyExcludedTypes, setLegacyOnlyExcludedTypes] = useState<string[]>([]);

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
          exempt_order_sources: Array.isArray(raw.exempt_order_sources)
            ? Array.from(new Set(raw.exempt_order_sources.map(normalizeOrderSourceKey).filter(Boolean)))
            : [],

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
          charges_marketing_fee: ruleRow.charges_marketing_fee === true,
          exempt_order_sources: Array.isArray(ruleRow.exempt_order_sources)
            ? Array.from(new Set(ruleRow.exempt_order_sources.map(normalizeOrderSourceKey).filter(Boolean)))
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

      // 增值服務抽成設定：清單來源為該館別 addon_settings 實際設定過的項目（id + 名稱）
      if (currentAccommodationId) {
        const { data: addonRows } = await supabase
          .from("addon_settings")
          .select("id, addon_type")
          .eq("accommodation_id", currentAccommodationId);
        const seen = new Set<string>();
        const options: Array<{ id: string; addon_type: string }> = [];
        for (const r of (addonRows ?? []) as Array<{ id: string; addon_type: string | null }>) {
          const name = (r.addon_type ?? "").trim();
          if (!name || seen.has(name)) continue;
          seen.add(name);
          options.push({ id: r.id, addon_type: name });
        }
        options.sort((a, b) => a.addon_type.localeCompare(b.addon_type));
        setAddonOptions(options);

        // 已儲存的排除清單：以 id 為主，舊資料只有文字時對映回 id
        const savedIds = Array.isArray(ruleRow?.commission_excluded_addon_ids)
          ? (ruleRow!.commission_excluded_addon_ids as string[]).filter(Boolean)
          : [];
        const savedTypes = Array.isArray(ruleRow?.commission_excluded_addon_types)
          ? (ruleRow!.commission_excluded_addon_types as string[]).filter(Boolean)
          : [];
        const idSet = new Set(savedIds);
        const unmatchedTypes: string[] = [];
        for (const t of savedTypes) {
          const opt = options.find((o) => o.addon_type === t);
          if (opt) idSet.add(opt.id);
          else unmatchedTypes.push(t);
        }
        setExcludedAddonIds(Array.from(idSet));
        setLegacyOnlyExcludedTypes(unmatchedTypes);
      } else {
        setAddonOptions([]);
        setExcludedAddonIds([]);
        setLegacyOnlyExcludedTypes([]);
      }




      const accList = (accRes.data ?? []) as Array<{ id: string; name: string }>;
      if (currentAccommodationId) {
        setAccName(accList.find((a) => a.id === currentAccommodationId)?.name ?? "");
      } else {
        setAccName("");
      }

      // 訂單來源字典統一：系統預設 ∪ 館別自訂下拉 ∪ 訂單實際出現過，
      // 一律正規化成 raw key（中文標籤會被反查回英文 key）後去重。
      const sourcesByAcc = new Map<string, Set<string>>();
      const addSource = (accId: string, raw: string | null | undefined) => {
        const key = normalizeOrderSourceKey(raw);
        if (!accId || !key) return;
        if (!sourcesByAcc.has(accId)) sourcesByAcc.set(accId, new Set());
        sourcesByAcc.get(accId)!.add(key);
      };
      for (const a of accList) {
        for (const opt of FALLBACK_ORDER_SOURCES) addSource(a.id, opt.value);
      }
      for (const row of (ordersRes.data ?? []) as Array<{ accommodation_id: string | null; order_source: string | null }>) {
        addSource(row.accommodation_id ?? "", row.order_source);
      }
      for (const row of (configuredRes.data ?? []) as Array<{ accommodation_id: string | null; name: string | null }>) {
        addSource(row.accommodation_id ?? "", row.name);
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

  /** 勾選 = 不列入抽成（加入排除清單）；取消勾選 = 列入抽成（從排除清單移除） */
  const toggleAddonCommission = (addonId: string, included: boolean) => {
    setExcludedAddonIds((prev) => {
      const set = new Set(prev);
      if (included) set.delete(addonId);
      else set.add(addonId);
      return Array.from(set);
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
          charges_marketing_fee: config.charges_marketing_fee,
          tier_rate_enabled: false,
          exempt_order_sources: config.exempt_order_sources,
          revenue_breakdown_type: config.revenue_breakdown_type,
          commission_excluded_addon_ids: excludedAddonIds,
          // 文字清單維持寫入，供舊訂單（快照無 addon_id）fallback 比對
          commission_excluded_addon_types: Array.from(
            new Set([
              ...excludedAddonIds
                .map((id) => addonOptions.find((o) => o.id === id)?.addon_type)
                .filter((t): t is string => !!t),
              ...legacyOnlyExcludedTypes,
            ]),
          ),
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
          hideBackButton ? undefined : (
            <Button variant="outline" size="sm" onClick={() => navigate("/admin/owner-settlement")}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              回月結報表
            </Button>
          )
        }
      />
      {!hideBackButton && (
        <div className="rounded-md border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          此設定已搬遷至總部集中管理頁，本頁未來將移除。
          <a
            className="ml-2 underline font-medium"
            href={`/hq/bonus-settings?tab=owner-settlement${currentAccommodationId ? `&acc=${currentAccommodationId}` : ""}`}
          >
            前往總部設定頁 →
          </a>
        </div>
      )}
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
          <details className="mt-2 rounded-md border bg-muted/40 p-3 text-sm">
            <summary className="cursor-pointer font-medium">常見方案填法對照</summary>
            <ul className="mt-2 space-y-1 text-muted-foreground">
              <li>• 月付方案：抽成門檻 0、服務費率 15%</li>
              <li>• 保障分潤方案：抽成門檻 = 保障營收金額、服務費率 50%</li>
            </ul>
          </details>

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
              <div className="text-base md:text-lg font-bold text-foreground border-l-4 border-primary pl-2">
                {g.name}
              </div>
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
          <CardTitle>不抽成的增值服務</CardTitle>
          <CardDescription>
            勾選＝不抽成，未勾選＝列入抽成。
            <br />
            此設定僅影響「業主月結」的「平台服務費」計算，不影響「團隊佣金」（星探／成交組／KOL 分潤一律排除所有增值服務，不受此設定影響）。
          </CardDescription>

        </CardHeader>
        <CardContent className="space-y-4">
          {!currentAccommodationId && (
            <p className="text-sm text-muted-foreground">請先於上方選擇民宿，才能設定該民宿不抽成的增值服務。</p>
          )}
          {currentAccommodationId && addonOptions.length === 0 && (
            <p className="text-sm text-muted-foreground">
              此民宿尚未設定任何增值服務項目，請通知管理員進行設定。{" "}
              <a
                href="https://sensaninn.lakeze.com/admin/website-content?tab=addon-plans"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-4 hover:opacity-80"
              >
                前往設定
              </a>
            </p>
          )}
          {addonOptions.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {addonOptions.map((o) => {
                const excluded = excludedAddonIds.includes(o.id);
                return (
                  <label
                    key={o.id}
                    className="flex items-center gap-2 border rounded-md px-3 py-2 cursor-pointer hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={excluded}
                      onCheckedChange={(v) => toggleAddonCommission(o.id, v !== true)}
                    />
                    <span className="text-sm">{o.addon_type}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {excluded ? "不抽成" : "列入抽成"}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          {excludedAddonIds.length > 0 && (
            <p className="text-xs text-muted-foreground">
              不抽成：
              {excludedAddonIds
                .map((id) => addonOptions.find((o) => o.id === id)?.addon_type)
                .filter(Boolean)
                .join("、")}
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
          <details className="mt-2 rounded-md border bg-muted/40 p-3 text-sm">
            <summary className="cursor-pointer font-medium">常見方案填法對照</summary>
            <ul className="mt-2 space-y-1 text-muted-foreground">
              <li>• 月付方案：行銷推廣費門檻 0；基本服務費 / 每多一棟加收依合約金額（如 53,000 / 3,000）</li>
              <li>• 保障分潤方案：行銷推廣費門檻 0；基本服務費、每多一棟加收皆填 0</li>
            </ul>
          </details>

        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-start gap-2 border rounded-md px-3 py-2 cursor-pointer hover:bg-muted/40 max-w-xl">
            <Checkbox
              checked={config.charges_marketing_fee}
              onCheckedChange={(v) => setConfig({ ...config, charges_marketing_fee: v === true })}
            />
            <span className="text-sm">
              本館合約有約定收取行銷推廣費（月費）
              <span className="block text-xs text-muted-foreground">
                獨立於下方金額設定，僅記錄合約是否約定收取。
              </span>
            </span>
          </label>
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

      <Collapsible
        open={historyOpen}
        onOpenChange={(open) => {
          setHistoryOpen(open);
          if (open && !historyLoaded && !historyLoading) loadHistory();
        }}
      >
        <Card>
          <CollapsibleTrigger className="w-full text-left">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div className="space-y-1.5">
                <CardTitle className="flex items-center gap-2">
                  <History className="w-4 h-4" />
                  歷史生效版本
                </CardTitle>
                <CardDescription>唯讀檢視此民宿所有已建立的收費規則版本（不可修改或刪除）。</CardDescription>
              </div>
              <ChevronDown
                className={`w-4 h-4 shrink-0 transition-transform ${historyOpen ? "rotate-180" : ""}`}
              />
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-3">
              {historyLoading && <p className="text-sm text-muted-foreground">載入中...</p>}
              {!historyLoading && historyLoaded && historyRows.length === 0 && (
                <p className="text-sm text-muted-foreground">尚無歷史版本紀錄，目前套用舊制設定</p>
              )}
              {!historyLoading &&
                historyRows.map((r: any) => (
                  <div key={r.id} className="rounded-md border p-3 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">
                        生效月份：{String(r.effective_from).slice(0, 7)}
                      </span>
                      {r.id === currentRuleId && <Badge>目前生效中</Badge>}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <div>抽成費率：{((Number(r.commission_rate) || 0) * 100).toFixed(2)}%</div>
                      <div>抽成門檻：NT$ {(Number(r.commission_threshold) || 0).toLocaleString()}</div>
                      <div>收取行銷推廣費：{r.charges_marketing_fee === true ? "是" : "否"}</div>
                      <div>行銷推廣費門檻：NT$ {(Number(r.marketing_fee_threshold) || 0).toLocaleString()}</div>
                      <div>行銷推廣費（未達門檻）：NT$ {(Number(r.marketing_fee_low) || 0).toLocaleString()}</div>
                      <div>行銷推廣費（超過門檻）：NT$ {(Number(r.marketing_fee_high) || 0).toLocaleString()}</div>
                      <div>基本服務費：NT$ {config.marketing_fee_base.toLocaleString()}（舊制設定）</div>
                      <div>
                        每多一棟加收：NT$ {config.marketing_fee_per_extra_property.toLocaleString()}（舊制設定）
                      </div>
                      <div>
                        建立時間：
                        {r.created_at
                          ? new Date(r.created_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })
                          : "-"}
                      </div>
                      <div>
                        建立人員：{r.created_by ? creatorNames[r.created_by] ?? r.created_by : "系統"}
                      </div>
                    </div>
                  </div>
                ))}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>


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
