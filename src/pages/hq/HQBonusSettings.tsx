import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import BonusSettingsTab from "@/components/team/BonusSettingsTab";
import OwnerSettlementSettings from "@/pages/OwnerSettlementSettings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

interface AccOption {
  id: string;
  name: string;
}

type SettingsTab = "bonus" | "owner-settlement";

/**
 * HQ 整合頁：獎金設定 ＋ 業主月結設定（總部唯一可編輯入口）。
 * 兩塊內容以 Tab 分流：
 * - bonus：與 /team/commission →「獎金設定」同源（Team 端為唯讀鏡像）
 * - owner-settlement：選擇館別後重用 OwnerSettlementSettings（以 prop 覆寫館別）
 */
export default function HQBonusSettings() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [accs, setAccs] = useState<AccOption[]>([]);
  const [roles, setRoles] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) {
        if (!cancelled) setRoles([]);
        return;
      }
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      if (!cancelled) setRoles((data ?? []).map((r: { role: string }) => r.role));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isHQAdmin = !!roles?.some((r) => r === "super_admin" || r === "admin");
  const canSeeBonus = !!roles?.some((r) => ["super_admin", "admin", "finance"].includes(r));

  const rawTab: SettingsTab = searchParams.get("tab") === "owner-settlement" ? "owner-settlement" : "bonus";
  const tab: SettingsTab = canSeeBonus ? rawTab : "owner-settlement";
  const accId = searchParams.get("acc") ?? "global";
  const override = useMemo(() => (accId === "global" ? null : accId), [accId]);

  useEffect(() => {
    if (tab !== "owner-settlement" || accs.length > 0) return;
    (async () => {
      const { data } = await supabase
        .from("accommodation_info")
        .select("id, name")
        .order("name");
      setAccs(((data ?? []) as AccOption[]).filter((a) => a.id && a.name));
    })();
  }, [tab, accs.length]);

  const setTab = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === "owner-settlement") next.set("tab", "owner-settlement");
    else {
      next.delete("tab");
      next.delete("acc");
    }
    setSearchParams(next, { replace: true });
  };

  const setAcc = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", "owner-settlement");
    if (value === "global") next.delete("acc");
    else next.set("acc", value);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="container mx-auto space-y-4 py-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => navigate("/team")}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          回團隊獎金頁
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate("/admin/owner-settlement")}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          回業主月結
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          {canSeeBonus && <TabsTrigger value="bonus">獎金發放規則（4 步流程）</TabsTrigger>}
          <TabsTrigger value="owner-settlement">基準金額規則（業主月結）</TabsTrigger>
        </TabsList>

        <TabsContent value="bonus" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>獎金發放規則（總部集中管理）</CardTitle>
              <CardDescription>
                依「一筆訂單實際被計算的順序」分成四步：① 這筆訂單算不算數 → ② 用多少金額當基準 → ③
                分給誰 → ④ 分多少、何時發。最上方的試算檢查器可輸入訂單編號，直接看到該筆訂單在每一步的判定結果。
                所有設定皆為 append-only 版本制，新增生效版本不會覆寫歷史期別的已算金額；
                /team/commission 的「獎金設定」分頁為唯讀鏡像。
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0" />
          </Card>

          <BonusSettingsTab readOnly={!isHQAdmin} />
        </TabsContent>

        <TabsContent value="owner-settlement" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>基準金額規則 ｜ 業主月結設定（總部集中管理）</CardTitle>
              <CardDescription>
                這裡設定的抽成門檻、免抽成訂單來源與不列入抽成的增值服務，
                就是獎金四步流程中「② 用多少金額當基準」的來源，會直接影響成交大師獎金與團隊獎金的基準金額。
                每間民宿獨立設定，沒有全站預設值：請先選擇館別再編輯。
              </CardDescription>
            </CardHeader>
            <CardContent className="max-w-sm space-y-3">
              <Select value={override ?? ""} onValueChange={setAcc}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇館別" />
                </SelectTrigger>
                <SelectContent>
                  {accs.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {override ? (
            <OwnerSettlementSettings key={accId} accommodationIdOverride={override} hideBackButton />
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                請先於上方選擇要設定的館別。
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

    </div>
  );
}
