import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Settings, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { getOrderSourceDisplayName } from "@/utils/orderHelpers";
import { useAccommodation } from "@/contexts/AccommodationContext";

interface SettlementConfig {
  commission_rate: number;
  marketing_fee_base: number;
  marketing_fee_per_extra_property: number;
  exempt_order_sources: string[];
}

const DEFAULT_CONFIG: SettlementConfig = {
  commission_rate: 15,
  marketing_fee_base: 53000,
  marketing_fee_per_extra_property: 3000,
  exempt_order_sources: [],
};

interface AccommodationGroup {
  id: string;
  name: string;
  sources: string[];
}

const GLOBAL_SETTING_KEY = "owner_settlement_config";
const perAccKey = (accId: string) => `owner_settlement_config:${accId}`;

export default function OwnerSettlementSettings() {
  const navigate = useNavigate();
  const { currentAccommodationId } = useAccommodation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [config, setConfig] = useState<SettlementConfig>(DEFAULT_CONFIG);
  const [groups, setGroups] = useState<AccommodationGroup[]>([]);
  const [accName, setAccName] = useState<string>("");
  const [usingFallback, setUsingFallback] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      const allowed = (roles ?? []).some((r: any) => ["super_admin", "admin"].includes(r.role));
      setCanEdit(allowed);

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
      if (picked?.setting_value) {
        const raw = picked.setting_value as any;
        setConfig({
          ...DEFAULT_CONFIG,
          ...raw,
          exempt_order_sources: Array.isArray(raw.exempt_order_sources) ? raw.exempt_order_sources : [],
        });
      } else {
        setConfig(DEFAULT_CONFIG);
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
    setSaving(true);
    const { data: existing } = await supabase
      .from("system_settings")
      .select("setting_key")
      .eq("setting_key", "owner_settlement_config")
      .maybeSingle();

    const payload = {
      setting_key: "owner_settlement_config",
      setting_value: config as any,
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

  if (!canEdit) {
    return (
      <div className="container mx-auto py-6">
        <AdminPageHeader title="業主月結設定" icon={Settings} />
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            僅限管理員（admin / super_admin）存取此設定頁面。
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
