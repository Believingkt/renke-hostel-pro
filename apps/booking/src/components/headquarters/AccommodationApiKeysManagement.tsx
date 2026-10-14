import { Link } from "react-router-dom";
import { Button } from "@lakeze/shared/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@lakeze/shared/components/ui/card";
import { KeyRound } from "lucide-react";

// 金鑰建立已移至 /hq/pms-api-keys（伺服器端產生）；此處僅保留入口。
export function AccommodationApiKeysManagement() {
  return (
    <Card data-testid="api-keys-entry-card">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" />民宿 API Keys</CardTitle>
            <CardDescription>金鑰的產生、停用與刪除已移至獨立的「PMS API 金鑰」頁面，金鑰改由伺服器端產生。</CardDescription>
          </div>
          <Button asChild data-testid="api-keys-entry-link">
            <Link to="/hq/pms-api-keys">前往 PMS API 金鑰管理</Link>
          </Button>
        </div>
      </CardHeader>
    </Card>
  );
}
