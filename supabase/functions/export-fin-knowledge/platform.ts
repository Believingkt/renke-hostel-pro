// 平台層級知識（accommodation_id=platform）：整理自前台文案，繁中原文。
// 來源：
//  - packages/shared/src/lib/bookingI18n.ts（booking.portal.hero.* / promo.*）
//  - apps/booking/src/pages/BookingFlow.tsx（付款方式卡片文案）
//  - packages/shared/src/lib/cancellation-policy.ts（TW_DEFAULT_CANCEL_RULES，級距文字逐字相同；有測試比對）
//  - apps/booking/src/pages/MemberProfile.tsx、MemberPoints.tsx（紅利點數）
//  - apps/booking/src/pages/Privacy.tsx（客服信箱）
import { BOOKING_BASE_URL } from "../fin-availability/core.ts";
import { FOOTER_LINE, renderKnowledge, section } from "./core.ts";

export const TW_DEFAULT_CANCEL_LABELS = [
  "住宿日當日取消，扣 100%",
  "住宿日前 1 日內取消，扣 80%",
  "住宿日前 2–3 日內取消，扣 70%",
  "住宿日前 4–6 日內取消，扣 60%",
  "住宿日前 7–9 日內取消，扣 50%",
  "住宿日前 10–13 日內取消，扣 30%",
  "住宿日前 14 日（含）以前取消，不收取費用",
];

// deno-lint-ignore no-explicit-any
export function renderPlatformMarkdown(date: string, knowledge: Record<string, any>[] = []): string {
  // 總部全域知識（ai_knowledge.accommodation_id IS NULL 且 is_active）
  const kb = section("## 知識庫", renderKnowledge(knowledge));
  return `來源：人客多系統匯出 ${date}

# 人客多 Lakeze 訂房平台

## 人客多是什麼

人客多（Lakeze）是專注於優質包棟民宿的線上訂房平台：探索優質包棟民宿，提供會員優惠、安心付款、免費取消（依各民宿取消政策）。

- 適合人數：6–10 人、12–16 人、16 人以上的團體出遊
- 訂房網站：${BOOKING_BASE_URL}

## 如何訂房

1. 前往 ${BOOKING_BASE_URL} 依地區、入住／退房日期與人數搜尋，或直接開啟民宿專屬網址（${BOOKING_BASE_URL}/民宿代號）。
2. 在民宿頁選擇入住方案（包棟／包區方案或房型），確認日期與人數；兒童人數依各民宿的兒童規定計價。
3. 填寫訂房人資料、選擇付款方式後送出訂單。
4. 付款或綁卡完成後會收到訂房確認信；會員可在會員中心查看訂單。

## 付款方式

- 信用卡（立即付款）：送出訂單時即以信用卡扣取全額，付款成功即完成訂房（需通過 3D 驗證）。
- 信用卡（入住當天扣款）：訂房時只綁定卡片、不扣款；入住當天由系統自動扣取全額，14 天前取消不收費。
- ATM 虛擬帳號轉帳：只需先匯訂金（比例依各民宿設定），尾款入住現場付清；虛擬帳號繳費期限 20 分鐘。
- 各民宿提供的付款方式不同，以訂房頁實際顯示為準。

## 取消政策

未另行約定時，依下列級距收取取消費用：

${TW_DEFAULT_CANCEL_LABELS.map((l) => `- ${l}`).join("\n")}

選擇「信用卡（立即付款）」的訂單，取消依「預收房價總額」制度退款：住宿日前 3 日以前取消退 100%、前 1～2 日退 50%、當日取消不退款。

各民宿可能另有取消規定，以訂房頁與訂房確認信為準。

## 會員點數

- 新會員優惠：註冊即享首訂折扣；另有平台專屬折扣碼（限時優惠券）。
- 紅利回饋：入住後回饋紅利點數，每筆訂房最高可得 10% 紅利點數。
- 點數紀錄可在會員中心的「紅利點數」查看，包含消費回饋、點數兌換、點數過期等異動。

## 客服聯絡方式

- 客服信箱：service@lakeze.com
- 各民宿的電話與 LINE 請見該民宿的知識內容或民宿頁面。

${kb ? `${kb}\n` : ""}---

${FOOTER_LINE}
`;
}
