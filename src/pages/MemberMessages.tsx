import { useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  MessageSquare,
  ClipboardList,
  Coins,
  Gift,
  Sparkles,
  Bell,
  X,
  Phone,
  BedDouble,
  Plane,
  Building2,
  Car,
  Headphones,
  ChevronRight,
} from "lucide-react";

type TabKey = "all" | "chat" | "order" | "reward" | "promo" | "interact";

const tabs: { key: TabKey; label: string; badge?: number; dot?: boolean }[] = [
  { key: "all", label: "全部" },
  { key: "chat", label: "對話", badge: 3 },
  { key: "order", label: "訂單", dot: true },
  { key: "reward", label: "獎勵", dot: true },
  { key: "promo", label: "優惠", dot: true },
  { key: "interact", label: "互動", dot: true },
];

const quickTiles = [
  { key: "chat" as TabKey, label: "對話", icon: MessageSquare, badge: 3, tone: "bg-orange-100 text-orange-600" },
  { key: "order" as TabKey, label: "訂單", icon: ClipboardList, dot: true, tone: "bg-blue-100 text-blue-600" },
  { key: "reward" as TabKey, label: "獎勵", icon: Coins, dot: true, tone: "bg-amber-100 text-amber-600" },
  { key: "promo" as TabKey, label: "優惠", icon: Gift, dot: true, tone: "bg-pink-100 text-pink-600" },
  { key: "interact" as TabKey, label: "互動", icon: Sparkles, dot: true, tone: "bg-purple-100 text-purple-600" },
];

const chatItems = [
  { icon: Phone, iconTone: "bg-blue-50 text-blue-500", title: "客服通話紀錄", subtitle: "[去電] 您已撥打至 Lakeze 客服", time: "昨天" },
  { icon: BedDouble, iconTone: "bg-orange-50 text-orange-500", title: "森山民宿", subtitle: "訂單 LK2026001 的入住時間為 2026-01-15", time: "昨天" },
  { icon: Headphones, iconTone: "bg-emerald-50 text-emerald-500", title: "住宿服務對話", subtitle: "會話已結束", time: "7 月 9 日", badge: 2 },
  { icon: Building2, iconTone: "bg-sky-50 text-sky-500", title: "雲岫海景會館", subtitle: "您可能想問…", time: "星期四" },
  { icon: Plane, iconTone: "bg-indigo-50 text-indigo-500", title: "行程服務諮詢", subtitle: "已收到您近期訂單的行程需求…", time: "星期四" },
];

const orderItems = [
  { title: "您最近的住宿如何？", subtitle: "我們想聽聽您在森山民宿的住宿體驗…", time: "週日", unread: true },
  { title: "您最近的住宿如何？", subtitle: "我們想聽聽您在雲岫海景會館的住宿體驗…", time: "7 月 10 日", unread: true },
  { title: "您的訂單已確認！", subtitle: "您預訂的住宿：雲岫海景會館 (訂單 LK2026002)", time: "7 月 7 日" },
  { title: "已完成入住", subtitle: "感謝您入住 森山民宿，期待再次見到您", time: "7 月 4 日" },
  { title: "訂單付款成功", subtitle: "訂單 LK2026003 付款已收到", time: "7 月 2 日" },
];

const rewardItems = [
  { title: "紅利點數已入帳", subtitle: "您有 320 點紅利剛入帳！", time: "昨天" },
  { title: "紅利點數已入帳", subtitle: "您有 180 點紅利剛入帳！", time: "7 月 11 日" },
  { title: "紅利點數即將到期", subtitle: "查看您的餘額並開始省！", time: "7 月 8 日" },
  { title: "紅利點數已入帳", subtitle: "您有 450 點紅利剛入帳！", time: "7 月 5 日" },
];

const promoItems = [
  { title: "夏日出遊 訂房 8 折起 🌊", subtitle: "👉 森山、雲岫、Olivia 精選民宿限時優惠", time: "昨天" },
  { title: "刷 VISA 訂房再折 3% 💳", subtitle: "👉 Visa 卡友專屬 3% 折扣「無上限」", time: "7 月 8 日" },
  { title: "7 月限定 訂房 6 折起 🏖️", subtitle: "👉 東北角、宜蘭、花蓮精選房型", time: "7 月 2 日" },
  { title: "會員限定優惠 ❤️", subtitle: "👉 高達 $2,000 優惠代碼", time: "6 月 26 日" },
];

const interactItems = [
  { title: "填寫評鑑問卷，贏取住宿金", subtitle: "尊敬的會員，參與填寫問卷，有機會獲得高額住宿金！", time: "昨天" },
  { title: "🔥 Lakeze Moments 分享您的旅程", subtitle: "分享旅行瞬間，最多可獲得 1200 點紅利獎勵！", time: "週日", unread: true },
  { title: "最近的智慧管家對話", subtitle: "您的搜尋：宜蘭 7/15 – 7/16，1 房 4 位成人…", time: "7 月 4 日" },
];

