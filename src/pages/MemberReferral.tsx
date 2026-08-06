import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Share2, Users, Gift, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  getMyReferralLink,
  referralUrl,
  lineShareUrl,
  STATUS_LABEL,
  rewardTypeLabel,
  type ReferralCampaign,
  type ReferralRecord,
} from "@/lib/referral";
import { copyText } from "@/lib/tripShare";

const MemberReferral = () => {
  const [loading, setLoading] = useState(true);
  const [campaign, setCampaign] = useState<ReferralCampaign | null>(null);
  const [link, setLink] = useState<ReferralRecord | null>(null);
  const [children, setChildren] = useState<ReferralRecord[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await getMyReferralLink();
        setCampaign(res?.campaign ?? null);
        setLink(res?.link ?? null);
        setChildren(res?.children ?? []);
      } catch {
        toast.error("載入邀請資訊失敗");
      }
      setLoading(false);
    })();
  }, []);

  if (loading) return null;

  if (!campaign || !link) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        目前沒有進行中的邀請活動，敬請期待！
      </Card>
    );
  }

  const url = referralUrl(link.invite_code);
  const registered = children.filter((c) => c.status !== "pending" && c.status !== "clicked").length;
  const rewarded = children.filter((c) => c.status === "rewarded").length;
  const totalReward = children
    .filter((c) => c.status === "rewarded")
    .reduce((s, c) => s + Number(c.reward_value || 0), 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">邀請好友</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{campaign.name}</p>
      </div>

      <Card className="p-4 border-0 text-white bg-gradient-to-br from-[hsl(24,100%,52%)] to-[hsl(12,90%,58%)] shadow-lg">
        <div className="flex items-center gap-2 mb-2">
          <Gift className="h-5 w-5" />
          <span className="text-sm font-semibold">專屬邀請碼</span>
        </div>
        <div className="text-2xl font-bold tracking-[0.2em] mb-3">{link.invite_code}</div>
        <div className="rounded-lg bg-white/15 px-3 py-2 text-xs break-all mb-3">{url}</div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            className="flex-1 gap-1"
            onClick={async () => {
              const ok = await copyText(url);
              if (ok) toast.success("已複製邀請連結");
              else toast.error("複製失敗");
            }}
          >
            <Copy className="h-4 w-4" /> 複製連結
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="flex-1 gap-1"
            onClick={() => window.open(lineShareUrl("一起來訂房！使用我的邀請連結享好禮：", url), "_blank")}
          >
            <Share2 className="h-4 w-4" /> LINE 分享
          </Button>
        </div>
      </Card>

      {campaign.description && (
        <Card className="p-4 text-sm text-muted-foreground whitespace-pre-wrap">
          {campaign.description}
        </Card>
      )}

      {Array.isArray(campaign.reward_tiers) && campaign.reward_tiers.length > 0 && (
        <Card className="p-4 space-y-2">
          <div className="text-sm font-medium">獎勵規則</div>
          {campaign.reward_tiers.map((t) => (
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

      <div className="grid grid-cols-3 gap-2">
        <StatCard icon={Users} label="已註冊" value={registered} />
        <StatCard icon={CheckCircle2} label="已發獎" value={rewarded} />
        <StatCard icon={Gift} label="累計獎勵" value={totalReward} />
      </div>

      <Card className="p-0 overflow-hidden divide-y divide-border/60">
        <div className="px-4 py-3 text-sm font-medium">邀請紀錄</div>
        {children.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            尚無邀請紀錄，快分享給好友吧！
          </div>
        ) : (
          children.map((c) => (
            <div key={c.id} className="px-4 py-3 flex items-center gap-3 text-sm">
              <div className="flex-1 min-w-0">
                <div className="truncate">好友 {c.invitee_id?.slice(0, 8) || "—"}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(c.created_at).toLocaleDateString("zh-TW")}・第 {c.tier} 層
                </div>
              </div>
              {c.status === "rewarded" && (
                <span className="text-xs tabular-nums text-[hsl(24,100%,50%)]">
                  +{Number(c.reward_value || 0).toLocaleString()}
                </span>
              )}
              <Badge variant={c.status === "rewarded" ? "default" : "secondary"}>
                {STATUS_LABEL[c.status] || c.status}
              </Badge>
            </div>
          ))
        )}
      </Card>
    </div>
  );
};

const StatCard = ({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) => (
  <Card className="p-3">
    <Icon className="h-4 w-4 text-[hsl(24,100%,50%)] mb-1" />
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="text-lg font-bold tabular-nums leading-tight">{value.toLocaleString()}</div>
  </Card>
);

export default MemberReferral;
