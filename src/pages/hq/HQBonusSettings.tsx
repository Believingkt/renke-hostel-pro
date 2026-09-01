import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import BonusSettingsTab from "@/components/team/BonusSettingsTab";
import RateConsistencyCheckTab from "@/components/team/RateConsistencyCheckTab";
import { pmsHref } from "@/lib/appMode";
import VenueBonusTierRulesTab from "@/components/team/VenueBonusTierRulesTab";
import OwnerSettlementSettings from "@/pages/OwnerSettlementSettings";
import TeamBaseSalaryTab from "@/components/team/TeamBaseSalaryTab";
import CourseProfitShareTab from "@/components/team/CourseProfitShareTab";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

interface AccOption {
  id: string;
  name: string;
}

type SettingsTab = "bonus" | "owner-settlement" | "base-salary" | "venue-tiers" | "rate-check" | "course-profit";

/**
 * HQ 整合頁：獎金設定 ＋ 業主月結設定（總部唯一可編輯入口）。
 * 兩塊內容以 Tab 分流：
 * - bonus：與 /team/commission →「獎金設定」同源（Team 端為唯讀鏡像）
 * - owner-settlement：選擇館別後重用 OwnerSettlementSettings（以 prop 覆寫館別）
 */
export default function HQBonusSettings() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [accs, setAccs] = useState<AccOption[]>([]);
  const [roles, setRoles] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) {
        if (!cancelled) setRoles([]);
        return;
      }
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      if (!cancelled) setRoles((data ?? []).map((r: { role: string }) => r.role));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isHQAdmin = !!roles?.some((r) => r === "super_admin" || r === "admin");
  /** finance：可看全部分頁，但一律唯讀 */
  const isFinanceViewer = !isHQAdmin && !!roles?.some((r) => r === "finance");
  /** 只能看到「業主月結設定」分頁的角色 */
  const ownerSettlementOnly = !isHQAdmin && !isFinanceViewer;
  const canSeeBonus = isHQAdmin || isFinanceViewer;
  const ownerSettlementReadOnly = isFinanceViewer;

  const tabParam = searchParams.get("tab");
  const rawTab: SettingsTab =
    tabParam === "owner-settlement"
      ? "owner-settlement"
      : tabParam === "base-salary"
        ? "base-salary"
        : tabParam === "venue-tiers"
          ? "venue-tiers"
          : tabParam === "rate-check"
            ? "rate-check"
            : tabParam === "course-profit"
              ? "course-profit"
              : "bonus";
  const tab: SettingsTab = ownerSettlementOnly
    ? "owner-settlement"
    : rawTab;

  const accId = searchParams.get("acc") ?? "global";
  const override = useMemo(() => (accId === "global" ? null : accId), [accId]);

  useEffect(() => {
    if (tab !== "owner-settlement" || accs.length > 0) return;
    (async () => {
      const { data } = await supabase
        .from("accommodation_info")
        .select("id, name")
        .order("name");
      setAccs(((data ?? []) as AccOption[]).filter((a) => a.id && a.name));
    })();
  }, [tab, accs.length]);

  const setTab = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === "owner-settlement") next.set("tab", "owner-settlement");
    else if (value === "base-salary") {
      next.set("tab", "base-salary");
      next.delete("acc");
    } else if (value === "venue-tiers") {
      next.set("tab", "venue-tiers");
      next.delete("acc");
    } else if (value === "rate-check") {
      next.set("tab", "rate-check");
      next.delete("acc");
    } else if (value === "course-profit") {
      next.set("tab", "course-profit");
      next.delete("acc");
    } else {
      next.delete("tab");
      next.delete("acc");
    }
    setSearchParams(next, { replace: true });
  };

  /** 依目前選到的館別（?acc=）導向該館 PMS 業主月結頁；未選館別則退回總表 */
  const goOwnerSettlement = async () => {
    if (!override) {
      navigate("/admin/owner-settlement");
      return;
    }
    const { data } = await supabase
      .from("accommodation_info")
      .select("short_url_alias")
      .eq("id", override)
      .maybeSingle();
    const alias = (data as { short_url_alias?: string } | null)?.short_url_alias;
    if (!alias) {
      navigate("/admin/owner-settlement");
      return;
    }
    window.location.href = pmsHref(`/${alias}/admin/owner-settlement`);
  };

  const setAcc = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", "owner-settlement");
    if (value === "global") next.delete("acc");
    else next.set("acc", value);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="container mx-auto space-y-4 py-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => navigate("/team")}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          回團隊獎金頁
        </Button>
        <Button variant="outline" size="sm" onClick={goOwnerSettlement}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          回業主月結
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        {!ownerSettlementOnly && (
          <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <TabsList className="w-max flex-nowrap justify-start">
              {canSeeBonus && <TabsTrigger value="rate-check" className="whitespace-nowrap">設定完整性檢查</TabsTrigger>}
              {canSeeBonus && <TabsTrigger value="bonus" className="whitespace-nowrap">獎金發放規則（4 步流程）</TabsTrigger>}
              {canSeeBonus && <TabsTrigger value="venue-tiers" className="whitespace-nowrap">館別獎金級距規則</TabsTrigger>}
              <TabsTrigger value="owner-settlement" className="whitespace-nowrap">基準金額規則（業主月結）</TabsTrigger>
              {canSeeBonus && <TabsTrigger value="base-salary" className="whitespace-nowrap">成員底薪</TabsTrigger>}
              {canSeeBonus && <TabsTrigger value="course-profit" className="whitespace-nowrap">課程分潤</TabsTrigger>}
            </TabsList>
          </div>
        )}

        {isFinanceViewer && (
          <div className="rounded-md border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
            <span className="font-medium">財務角色為唯讀檢視。</span>
            可查看所有獎金與月結設定內容，但無法新增、修改或刪除；需調整請聯絡總部管理者。
          </div>
        )}

        {canSeeBonus && (
          <TabsContent value="venue-tiers" className="space-y-4">
            <VenueBonusTierRulesTab readOnly={!isHQAdmin} />
          </TabsContent>
        )}


        <TabsContent value="bonus" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>獎金發放規則（總部集中管理）</CardTitle>
              <CardDescription>
                依「一筆訂單實際被計算的順序」分成四步：① 這筆訂單算不算數 → ② 用多少金額當基準 → ③
                分給誰 → ④ 分多少、何時發。最上方的試算檢查器可輸入訂單編號，直接看到該筆訂單在每一步的判定結果。
                所有設定皆為 append-only 版本制，新增生效版本不會覆寫歷史期別的已算金額；
                /team/commission 的「獎金設定」分頁為唯讀鏡像。
                <br />
                注意：這裡的費率是「全站預設值」。若某館別在「館別獎金級距規則」分頁設有獨立階層級距，
                該館的 AM 績效／AM 總管／成交大師績效會改用級距費率，不受此處費率影響。
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0" />
          </Card>

          <BonusSettingsTab readOnly={!isHQAdmin} />
        </TabsContent>

        <TabsContent value="owner-settlement" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>基準金額規則 ｜ 業主月結設定（總部集中管理）</CardTitle>
              <CardDescription>
                這裡設定的抽成門檻、免抽成訂單來源與不列入抽成的增值服務（各館彈性設定，未設定＝全部列入抽成；團隊獎金自 2026-09-10 成交日起適用），
                就是獎金四步流程中「② 用多少金額當基準」的來源，會直接影響成交大師獎金與團隊獎金的基準金額。
                每間民宿獨立設定，沒有全站預設值：請先選擇館別再{ownerSettlementReadOnly ? "檢視" : "編輯"}。
              </CardDescription>
            </CardHeader>
            <CardContent className="max-w-sm space-y-3">
              <Select value={override ?? ""} onValueChange={setAcc}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇館別" />
                </SelectTrigger>
                <SelectContent>
                  {accs.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {override ? (
            <OwnerSettlementSettings
              key={accId}
              accommodationIdOverride={override}
              hideBackButton
              readOnly={ownerSettlementReadOnly}
            />
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                請先於上方選擇要設定的館別。
              </CardContent>
            </Card>
          )}
        </TabsContent>
        {canSeeBonus && (
          <TabsContent value="base-salary" className="space-y-4">
            <TeamBaseSalaryTab readOnly={!isHQAdmin} />
          </TabsContent>
        )}

        {canSeeBonus && (
          <TabsContent value="course-profit" className="space-y-4">
            <CourseProfitShareTab readOnly={!isHQAdmin} />
          </TabsContent>
        )}

        {canSeeBonus && (
          <TabsContent value="rate-check" className="space-y-4">
            <RateConsistencyCheckTab />
          </TabsContent>
        )}

      </Tabs>

    </div>
  );
}