const MessageRow = ({
  icon: Icon,
  iconTone,
  title,
  subtitle,
  time,
  unread,
  badge,
}: {
  icon?: any;
  iconTone?: string;
  title: string;
  subtitle: string;
  time: string;
  unread?: boolean;
  badge?: number;
}) => (
  <div className="flex items-start gap-3 py-3 border-b last:border-b-0 border-border/60">
    {Icon && (
      <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${iconTone ?? "bg-muted text-muted-foreground"}`}>
        <Icon className="h-5 w-5" />
      </div>
    )}
    <div className="flex-1 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-semibold text-foreground truncate">{title}</h4>
        <span className="text-[11px] text-muted-foreground shrink-0">{time}</span>
      </div>
      <div className="flex items-center justify-between gap-2 mt-0.5">
        <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
        {badge ? (
          <span className="text-[10px] bg-orange-500 text-white rounded-full px-1.5 min-w-[18px] h-[18px] flex items-center justify-center shrink-0">
            {badge}
          </span>
        ) : unread ? (
          <span className="h-2 w-2 rounded-full bg-orange-500 shrink-0" />
        ) : null}
      </div>
    </div>
  </div>
);

const SectionCard = ({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) => (
  <Card className="p-4 shadow-sm">
    <div className="flex items-center justify-between mb-1">
      <h3 className="text-sm font-semibold">{title}</h3>
      {action}
    </div>
    <div>{children}</div>
  </Card>
);

const MemberMessages = () => {
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [notifyOn, setNotifyOn] = useState(false);
  const [showBanner, setShowBanner] = useState(true);

  const renderList = (items: any[]) => (
    <div>
      {items.map((it, i) => (
        <MessageRow key={i} {...it} />
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Page title */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">
          訊息<span className="text-orange-500">.</span>
        </h1>
      </div>

      {/* Notify banner */}
      {showBanner && (
        <Card className="p-3 border-orange-200 bg-orange-50/60">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowBanner(false)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="關閉"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="h-8 w-8 rounded-full bg-orange-500 text-white flex items-center justify-center shrink-0">
              <Bell className="h-4 w-4" />
            </div>
            <p className="text-xs sm:text-sm text-foreground/80 flex-1">
              開啟通知以免錯過新訊息與訂單更新
            </p>
            <Switch checked={notifyOn} onCheckedChange={setNotifyOn} />
          </div>
        </Card>
      )}

      {/* Quick tiles */}
      <Card className="p-4 shadow-sm">
        <div className="grid grid-cols-5 gap-2">
          {quickTiles.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className="flex flex-col items-center gap-1.5 py-1"
            >
              <div className={`relative h-12 w-12 rounded-full flex items-center justify-center ${t.tone}`}>
                <t.icon className="h-6 w-6" />
                {t.badge ? (
                  <span className="absolute -top-0.5 -right-0.5 text-[10px] bg-orange-500 text-white rounded-full px-1 min-w-[18px] h-[18px] flex items-center justify-center">
                    {t.badge}
                  </span>
                ) : t.dot ? (
                  <span className="absolute top-0 right-0 h-2.5 w-2.5 rounded-full bg-orange-500 ring-2 ring-white" />
                ) : null}
              </div>
              <span className="text-xs font-medium">{t.label}</span>
            </button>
          ))}
        </div>
      </Card>

      {/* Tabs */}
      <div className="flex gap-4 overflow-x-auto -mx-1 px-1 border-b">
        {tabs.map((t) => {
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`relative pb-2 pt-1 text-sm whitespace-nowrap transition-colors ${
                active ? "text-orange-500 font-semibold" : "text-muted-foreground"
              }`}
            >
              {t.label}
              {t.badge ? (
                <span className="ml-1 inline-flex items-center justify-center text-[10px] bg-orange-500 text-white rounded-full px-1 min-w-[16px] h-[16px] align-middle">
                  {t.badge}
                </span>
              ) : t.dot ? (
                <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-orange-500 align-middle" />
              ) : null}
              {active && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-orange-500 rounded-full" />}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {activeTab === "all" && (
        <div className="space-y-4">
          <SectionCard
            title="聊天記錄"
            action={
              <button onClick={() => setActiveTab("chat")} className="text-xs text-orange-500 flex items-center">
                查看全部 <ChevronRight className="h-3 w-3" />
              </button>
            }
          >
            {renderList(chatItems.slice(0, 3))}
          </SectionCard>

          <SectionCard
            title="訂單通知"
            action={
              <button onClick={() => setActiveTab("order")} className="text-xs text-orange-500 flex items-center">
                查看全部 <ChevronRight className="h-3 w-3" />
              </button>
            }
          >
            {renderList(orderItems.slice(0, 3))}
          </SectionCard>

          <SectionCard title="精選優惠" action={
            <button onClick={() => setActiveTab("promo")} className="text-xs text-orange-500 flex items-center">
              查看全部 <ChevronRight className="h-3 w-3" />
            </button>
          }>
            {renderList(promoItems.slice(0, 2))}
          </SectionCard>
        </div>
      )}

      {activeTab === "chat" && <SectionCard title="對話">{renderList(chatItems)}</SectionCard>}
      {activeTab === "order" && <SectionCard title="訂單通知">{renderList(orderItems)}</SectionCard>}
      {activeTab === "reward" && <SectionCard title="紅利獎勵">{renderList(rewardItems)}</SectionCard>}
      {activeTab === "promo" && <SectionCard title="推廣優惠">{renderList(promoItems)}</SectionCard>}
      {activeTab === "interact" && <SectionCard title="互動">{renderList(interactItems)}</SectionCard>}

      {/* Footer safety note */}
      <div className="text-center py-4 text-xs text-muted-foreground">
        在 Lakeze 人客多 安心預訂　·　30 秒內獲得客服協助
      </div>
    </div>
  );
};

export default MemberMessages;
