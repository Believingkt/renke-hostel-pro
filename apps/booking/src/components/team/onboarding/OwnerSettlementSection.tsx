import { Suspense, lazy } from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@lakeze/shared/components/ui/card";

const OwnerSettlementSettings = lazy(() => import("@lakeze/shared/pages/OwnerSettlementSettings"));

/** 業主月結設定（基準金額規則）：從 HQ 搬來，只顯示本館；補登過去月份限 super_admin、管理員、AM 總管 */
export function OwnerSettlementSection({ accId, canEdit }: { accId: string; canEdit: boolean }) {
  return (
    <div className="space-y-3" data-testid="onboarding-owner-settlement-section">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">業主月結設定（基準金額規則）</CardTitle>
          <CardDescription>
            抽成門檻、免抽成訂單來源與不列入抽成的增值服務，是獎金「用多少金額當基準」的來源。新增版本從本月生效；
            補登過去月份與修正生效月份限 super_admin、管理員與 AM 總管，必須填原因並留下異動紀錄，改錯可一鍵回復。
            {!canEdit && <span className="font-medium text-foreground" data-testid="onboarding-owner-settlement-readonly"> 你可以查看，修改請聯絡 AM 或 AM 總管。</span>}
          </CardDescription>
        </CardHeader>
      </Card>
      <Suspense fallback={<p className="text-sm text-muted-foreground">載入中…</p>}>
        <OwnerSettlementSettings key={accId} accommodationIdOverride={accId} hideBackButton readOnly={!canEdit} />
      </Suspense>
    </div>
  );
}
