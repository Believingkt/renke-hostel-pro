import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Code, Coins, Building2, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { SEOHead } from "@/components/SEOHead";

const apiDocs = [
  {
    title: "網紅導購 API",
    subtitle: "KOL API",
    description: "查詢網紅導購訂單、統計數據、佣金記錄與分潤明細。",
    icon: TrendingUp,
    path: "/kol-api-docs",
  },
  {
    title: "會員點數 API",
    subtitle: "Loyalty Points API",
    description: "外部點數系統（如 StarChain）扣抵點數與訂房整合介接。",
    icon: Coins,
    path: "/points-api-docs",
  },
  {
    title: "民宿管理 API",
    subtitle: "Accommodation API",
    description: "各民宿可透過 API Key 查詢與新增房型（含設施與圖片）。",
    icon: Building2,
    path: "/accommodation-api-docs",
  },
];

const ApiDocsHub = () => {
  return (
    <>
      <SEOHead
        title="API 文件中心 | Lakeze Hostel API Documentation"
        description="人客多平台所有 API 文件總覽 - KOL 導購、會員點數、民宿管理 API"
      />
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center gap-4">
              <Link to="/">
                <Button variant="ghost" size="sm" className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  返回首頁
                </Button>
              </Link>
              <div>
                <h1 className="text-xl font-bold">API 文件中心</h1>
                <p className="text-sm text-muted-foreground">API Documentation Hub</p>
              </div>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-12 max-w-5xl">
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
              <Code className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-3xl font-bold mb-3">開放 API 文件</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              本頁集中收錄人客多平台所有對外開放的 API 端點說明。請選擇下方對應的文件開始整合。
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {apiDocs.map((doc) => {
              const Icon = doc.icon;
              return (
                <Link key={doc.path} to={doc.path} className="group">
                  <Card className="h-full transition-all hover:shadow-lg hover:border-primary/40">
                    <CardHeader>
                      <div className="flex items-center justify-between mb-2">
                        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                          <Icon className="h-6 w-6 text-primary" />
                        </div>
                        <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                      </div>
                      <CardTitle className="text-lg">{doc.title}</CardTitle>
                      <CardDescription className="text-xs">{doc.subtitle}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {doc.description}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </main>
      </div>
    </>
  );
};

export default ApiDocsHub;
