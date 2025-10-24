import { Globe } from "lucide-react";

const WebsiteContent = () => {
  return (
    <div className="flex-1 space-y-6 p-8">
      <div className="flex items-center gap-3">
        <Globe className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold tracking-tight">官網內容</h1>
          <p className="text-muted-foreground">管理網站內容與設定</p>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-8">
        <p className="text-muted-foreground">官網內容管理功能開發中...</p>
      </div>
    </div>
  );
};

export default WebsiteContent;
