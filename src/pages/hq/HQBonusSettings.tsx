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

  const tab: SettingsTab = searchParams.get("tab") === "owner-settlement" ? "owner-settlement" : "bonus";
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate("/hq")}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          回總部
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="bonus">獎金設定</TabsTrigger>
          <TabsTrigger value="owner-settlement">業主月結設定</TabsTrigger>
        </TabsList>

        <TabsContent value="bonus" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>獎金設定（總部集中管理）</CardTitle>
              <CardDescription>
                費率版本、訂單來源白名單、角色綁定、場域簽約人與館別合作期間，全部集中在此編輯；
                /team/commission 的「獎金設定」分頁已改為唯讀鏡像。所有設定皆為 append-only 版本制，
                新增版本不會覆寫歷史期別的已算金額。
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0" />
          </Card>

          <BonusSettingsTab />
        </TabsContent>

        <TabsContent value="owner-settlement" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>業主月結設定（總部集中管理）</CardTitle>
              <CardDescription>
                選擇館別後編輯該館設定；選「全站預設值」時僅套用於尚未建立獨立設定的館別。
              </CardDescription>
            </CardHeader>
            <CardContent className="max-w-sm">
              <Select value={accId} onValueChange={setAcc}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇館別" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">全站預設值</SelectItem>
                  {accs.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <OwnerSettlementSettings key={accId} accommodationIdOverride={override} hideBackButton />
        </TabsContent>
      </Tabs>
    </div>
  );
}
