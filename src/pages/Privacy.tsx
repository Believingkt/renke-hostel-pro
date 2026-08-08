import { Link } from "react-router-dom";
import { Home } from "lucide-react";
import lakezeLogo from "@/assets/lakeze-portal-logo.png";

const EFFECTIVE_DATE = "2026 年 8 月 8 日";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-2">
    <h2 className="text-lg font-semibold text-[hsl(24,100%,35%)]">{title}</h2>
    {children}
  </section>
);

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
        <article className="bg-white rounded-2xl shadow-sm border border-orange-100 p-6 sm:p-10 space-y-6 text-[15px] sm:text-base text-foreground leading-relaxed">
          <header className="border-b border-orange-100 pb-4">
            <h1 className="text-2xl sm:text-3xl font-bold text-[hsl(24,100%,35%)]">
              人客多（Lakeze）隱私權政策
            </h1>
            <p className="text-sm text-muted-foreground mt-2">生效日期：{EFFECTIVE_DATE}</p>
          </header>

          <p>
            人客多（以下稱「本平台」，網址 booking.lakeze.com 及人客多 App）重視您的隱私。
            本政策說明我們如何蒐集、使用及保護您的個人資料。使用本平台服務即表示您瞭解並同意本政策內容。
          </p>

          <Section title="一、我們蒐集的資料">
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>會員與訂房資料：</strong>
                姓名、電子郵件、聯絡電話、訂房內容（民宿、日期、人數、金額）與訂單紀錄。
              </li>
              <li>
                <strong>付款資料：</strong>
                線上刷卡由金流服務商 TapPay 處理，信用卡卡號不會儲存於本平台；ATM 轉帳僅記錄繳費帳號與付款狀態。
              </li>
              <li>
                <strong>客服與 AI 管家對話：</strong>
                您與客服或 AI 管家的訊息內容，用於回覆您的問題與改善服務品質。
              </li>
              <li>
                <strong>裝置與使用紀錄：</strong>
                瀏覽器類型、裝置資訊、操作紀錄等，用於維運與安全防護。
              </li>
            </ul>
          </Section>

          <Section title="二、資料使用目的">
            <p>
              我們僅在下列目的範圍內使用您的資料：處理與管理訂房、寄送訂單確認與付款通知、
              提供客服與 AI 管家服務、會員優惠與紅利作業、履行法令義務，以及維護平台安全。
            </p>
          </Section>

          <Section title="三、資料的分享對象">
            <p>除下列情形外，我們不會將您的個人資料提供給第三人：</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>為完成訂房，提供必要的訂房資訊（姓名、電話、入住資訊）給您所預訂的民宿業者。</li>
              <li>為完成付款，透過 TapPay 金流服務處理交易。</li>
              <li>為寄送通知信件，透過電子郵件服務（Resend）寄出。</li>
              <li>依法令規定或主管機關要求。</li>
            </ul>
          </Section>

          <Section title="四、資料保存與安全">
            <p>
              您的資料儲存於具備存取控制與加密傳輸（HTTPS）的雲端服務。
              訂單與會員資料在會員關係存續期間保存；法令另有規定者，依其規定期間保存。
            </p>
          </Section>

          <Section title="五、您的權利">
            <p>
              依個人資料保護法，您可就您的個人資料行使查詢、閱覽、複製、更正、停止蒐集處理利用及刪除之權利。
              如欲行使上述權利或刪除帳號，請來信
              <a href="mailto:service@lakeze.com" className="text-[hsl(24,100%,40%)] underline mx-1">
                service@lakeze.com
              </a>
              ，我們將於合理期間內處理。
            </p>
          </Section>

          <Section title="六、Cookie 與類似技術">
            <p>本平台使用必要的 Cookie 以維持登入狀態與基本功能運作，不用於跨站廣告追蹤。</p>
          </Section>

          <Section title="七、未成年人">
            <p>本平台服務對象為成年人。未滿十八歲者，應由法定代理人代為訂房。</p>
          </Section>

          <Section title="八、政策修訂">
            <p>本政策如有修訂，將公告於本頁面。重大變更時，我們會以適當方式通知您。</p>
          </Section>

          <Section title="九、聯絡我們">
            <p>
              如對本政策有任何疑問，請來信：
              <a href="mailto:service@lakeze.com" className="text-[hsl(24,100%,40%)] underline mx-1">
                service@lakeze.com
              </a>
            </p>
          </Section>
        </article>
      </main>
    </div>
  );
}
