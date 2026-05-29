import { Link } from "react-router-dom";
import { Home } from "lucide-react";
import lakezeLogo from "@/assets/lakeze-portal-logo.png";

const EFFECTIVE_DATE = "2026 年 5 月 29 日";

export default function DataDeletion() {
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
            <h1 className="text-2xl sm:text-3xl font-bold text-[hsl(24,100%,35%)]">用戶資料刪除說明</h1>
            <p className="text-sm text-muted-foreground mt-2">生效日：{EFFECTIVE_DATE}</p>
          </header>

          <section className="space-y-3">
            <p>
              你的資料屬於你自己。如果你希望離開「人客多（Lakeze）」並刪除帳號，
              我們會盡快協助你完成。以下是我們的處理流程，請放心閱讀。
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-[hsl(24,100%,35%)]">一、如何請求刪除你的資料</h2>
            <p>你可以使用以下任一方式提出刪除申請：</p>
            <ol className="list-decimal pl-5 space-y-2">
              <li>
                <strong>線上自助：</strong>
                登入<Link to="/member/profile" className="text-[hsl(24,100%,40%)] underline mx-1">會員中心 → 個人資料</Link>
                頁面，點選「刪除帳號」按鈕並依指示完成確認。
              </li>
              <li>
                <strong>來信申請：</strong>
                寄送 Email 至
                <a href="mailto:nokimi@gmail.com" className="text-[hsl(24,100%,40%)] underline mx-1">nokimi@gmail.com</a>
                ，主旨請註明
                <span className="bg-orange-50 px-1.5 py-0.5 rounded text-[hsl(24,100%,35%)] mx-1">「請刪除我的人客多帳號」</span>
                ，並在信中附上註冊使用的 Email，方便我們核對身分。
              </li>
            </ol>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-[hsl(24,100%,35%)]">二、哪些資料會被刪除</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>會員個人資料（姓名、Email、電話、大頭貼、社群登入綁定）。</li>
              <li>會員紅利點數、優惠券、收藏紀錄。</li>
              <li>與民宿 AI 管家或客服的對話歷史。</li>
              <li>系統登入紀錄（將進行匿名化處理）。</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-[hsl(24,100%,35%)]">三、哪些資料可能會保留</h2>
            <p>
              依據中華民國稅務、會計與消費爭議處理相關法規，
              <strong>已完成的訂單與金流交易紀錄</strong>可能會保留 5 至 7 年。
              這些紀錄會與你的個人身分脫鉤，僅作為帳務憑證使用，不會再用於行銷或個人化推薦。
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-[hsl(24,100%,35%)]">四、預期處理時間</h2>
            <p>
              我們會在收到申請後的 <strong>30 天內</strong>完成刪除作業，多數情況下會在 7 個工作天內處理完畢。
              完成後我們會主動以 Email 告知你結果。
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-[hsl(24,100%,35%)]">五、Facebook 用戶的資料刪除</h2>
            <p>
              如果你是透過 Facebook 登入人客多，並希望請求刪除我們所保存的相關資料，
              請依照上述「如何請求刪除你的資料」的同一流程提出申請即可。
              我們會同步移除 Facebook 提供給我們的識別碼、姓名、大頭貼與 Email 等欄位。
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-[hsl(24,100%,35%)]">六、聯絡我們</h2>
            <p>
              任何刪除流程的疑問，歡迎來信
              <a href="mailto:nokimi@gmail.com" className="text-[hsl(24,100%,40%)] underline mx-1">nokimi@gmail.com</a>
              ，我們會用最快的速度回覆你。
            </p>
          </section>

          <footer className="pt-4 border-t border-orange-100 text-sm text-muted-foreground">
            想了解更多資料處理細節，可以參考
            <Link to="/privacy" className="text-[hsl(24,100%,40%)] underline mx-1">隱私政策</Link>
            頁面。
          </footer>
        </article>
      </main>
    </div>
  );
}
