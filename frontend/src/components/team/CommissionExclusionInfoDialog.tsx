import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HelpCircle } from "lucide-react";

/**
 * 「不抽成的增值服務」規則說明檢視視窗。
 * 純說明用途，不讀資料、不改任何設定；提供 AM 設定與管理員審查時的判斷依據。
 */
export default function CommissionExclusionInfoDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1">
          <HelpCircle className="h-4 w-4" />
          規則說明
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>增值服務抽成規則說明（V3）</DialogTitle>
          <DialogDescription>
            此頁勾選的項目＝「不列入抽成」。同一份設定同時決定業主月結的平台服務費，以及團隊獎金的分潤基準金額。
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-3">
          <div className="space-y-5 text-sm leading-relaxed">
            <section className="space-y-1">
              <h3 className="font-semibold">1. 勾選的意義</h3>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>勾選＝該項增值服務<strong>不列入抽成</strong>（從基準金額中扣除）。</li>
                <li>未勾選＝該項<strong>列入抽成</strong>（留在基準金額內）。</li>
                <li>
                  <strong>完全沒有勾選任何項目＝全部增值服務都列入抽成</strong>，不是全部排除。這是「未設定」的預設語意。
                </li>
                <li>每間民宿獨立設定，沒有全站預設值；各館可依合約彈性調整。</li>
              </ul>
            </section>

            <section className="space-y-1">
              <h3 className="font-semibold">2. V3 生效時間與影響範圍</h3>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>
                  以訂單的<strong>成交日（台北時區日曆日）</strong>判定版本，
                  <strong>2026-09-10 起</strong>的訂單套用 V3。
                </li>
                <li>2026-09-10 之前成交的訂單維持原算法（分潤基準一律排除所有增值服務），歷史數字與已結算快照都不會被改動。</li>
                <li>V3 起，本設定同時影響：業主月結平台服務費、星探個人分潤、成交組分潤、KOL 分潤。</li>
              </ul>
            </section>

            <section className="space-y-1">
              <h3 className="font-semibold">3. 基準金額公式</h3>
              <div className="rounded-md border bg-muted/30 p-3 font-mono text-xs">
                基準 = max(0, 訂單總金額 − 本頁勾選為不抽成的增值服務 − 備註「額外現場加購金額」)
              </div>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>備註內的「額外現場加購金額」自 2026-08-01 起<strong>一律不列入分潤基準</strong>，不受本頁勾選影響。</li>
                <li>團購訂單（group_buy）分潤基準一律為 0，不受本設定影響。</li>
                <li>訂單若已由管理員人工覆蓋分潤基準金額，以人工覆蓋值為準，不會再扣一次增值服務。</li>
              </ul>
            </section>

            <section className="space-y-1">
              <h3 className="font-semibold">4. 設定生效版本</h3>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>設定採版本制（append-only）：每次儲存會建立一個「生效月份」版本，不會覆寫歷史期別已計算的金額。</li>
                <li>某筆訂單套用的是「生效月份 ≤ 該訂單成交月份」中最新的一版。</li>
              </ul>
            </section>

            <section className="space-y-1">
              <h3 className="font-semibold">5. 審查流程</h3>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>AM 可自行編輯本設定；儲存後審查狀態會重置為「待審查」。</li>
                <li>待審查時，團隊頁的小鈴鐺會對總部管理員顯示綠燈提醒。</li>
                <li>管理員確認無誤後按「標記已審查」，提醒即消失。</li>
              </ul>
            </section>

            <section className="space-y-1">
              <h3 className="font-semibold">6. 審查時建議確認</h3>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>勾選內容是否與該館合約一致（常見為清潔費、接機車資等代收代付性質項目）。</li>
                <li>生效月份是否正確，避免誤改到已結算月份。</li>
                <li>若刻意要「全部列入抽成」，請確認是「沒有勾選任何項目」，而非漏設定。</li>
              </ul>
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
