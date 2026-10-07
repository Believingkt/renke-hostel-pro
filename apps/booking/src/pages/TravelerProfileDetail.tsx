import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAliasPrefix } from "@lakeze/shared/hooks/use-alias-prefix";
import { Button } from "@lakeze/shared/components/ui/button";
import { ArrowLeft } from "lucide-react";
import TravelerDetailBody from "@/components/traveler/TravelerDetailBody";

/** 保留的整頁路由 /hq/cdp/:id、/:alias/admin/cdp/:id，內容與列表 drawer 共用同一元件。 */
export default function TravelerProfileDetail() {
  const { travelerId } = useParams();
  const navigate = useNavigate();
  const { withPrefix } = useAliasPrefix();
  const isHQ = useLocation().pathname.startsWith("/hq");

  if (!travelerId) return null;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(isHQ ? "/hq/cdp" : withPrefix("/admin/cdp"))} data-testid="traveler-detail-back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">旅客詳情</h1>
      </div>
      <TravelerDetailBody travelerId={travelerId} />
    </div>
  );
}
