import { Card } from "@/components/ui/card";
import { BarChart3, Calendar, TrendingUp } from "lucide-react";

export function EmptyDashboard() {
  return (
    <div className="space-y-6 animate-fade-in">
      <Card className="p-8 md:p-12 text-center">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 rounded-full blur-2xl animate-pulse" />
              <div className="relative bg-gradient-to-br from-primary/10 to-accent/10 p-6 rounded-full">
                <BarChart3 className="h-16 w-16 text-primary" />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
              歡迎使用營運分析
            </h2>
            <p className="text-muted-foreground text-base md:text-lg max-w-xl mx-auto">
              目前還沒有任何訂單數據。前往訂單管理頁面建立第一筆訂單，系統會自動開始追蹤營運數據。
            </p>
          </div>

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
                <div className="p-2 rounded-lg bg-primary/10">
                  <BarChart3 className="h-5 w-5 text-primary" />
                </div>
              </div>
              <h3 className="font-semibold text-sm">入住率統計</h3>
              <p className="text-xs text-muted-foreground">
                監控各房型的入住狀況與效率
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
