import { Info } from "lucide-react";

/** 說明負責 AM／職代 AM／AM 總管的差異（總覽與單館頁共用） */
export function OnboardingRoleGuide() {
  return (
    <div className="flex gap-3 rounded-lg border bg-muted/30 p-4 text-sm" data-testid="onboarding-role-guide">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <ul className="space-y-1 text-muted-foreground">
        <li><span className="font-medium text-foreground">負責 AM</span>：一館一位，只有負責 AM 計算該館的 AM 績效獎金與 AM 場域獎金。</li>
        <li><span className="font-medium text-foreground">職代 AM</span>：其他 AM 與 AM 總管都是職代協作，系統自動開啟各館民宿後台最高權限，但不計該館獎金。</li>
        <li><span className="font-medium text-foreground">AM 總管</span>：協作所有館，只領 AM 總管獎金。</li>
        <li>其他在總部設定為民宿管理員的人（HQ 帳號管理）照常保留權限，不計 AM 獎金。</li>
      </ul>
    </div>
  );
}
