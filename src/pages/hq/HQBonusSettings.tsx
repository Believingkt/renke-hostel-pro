import { useNavigate, useSearchParams } from "react-router-dom";
import BonusSettingsTab from "@/components/team/BonusSettingsTab";
import HQOwnerSettlementSettings from "@/pages/hq/HQOwnerSettlementSettings";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft } from "lucide-react";

/**
 * HQ 整合頁：獎金與月結設定（總部集中管理）。
 * 兩個 Tab：獎金設定（與 /team/commission 同源元件，HQ 為唯一可編輯入口）、業主月結設定。
 */
export default function HQBonusSettings() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "owner-settlement" ? "owner-settlement" : "bonus";

  const handleTabChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === "bonus") next.delete("tab");
    else next.set("tab", value);
    setSearchParams(next);
  };

  return (
    <div className="container mx-auto space-y-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate("/hq")}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          回總部
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>獎金與月結設定（總部集中管理）</CardTitle>
          <CardDescription>
            費率版本、訂單來源白名單、角色綁定、場域簽約人與館別合作期間，以及業主月結抽成規則，全部集中在此編輯；
            /team/commission 的「獎金設定」分頁已改為唯讀鏡像。所有設定皆為 append-only 版本制，
            新增版本不會覆寫歷史期別的已算金額。
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs value={tab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList>
          <TabsTrigger value="bonus">獎金設定</TabsTrigger>
          <TabsTrigger value="owner-settlement">業主月結設定</TabsTrigger>
        </TabsList>

        <TabsContent value="bonus" className="mt-0">
          <BonusSettingsTab />
        </TabsContent>

        <TabsContent value="owner-settlement" className="mt-0">
          <HQOwnerSettlementSettings embedded />
        </TabsContent>
      </Tabs>
    </div>
  );
}
