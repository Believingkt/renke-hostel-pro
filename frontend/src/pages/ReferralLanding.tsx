import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Gift, Sparkles, UserPlus } from "lucide-react";
import { trackReferralClick, rememberInviteCode, rewardTypeLabel, type RewardTier } from "@/lib/referral";
import portalLogo from "@/assets/lakeze-portal-logo.png";

/** /r/:inviteCode — 受邀落地頁：說明獎勵並導向註冊 */
const ReferralLanding = () => {
  const { inviteCode = "" } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<any>(null);
  const [valid, setValid] = useState<boolean | null>(null);

  useEffect(() => {
    if (!inviteCode) return;
    rememberInviteCode(inviteCode);
    trackReferralClick(inviteCode);
    (async () => {
      const { data: rec } = await (supabase as any)
        .from("referral_records")
        .select("campaign_id")
        .eq("invite_code", inviteCode)
        .maybeSingle();
      if (!rec) {
        setValid(false);
        return;
      }
      const { data: c } = await (supabase as any)
        .from("referral_campaigns")
        .select("*")
        .eq("id", rec.campaign_id)
        .maybeSingle();
      setCampaign(c);
      setValid(true);
    })();
  }, [inviteCode]);

  if (valid === null) return null;

  const tiers: RewardTier[] = Array.isArray(campaign?.reward_tiers) ? campaign.reward_tiers : [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white flex flex-col items-center px-4 py-10">
      <img src={portalLogo} alt="Lakeze 人客多" className="h-20 object-contain mb-2" />

      {!valid ? (
        <Card className="p-6 max-w-md w-full text-center space-y-3">
          <div className="text-base font-semibold">邀請連結無效</div>
          <p className="text-sm text-muted-foreground">此邀請碼不存在或已失效，你仍可直接前往訂房。</p>
          <Button className="w-full" onClick={() => navigate("/booking")}>
            前往訂房
          </Button>
        </Card>
      ) : (
        <div className="max-w-md w-full space-y-4">
          <Card className="p-5 border-0 text-white bg-gradient-to-br from-[hsl(24,100%,52%)] to-[hsl(12,90%,58%)] shadow-lg">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-5 w-5" />
              <span className="text-sm font-semibold">好友邀請你加入</span>
            </div>
            <h1 className="text-xl font-bold mb-1">{campaign?.name || "好友邀請活動"}</h1>
            <p className="text-sm text-white/85">邀請碼 {inviteCode}</p>
          </Card>

          {campaign?.description && (
            <Card className="p-4 text-sm text-muted-foreground whitespace-pre-wrap">
              {campaign.description}
            </Card>
          )}

          {tiers.length > 0 && (
            <Card className="p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Gift className="h-4 w-4 text-[hsl(24,100%,50%)]" /> 獎勵說明
              </div>
              {tiers.map((t) => (
                <div key={t.tier} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    第 {t.tier} 層{t.condition ? `・${t.condition}` : ""}
                  </span>
                  <span className="font-medium tabular-nums">
                    {rewardTypeLabel(t.reward_type)} {Number(t.reward_value || 0).toLocaleString()}
                  </span>
                </div>
              ))}
            </Card>
          )}

          <Button
            className="w-full gap-2 bg-[hsl(24,100%,50%)] hover:bg-[hsl(24,100%,45%)] text-white"
            onClick={() => navigate(`/member/auth?invite=${encodeURIComponent(inviteCode)}`)}
          >
            <UserPlus className="h-4 w-4" /> 立即註冊領獎勵
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => navigate("/booking")}>
            先逛逛住宿
          </Button>
        </div>
      )}
    </div>
  );
};

export default ReferralLanding;
