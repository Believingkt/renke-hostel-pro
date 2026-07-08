import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Settings, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

interface SettlementConfig {
  commission_rate: number;
  marketing_fee_base: number;
  marketing_fee_per_extra_property: number;
}

const DEFAULT_CONFIG: SettlementConfig = {
  commission_rate: 15,
  marketing_fee_base: 53000,
  marketing_fee_per_extra_property: 3000,
};

export default function OwnerSettlementSettings() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [config, setConfig] = useState<SettlementConfig>(DEFAULT_CONFIG);

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
      const superAdmin = (roles ?? []).some((r: any) => r.role === "super_admin");
      setIsSuperAdmin(superAdmin);

      const { data } = await supabase
        .from("system_settings")
        .select("setting_value")
        .eq("setting_key", "owner_settlement_config")
        .maybeSingle();
      if (data?.setting_value) {
        setConfig({ ...DEFAULT_CONFIG, ...(data.setting_value as any) });
      }
      setLoading(false);
    })();
  }, []);

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
            套用至所有訂單（除 <code>owner_direct = true</code>）。計算方式：本月分攤後金額 × 服務費率。
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
