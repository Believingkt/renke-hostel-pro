import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import OwnerSettlementSettings from "@/pages/OwnerSettlementSettings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

interface AccOption {
  id: string;
  name: string;
}

/**
 * HQ 整合頁：業主月結設定（跨館別集中管理）。
 * 由此頁選擇館別後，重用 OwnerSettlementSettings（以 prop 覆寫館別，不吃 admin 的 AccommodationContext）。
 */
export default function HQOwnerSettlementSettings() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [accs, setAccs] = useState<AccOption[]>([]);

  const accId = searchParams.get("acc") ?? "global";

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("accommodation_info")
        .select("id, name")
        .order("name");
      setAccs(((data ?? []) as AccOption[]).filter((a) => a.id && a.name));
    })();
  }, []);

  const override = useMemo(() => (accId === "global" ? null : accId), [accId]);

  return (
    <div className="container mx-auto py-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate("/hq")}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          回總部
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>業主月結設定（總部集中管理）</CardTitle>
          <CardDescription>
            選擇館別後編輯該館設定；選「全站預設值」時僅套用於尚未建立獨立設定的館別。
          </CardDescription>
        </CardHeader>
        <CardContent className="max-w-sm">
          <Select
            value={accId}
            onValueChange={(v) => setSearchParams(v === "global" ? {} : { acc: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="選擇館別" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="global">全站預設值</SelectItem>
              {accs.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <OwnerSettlementSettings key={accId} accommodationIdOverride={override} hideBackButton />
    </div>
  );
}
