import { useState } from "react";
import { Rocket, X } from "lucide-react";
import { Card, CardContent } from "@lakeze/shared/components/ui/card";
import { Button } from "@lakeze/shared/components/ui/button";
import { Progress } from "@lakeze/shared/components/ui/progress";
import { PreloadLink } from "@lakeze/shared/components/PreloadLink";
import { useAliasPrefix } from "@lakeze/shared/hooks/use-alias-prefix";
import { useOnboardingProgress } from "@/hooks/use-onboarding-progress";

const keyOf = (id: string) => `onboarding_banner_dismissed_${id}`;
const todayStr = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());

/**
 * 上架引導提醒橫幅。必要項目未全綠時顯示。
 * 「稍後再說」只寫 localStorage（存當日日期），當天不再顯示、隔天自動再出現，不寫資料庫。
 */
export function OnboardingBanner({ accommodationId }: { accommodationId: string | null | undefined }) {
  const { withPrefix } = useAliasPrefix();
  const { done, total, loading } = useOnboardingProgress(accommodationId);
  const [dismissed, setDismissed] = useState(() => {
    if (!accommodationId) return false;
    try {
      return localStorage.getItem(keyOf(accommodationId)) === todayStr();
    } catch {
      return false;
    }
  });

  if (loading || dismissed || !accommodationId || total === 0 || done >= total) return null;

  const percent = Math.round((done / total) * 100);

  const dismiss = () => {
    try {
      localStorage.setItem(keyOf(accommodationId), todayStr());
    } catch {}
    setDismissed(true);
  };

  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Rocket className="mt-0.5 h-5 w-5 text-primary" />
          <div className="space-y-2">
            <p className="text-base font-medium">還有 {total - done} 項設定沒完成，完成後就能開始接單</p>
            <Progress value={percent} className="h-2 w-48" />
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button asChild size="sm">
            <PreloadLink to={withPrefix("/admin/onboarding")}>繼續設定</PreloadLink>
          </Button>
          <Button variant="ghost" size="sm" onClick={dismiss}>
            <X className="mr-1 h-4 w-4" />
            稍後再說
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
