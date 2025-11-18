import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart3, Calendar, TrendingUp, Zap } from "lucide-react";

interface EmptyDashboardProps {
  onGenerateData?: () => void;
}

export function EmptyDashboard({ onGenerateData }: EmptyDashboardProps) {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* 主要空狀態卡片 */}
      <Card className="p-8 md:p-12 text-center">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* 圖示 */}
          <div className="flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 rounded-full blur-2xl animate-pulse" />
              <div className="relative bg-gradient-to-br from-primary/10 to-accent/10 p-6 rounded-full">
                <BarChart3 className="h-16 w-16 text-primary" />
              </div>
            </div>
          </div>

          {/* 標題和描述 */}
          <div className="space-y-3">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
              歡迎使用營運分析
            </h2>
            <p className="text-muted-foreground text-base md:text-lg max-w-xl mx-auto">
              目前還沒有任何訂單數據。開始建立訂單，或使用測試數據快速體驗完整功能。
            </p>
          </div>

          {/* 功能說明 */}
          <div className="grid md:grid-cols-3 gap-4 pt-4">
            <div className="p-4 rounded-lg bg-muted/50 space-y-2">
              <div className="flex justify-center">
                <div className="p-2 rounded-lg bg-primary/10">
                  <TrendingUp className="h-5 w-5 text-primary" />
                </div>
              </div>
              <h3 className="font-semibold text-sm">營收追蹤</h3>
              <p className="text-xs text-muted-foreground">
                即時查看營收趨勢與年度對比
              </p>
            </div>

            <div className="p-4 rounded-lg bg-muted/50 space-y-2">
              <div className="flex justify-center">
                <div className="p-2 rounded-lg bg-accent/10">
                  <Calendar className="h-5 w-5 text-accent" />
                </div>
              </div>
              <h3 className="font-semibold text-sm">訂單分析</h3>
              <p className="text-xs text-muted-foreground">
                掌握訂單趨勢與客戶預訂行為
              </p>
            </div>

            <div className="p-4 rounded-lg bg-muted/50 space-y-2">
              <div className="flex justify-center">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <BarChart3 className="h-5 w-5 text-blue-600" />
                </div>
              </div>
              <h3 className="font-semibold text-sm">入住率統計</h3>
              <p className="text-xs text-muted-foreground">
                監控各房型的入住狀況與效率
              </p>
            </div>
          </div>

          {/* 行動按鈕 */}
          {onGenerateData && (
            <div className="pt-4">
              <Button 
                onClick={onGenerateData}
                size="lg"
                className="gap-2 shadow-lg hover:shadow-xl transition-all"
              >
                <Zap className="h-4 w-4" />
                生成測試數據體驗功能
              </Button>
              <p className="text-xs text-muted-foreground mt-3">
                或前往訂單管理頁面建立第一筆訂單
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* 輔助提示卡片 */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-6 hover:shadow-lg transition-shadow">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Calendar className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-semibold">開始建立訂單</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              前往訂單管理頁面，建立您的第一筆預訂記錄，系統會自動開始追蹤營運數據。
            </p>
          </div>
        </Card>

        <Card className="p-6 hover:shadow-lg transition-shadow">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-accent/10">
                <Zap className="h-5 w-5 text-accent" />
              </div>
              <h3 className="font-semibold">使用測試數據</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              快速生成測試訂單數據，立即體驗完整的分析功能與圖表展示效果。
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
