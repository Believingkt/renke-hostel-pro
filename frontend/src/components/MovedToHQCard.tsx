import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalLink, MoveRight } from "lucide-react";

const HQ_ORIGIN = "https://hq.lakeze.com";

/**
 * 「此功能已移至總部後台」提示卡
 * 用於 AI 管家相關頁面自 PMS 民宿後台搬遷至 hq.lakeze.com 後的舊路由。
 */
export function MovedToHQCard({
  title = "此功能已移至總部後台",
  description = "AI 管家由總部統一訓練與管理，相關設定已集中到總部後台。",
  hqPath = "/hq/ai-training",
}: {
  title?: string;
  description?: string;
  hqPath?: string;
}) {
  const href = `${HQ_ORIGIN}${hqPath}`;
  return (
    <div className="admin-theme min-h-[60vh] flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <MoveRight className="h-6 w-6 text-muted-foreground" />
          </div>
          <CardTitle className="text-lg">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">{description}</p>
          <Button className="w-full" onClick={() => { window.location.href = href; }}>
            <ExternalLink className="mr-2 h-4 w-4" />
            前往總部後台（hq.lakeze.com）
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default MovedToHQCard;
