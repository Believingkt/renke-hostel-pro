import { Link } from "react-router-dom";
import { Home } from "lucide-react";
import lakezeLogo from "@/assets/lakeze-portal-logo.png";

const EFFECTIVE_DATE = "2026 年 5 月 29 日";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white">
      <header className="max-w-3xl mx-auto px-4 sm:px-6 pt-8 pb-4 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2" aria-label="返回人客多首頁">
          <img src={lakezeLogo} alt="Lakeze 人客多" className="h-12 sm:h-14 object-contain" />
        </Link>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-[hsl(24,100%,40%)] hover:text-[hsl(24,100%,30%)] underline-offset-4 hover:underline"
        >
          <Home className="h-4 w-4" />
          返回首頁
        </Link>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 pb-16">
        <article className="bg-white rounded-2xl shadow-sm border border-orange-100 p-6 sm:p-10 space-y-6 text-foreground leading-relaxed">
          <header className="border-b border-orange-100 pb-4">
            <h1 className="text-2xl sm:text-3xl font-bold text-[hsl(24,100%,35%)]">隱私政策</h1>
            <p className="text-sm text-muted-foreground mt-2">生效日：{EFFECTIVE_DATE}</p>
          </header>

          <section className="space-y-3">
            <p>
              歡迎使用「人客多（Lakeze）」訂房平台。我們相信信任是住宿體驗的起點，
              因此我們會用最直接的方式告訴你：我們會收集哪些資料、為什麼需要這些資料，
              以及你隨時可以怎麼掌握自己的個人資訊。
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-[hsl(24,100%,35%)]">一、我們會收集的資料</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>基本身分資料：姓名、Email、聯絡電話。</li>
              <li>會員資料：大頭貼（Avatar）、暱稱、登入方式（Email / LINE / Facebook）。</li>
              <li>訂房紀錄：所有透過本平台建立的訂單、入住日期、房型、加購項目、金額與付款結果。</li>
              <li>互動紀錄：你與民宿 AI 管家或客服的對話內容（用於提供服務與品質改善）。</li>
              <li>技術資訊：登入時間、裝置類型與 IP 位置（用於帳號安全與防止盜用）。</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-[hsl(24,100%,35%)]">二、使用這些資料的目的</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>完成你的訂房、付款、入住通知與相關客服聯繫。</li>
              <li>計算與發放會員紅利點數、優惠券。</li>
              <li>寄送訂單確認、入住提醒等必要通知信。</li>
              <li>提供更貼近你需求的住宿建議與民宿資訊。</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-[hsl(24,100%,35%)]">三、第三方分享原則</h2>
            <p>
              我們<strong>不會把你的個人資料販售或租借給任何第三方</strong>。
              僅在以下必要情境下才會分享：你所預訂的民宿（為了完成入住）、
              金流服務商（為了處理付款）、以及法律明確要求的政府機關。
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-[hsl(24,100%,35%)]">四、使用 LINE / Facebook 登入時取得的欄位</h2>
            <p>當你選擇使用社群帳號登入時，我們僅向平台取得最基本的識別資訊：</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>LINE</strong>：使用者識別碼（userId）、顯示名稱（displayName）、大頭貼（pictureUrl）、Email（若你同意提供）。</li>
              <li><strong>Facebook</strong>：使用者識別碼（id）、姓名（name）、大頭貼（picture）、Email（若你同意提供）。</li>
            </ul>
            <p>我們不會讀取你的好友清單、貼文、訊息或其他社群活動資料。</p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-[hsl(24,100%,35%)]">五、你的權利</h2>
            <p>
              你可以隨時登入「會員中心 → 個人資料」查詢與更新你的資料，
              也可以要求<strong>刪除帳號</strong>。詳細刪除流程請見
              <Link to="/data-deletion" className="text-[hsl(24,100%,40%)] underline mx-1">用戶資料刪除說明</Link>
              頁面。
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-[hsl(24,100%,35%)]">六、資料保留期限</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>會員基本資料：自帳號刪除起 30 天內完成清除。</li>
              <li>訂單與金流交易紀錄：依據稅務與會計法規，最長可能保留 5 至 7 年。</li>
              <li>系統日誌與安全紀錄：最長保留 12 個月。</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-[hsl(24,100%,35%)]">七、聯繫我們</h2>
            <p>
              對於本隱私政策、個資使用或任何疑問，歡迎來信聯繫我們：
              <a href="mailto:nokimi@gmail.com" className="text-[hsl(24,100%,40%)] underline mx-1">nokimi@gmail.com</a>
              。我們會在合理時間內回覆你。
            </p>
          </section>

          <footer className="pt-4 border-t border-orange-100 text-sm text-muted-foreground">
            本政策可能不定期更新，最新版本將公告於本頁面。
          </footer>
        </article>
      </main>
    </div>
  );
}
