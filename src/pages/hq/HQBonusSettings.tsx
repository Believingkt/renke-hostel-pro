import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import BonusSettingsTab from "@/components/team/BonusSettingsTab";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink } from "lucide-react";

/**
 * HQ 整合頁：獎金設定（總部集中管理）。
 * 內容與 /team/commission →「獎金設定」完全同源（同一元件），
 * 差別在於 HQ 為唯一可編輯入口，Team 端改為唯讀鏡像。
 */
export default function HQBonusSettings() {
  const navigate = useNavigate();

  return (
    <div className="container mx-auto space-y-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate("/hq")}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          回總部
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to="/hq/owner-settlement-settings">
            業主月結設定
            <ExternalLink className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </div>

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
    </div>
  );
}
