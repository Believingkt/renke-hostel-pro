import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Settings, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { FALLBACK_ORDER_SOURCES } from "@/hooks/use-order-sources";

interface SettlementConfig {
  commission_rate: number;
  marketing_fee_base: number;
  marketing_fee_per_extra_property: number;
  exempt_order_sources: string[];
}

interface SourceOption {
  value: string;
  label: string;
  origin: "config" | "orders" | "fallback";
}

const DEFAULT_CONFIG: SettlementConfig = {
  commission_rate: 15,
  marketing_fee_base: 53000,
  marketing_fee_per_extra_property: 3000,
  exempt_order_sources: [],
};

// 少數不在 accommodation_order_sources 也不在 FALLBACK 的固定來源
const EXTRA_STATIC_SOURCES: SourceOption[] = [
  { value: "hotelnabe", label: "旭海 HotelNabe", origin: "fallback" },
];

const FALLBACK_LABEL_MAP: Record<string, string> = Object.fromEntries(
  FALLBACK_ORDER_SOURCES.map((o) => [o.value, o.label]),
);

export default function OwnerSettlementSettings() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [config, setConfig] = useState<SettlementConfig>(DEFAULT_CONFIG);
  const [sourceOptions, setSourceOptions] = useState<SourceOption[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      const [rolesRes, settingRes, configuredRes, ordersRes] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase
          .from("system_settings")
          .select("setting_value")
          .eq("setting_key", "owner_settlement_config")
          .maybeSingle(),
        supabase.from("accommodation_order_sources").select("name, display_order"),
        supabase
          .from("orders")
          .select("order_source")
          .not("order_source", "is", null)
          .limit(10000),
      ]);

      const superAdmin = (rolesRes.data ?? []).some((r: any) => r.role === "super_admin");
      setIsSuperAdmin(superAdmin);

      // 動態組合來源選項：後台設定 → orders 實際存在 → FALLBACK → 額外靜態
      const seen = new Set<string>();
      const merged: SourceOption[] = [];
      const push = (value: string, label: string, origin: SourceOption["origin"]) => {
        const v = (value ?? "").trim();
        if (!v || seen.has(v)) return;
        seen.add(v);
        merged.push({ value: v, label: label || FALLBACK_LABEL_MAP[v] || v, origin });
      };
      (configuredRes.data ?? [])
        .sort((a: any, b: any) => (a.display_order ?? 999) - (b.display_order ?? 999))
        .forEach((c: any) => push(c.name, FALLBACK_LABEL_MAP[c.name] ?? c.name, "config"));
      (ordersRes.data ?? []).forEach((o: any) => push(o.order_source, FALLBACK_LABEL_MAP[o.order_source] ?? o.order_source, "orders"));
      FALLBACK_ORDER_SOURCES.forEach((o) => push(o.value, o.label, "fallback"));
      EXTRA_STATIC_SOURCES.forEach((o) => push(o.value, o.label, o.origin));
      setSourceOptions(merged);

      if (settingRes.data?.setting_value) {
        const raw = settingRes.data.setting_value as any;
        const rawExempt: string[] = Array.isArray(raw.exempt_order_sources) ? raw.exempt_order_sources : [];
        // 值域驗證：過濾掉不在可選清單中的值
        const validValues = new Set(merged.map((m) => m.value));
        const filtered = rawExempt.filter((v) => validValues.has(v));
        const dropped = rawExempt.filter((v) => !validValues.has(v));
        if (dropped.length > 0) {
          toast.warning(`已忽略 ${dropped.length} 個不存在的訂單來源：${dropped.join(", ")}`);
        }
        setConfig({
          ...DEFAULT_CONFIG,
          ...raw,
          exempt_order_sources: filtered,
        });
      }
      setLoading(false);
    })();
  }, []);

  const validValueSet = useMemo(() => new Set(sourceOptions.map((o) => o.value)), [sourceOptions]);

  const toggleSource = (value: string, checked: boolean) => {
    if (checked && !validValueSet.has(value)) {
      toast.error(`未知的訂單來源：${value}`);
      return;
    }
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
    // 值域驗證：只保存已知的 source
    const sanitizedExempt = config.exempt_order_sources.filter((v) => validValueSet.has(v));
    const invalid = config.exempt_order_sources.filter((v) => !validValueSet.has(v));
    if (invalid.length > 0) {
      toast.error(`包含未知的訂單來源，無法儲存：${invalid.join(", ")}`);
      return;
    }
    setSaving(true);
    const { data: existing } = await supabase
      .from("system_settings")
      .select("setting_key")
      .eq("setting_key", "owner_settlement_config")
      .maybeSingle();

    const payload = {
      setting_key: "owner_settlement_config",
      setting_value: { ...config, exempt_order_sources: sanitizedExempt } as any,
    };
    const { error } = existing
      ? await supabase.from("system_settings").update(payload).eq("setting_key", "owner_settlement_config")
      : await supabase.from("system_settings").insert(payload);

    setSaving(false);
    if (error) {
      toast.error(`儲存失敗：${error.message}`);
      return;
    }
    toast.success("設定已儲存");
  };

  if (loading) return null;

  if (!isSuperAdmin) {
    return (
      <div className="container mx-auto py-6">
        <AdminPageHeader title="業主月結設定" icon={Settings} />
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            僅限超級管理員（super_admin）存取此設定頁面。
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <AdminPageHeader
        title="業主月結設定"
        description="編輯全站業主月結的服務費率與行銷費基數"
        icon={Settings}
        action={
          <Button variant="outline" size="sm" onClick={() => navigate("/admin/owner-settlement")}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            回月結報表
          </Button>
        }
      />

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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>不抽成的訂單來源</CardTitle>
          <CardDescription>
            勾選後，該訂單來源的訂單於業主月結中不計服務費（等同「業主自帶」）。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sourceOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">尚無可選來源。</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {sourceOptions.map((opt) => {
                const checked = config.exempt_order_sources.includes(opt.value);
                return (
                  <label
                    key={opt.value}
                    className="flex items-center gap-2 border rounded-md px-3 py-2 cursor-pointer hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => toggleSource(opt.value, v === true)}
                    />
                    <span className="text-sm">{opt.label}</span>
                    {opt.origin === "orders" && (
                      <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0">實際</Badge>
                    )}
                    {opt.origin === "config" && (
                      <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0">設定</Badge>
                    )}
                    <span className="ml-auto text-[10px] font-mono text-muted-foreground">{opt.value}</span>
                  </label>
                );
              })}
            </div>
          )}
          {config.exempt_order_sources.length > 0 && (
            <p className="text-xs text-muted-foreground mt-3">
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
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "儲存中..." : "儲存設定"}
        </Button>
      </div>
    </div>
  );
}
