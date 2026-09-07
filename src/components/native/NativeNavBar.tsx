import { useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { hapticSelection } from "@/lib/native/haptics";

/** 各路徑對應的 iOS 導覽列標題（找不到時不顯示標題文字） */
const TITLES: Array<{ test: RegExp; title: string; root?: boolean }> = [
  { test: /^\/booking\/?$/, title: "人客多", root: true },
  { test: /^\/booking\/search/, title: "找房", root: true },
  { test: /^\/booking\/villa\//, title: "房源" },
  { test: /^\/member\/orders\/[^/]+/, title: "訂單詳情" },
  { test: /^\/member\/orders/, title: "我的訂單", root: true },
  { test: /^\/member\/messages/, title: "訊息", root: true },
  { test: /^\/member\/profile\/edit/, title: "編輯個人資料" },
  { test: /^\/member\/profile/, title: "我的", root: true },
  { test: /^\/member\/points/, title: "紅利點數" },
  { test: /^\/member\/coupons/, title: "優惠券" },
  { test: /^\/member\/cards/, title: "我的卡片" },
  { test: /^\/member\/favorites/, title: "收藏" },
  { test: /^\/member\/recent-views/, title: "最近瀏覽" },
  { test: /^\/member\/common-info/, title: "常用資料" },
  { test: /^\/member\/referral/, title: "推薦好友" },
  { test: /^\/cart/, title: "購物車" },
  { test: /^\/ai-booking/, title: "AI 管家" },
  { test: /^\/book(\/|$)/, title: "訂房" },
  { test: /^\/payment-result/, title: "付款結果" },
  { test: /^\/order-search/, title: "訂單查詢" },
  { test: /^\/privacy/, title: "隱私權政策" },
  { test: /^\/booking\/atm-info/, title: "匯款資訊" },
  { test: /^\/booking\/[^/]+$/, title: "房源" },
];

export function resolveNativeTitle(pathname: string) {
  return TITLES.find((t) => t.test.test(pathname));
}

/** iOS 樣式頂部導覽列：置中標題 + 左側「‹ 返回」（僅原生 App 掛載） */
export function NativeNavBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const entry = resolveNativeTitle(location.pathname);
  if (!entry) return null;

  const canGoBack = !entry.root;

  return (
    <header
      data-native-nav-bar
      className="fixed inset-x-0 top-0 z-[55] border-b border-border/60 bg-background/90 backdrop-blur-xl"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="relative flex h-11 items-center justify-center px-2">
        {canGoBack && (
          <button
            type="button"
            onClick={() => {
              void hapticSelection();
              navigate(-1);
            }}
            className="absolute left-1 flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[17px] text-primary active:opacity-60"
            aria-label="返回"
          >
            <ChevronLeft className="h-6 w-6" strokeWidth={2.2} />
            <span className="leading-none">返回</span>
          </button>
        )}
        <h1 className="max-w-[60%] truncate text-[17px] font-semibold text-foreground">{entry.title}</h1>
      </div>
    </header>
  );
}

export default NativeNavBar;
