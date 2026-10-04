import { Card, CardContent, CardHeader, CardTitle } from "@lakeze/shared/components/ui/card";
import { Button } from "@lakeze/shared/components/ui/button";
import { Link } from "react-router-dom";

/**
 * 舊 HQ 全域 Google 商家串接設定頁已退休（DEPRECATED / UNUSED）。
 *
 * Google Business Profile 已改為 PER-ACCOMMODATION：每一館自行持有 Google Cloud 專案與
 * OAuth 憑證。此路由保留但不再提供任何可編輯的全域憑證表單。
 */
export default function HQGoogleBusinessProfileRetired() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">此設定已改由各館自行管理</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Google Business Profile 串接已改為「各館自主申請、自主管理」：每一館使用自己的
            Google Cloud 專案與 OAuth 憑證，於該館後台「官網內容 → Google 評論」頁設定。
          </p>
          <p>此頁面已停用，不再提供任何共用憑證設定。</p>
          <Button asChild variant="outline">
            <Link to="/hq">返回總部首頁</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
