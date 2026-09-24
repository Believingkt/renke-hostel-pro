import { Card, CardContent, CardHeader, CardTitle } from "@lakeze/shared/components/ui/card";
import { Button } from "@lakeze/shared/components/ui/button";
import { ExternalLink, Copy, AlertTriangle, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

/**
 * Google Business Profile API 教學（PER-ACCOMMODATION / BYO Google Cloud Project）。
 *
 * 主要讀者：hotel_admin / 館別負責人。每一館自行申請、自行持有、自行管理自己的
 * Google Cloud Project 與 OAuth 憑證；平台不提供共用憑證。
 */

const STEPS = [
  { id: "step-01", title: "01 確認貴館 Google Business Profile" },
  { id: "step-02", title: "02 建立貴館自己的 Google Cloud Project" },
  { id: "step-03", title: "03 記錄 Project ID / Project Number" },
  { id: "step-04", title: "04 申請 Business Profile API Access" },
  { id: "step-05", title: "05 等待 Google 審核" },
  { id: "step-06", title: "06 建立 OAuth 2.0 Web Client" },
  { id: "step-07", title: "07 加入 Authorized redirect URI" },
  { id: "step-08", title: "08 取得 Client ID / Client Secret" },
  { id: "step-09", title: "09 回到該館設定頁填入資料" },
  { id: "step-10", title: "10 申請狀態選「已核准」" },
  { id: "step-11", title: "11 連結 Google 商家帳號" },
  { id: "step-12", title: "12 選擇 Account / 商家" },
  { id: "step-13", title: "13 同步評論並套用前台" },
  { id: "step-14", title: "14 Client Secret 安全須知" },
];

const USE_CASE_HINT =
  "請以「貴館自身對 Business Profile API 的實際營運需求」描述用途，例如：管理與呈現本館 Google Business Profile 上的評論內容於本館官方網站。";

const SCOPE = "https://www.googleapis.com/auth/business.manage";

const REDIRECT_URI =
  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-business-profile-oauth-callback`;

const OFFICIAL_LINKS = [
  { label: "Google Cloud Console", url: "https://console.cloud.google.com/" },
  {
    label: "Business Profile API Overview",
    url: "https://developers.google.com/my-business",
  },
  {
    label: "Business Profile API Prerequisites",
    url: "https://developers.google.com/my-business/content/prereqs",
  },
  {
    label: "Business Profile API Policies",
    url: "https://developers.google.com/my-business/content/policies",
  },
  {
    label: "Business Profile API Basic Setup",
    url: "https://developers.google.com/my-business/content/basic-setup",
  },
  {
    label: "OAuth Implementation",
    url: "https://developers.google.com/my-business/content/implement-oauth",
  },
  {
    label: "Google Identity：OAuth 2.0 Overview",
    url: "https://developers.google.com/identity/protocols/oauth2",
  },
];

const ExtLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Button asChild variant="outline" size="sm" className="gap-2">
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <ExternalLink className="h-3.5 w-3.5" />
    </a>
  </Button>
);

const Section = ({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) => (
  <Card id={id} className="scroll-mt-24">
    <CardHeader className="pb-3">
      <CardTitle className="text-lg">{title}</CardTitle>
    </CardHeader>
    <CardContent className="space-y-3 text-sm leading-relaxed">{children}</CardContent>
  </Card>
);

export default function GoogleBusinessProfileApiHelp() {
  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`已複製${label}`);
    } catch {
      toast.error("複製失敗，請手動選取文字");
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold md:text-3xl">
          Google Business Profile API：館別自主申請與設定教學
        </h1>
        <p className="text-sm text-muted-foreground">
          本教學適用於各館館主／館別負責人。每一館使用自己的 Google Cloud 專案與 OAuth 憑證。
        </p>
      </header>

      <Card className="border-primary/40 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">【此功能為館別自主選用】</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm leading-relaxed">
          <p>
            Google Business Profile API 並不是使用人客多平台的必要條件。
            只有當貴館基於自身營運需求，希望自行持有、管理並使用自己的
            Google Business Profile API Project 時，才需要依 Google 官方流程提出申請。
          </p>
          <p>
            人客多不會代替館別申請、持有或管理 Google Cloud Project，
            也不會要求所有館別都必須申請。
          </p>
          <p>
            是否提出申請、申請內容、Google Cloud Project、OAuth 憑證及後續維護，
            均由各館自行決定與管理。
          </p>
          <p>
            Google 是否核准 API Access，由 Google 依當時資格與政策獨立審核，
            人客多無法保證審核結果。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">進度目錄</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {STEPS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="text-sm text-muted-foreground underline hover:text-foreground"
            >
              {s.title}
            </a>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">【申請前建議】</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed">
          <ul className="list-disc space-y-1 pl-5">
            <li>使用館別／公司自己的 Google 帳號</li>
            <li>使用真實、有效的商業資料</li>
            <li>確認申請帳號對該 Google Business Profile 有符合 Google 要求的管理權限</li>
            <li>Google Business Profile 應維持完整、正確並已驗證</li>
            <li>依 Google 目前要求，確認 Business Profile 已符合活躍期間等申請資格</li>
            <li>使用貴館有效的官方網站</li>
            <li>申請用途應描述「貴館自身對 Business Profile API 的實際營運需求」</li>
          </ul>
          <p className="text-muted-foreground">{USE_CASE_HINT}</p>
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
            <p className="font-medium text-destructive">請勿：</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>冒用其他館的 Google Cloud Project</li>
              <li>共用其他館的 OAuth Client ID</li>
              <li>共用其他館的 OAuth Client Secret</li>
            </ul>
          </div>
          <p className="text-muted-foreground">
            Google 是否接受申請，以官方最新政策及審核結果為準。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">自主 API Project 說明</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm leading-relaxed">
          <p>
            如果貴館選擇自行進行 Google Business Profile API 的程式化／自動化使用，
            請確認使用的是貴館自行持有、自行申請並獲准的 Google Cloud Project。
          </p>
          <p>
            人客多不提供其他館別的 Project、Client ID 或 Client Secret 供本館共用。
          </p>
        </CardContent>
      </Card>

      <Section id="step-01" title="01 確認貴館 Google Business Profile">
        <p>
          確認貴館的 Google 商家檔案資料完整、正確並已完成驗證，
          且用來申請的 Google 帳號對該商家具備管理權限。
        </p>
      </Section>

      <Section id="step-02" title="02 建立貴館自己的 Google Cloud Project">
        <p>
          於 Google Cloud Console 點選 <b>Select a project → New Project</b>，建立屬於貴館的專案。
        </p>
        <ExtLink href="https://console.cloud.google.com/">前往 Google Cloud Console</ExtLink>
      </Section>

      <Section id="step-03" title="03 記錄 Project ID / Project Number">
        <p>建立後於專案資訊頁記錄 Project ID 與 Project Number，後續申請與後台設定都會用到。</p>
      </Section>

      <Section id="step-04" title="04 申請 Business Profile API Access">
        <p>
          依 Google 官方流程提交 Business Profile API Access 申請，需填寫 Project Number、
          貴館資料、官方網站與 API 使用用途。
        </p>
        <ExtLink href="https://developers.google.com/my-business/content/prereqs">
          Business Profile API Prerequisites
        </ExtLink>
        <ExtLink href="https://developers.google.com/my-business/content/policies">
          Business Profile API Policies
        </ExtLink>
      </Section>

      <Section id="step-05" title="05 等待 Google 審核">
        <p>送出後由 Google 獨立審核，審核時間與結果均由 Google 決定，人客多無法代為加速或保證。</p>
      </Section>

      <Section id="step-06" title="06 建立 OAuth 2.0 Web Client">
        <p>
          核准後於 Google Cloud Console 啟用所需 Business Profile APIs，並建立
          OAuth 2.0 Client ID（類型：Web application）。
        </p>
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <div className="text-xs font-semibold">OAuth Scope</div>
          <p className="break-all font-mono text-xs">{SCOPE}</p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="gap-2"
            onClick={() => copy(SCOPE, "Scope")}
          >
            <Copy className="h-3.5 w-3.5" />
            複製 Scope
          </Button>
        </div>
        <ExtLink href="https://developers.google.com/my-business/content/basic-setup">
          Business Profile API Basic Setup
        </ExtLink>
        <ExtLink href="https://developers.google.com/my-business/content/implement-oauth">
          OAuth Implementation
        </ExtLink>
      </Section>

      <Section id="step-07" title="07 加入 Authorized redirect URI">
        <p>
          雖然各館的 Google Cloud Project 與 OAuth Client 都不同，但授權完成後都會回到
          人客多系統的同一個 OAuth callback，因此每館自己的 OAuth Web Client
          都需要加入下列同一個 Authorized redirect URI：
        </p>
        <code className="block break-all rounded bg-muted px-2 py-1 font-mono text-xs">
          {REDIRECT_URI}
        </code>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="gap-2"
          onClick={() => copy(REDIRECT_URI, "Redirect URI")}
        >
          <Copy className="h-3.5 w-3.5" />
          複製 Redirect URI
        </Button>
      </Section>

      <Section id="step-08" title="08 取得 Client ID / Client Secret">
        <p>建立完成後可取得貴館專屬的 OAuth Client ID 與 OAuth Client Secret。</p>
      </Section>

      <Section id="step-09" title="09 回到該館設定頁填入資料">
        <p>
          回到「該館後台 → 官網內容 → Google 評論 → Google Business Profile」，填入：
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Project ID</li>
          <li>Project Number</li>
          <li>OAuth Client ID</li>
          <li>OAuth Client Secret（於專用欄位輸入，直接送往後端安全保管）</li>
        </ol>
      </Section>

      <Section id="step-10" title="10 申請狀態選「已核准」">
        <p>
          「申請狀態」為<b>館別自行記錄</b>的 Google API 申請進度。
          人客多不會向 Google 查驗或保證此狀態。
        </p>
        <p className="text-muted-foreground">
          若憑證有誤，即使狀態選為「已核准」，Google 授權仍可能失敗。
        </p>
      </Section>

      <Section id="step-11" title="11 連結 Google 商家帳號">
        <p>
          憑證完整後按「連結 Google 商家帳號」，以擁有該商家管理權的 Google 帳號登入並同意授權。
        </p>
      </Section>

      <Section id="step-12" title="12 選擇 Account / 商家">
        <p>回到後台後依序選擇 Google Business Account 與對應的商家據點，不需手動輸入任何 ID。</p>
      </Section>

      <Section id="step-13" title="13 同步評論並套用前台">
        <p>按「同步評論」把 20～50 則以上評論拉進候選池，勾選至少 4 則後套用至前台。</p>
        <p className="text-muted-foreground">
          可隨時「重新授權」或「解除連線」；解除連線不會刪除前台既有評論與候選評論。
        </p>
      </Section>

      <Section id="step-14" title="14 Client Secret 安全須知">
        <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <div className="flex items-center gap-2 font-semibold text-destructive">
            <AlertTriangle className="h-4 w-4" />
            OAuth Client Secret 屬於敏感憑證
          </div>
          <p>請勿貼在聊天訊息、Email、公開文件、群組或截圖公開區域。</p>
          <p className="text-muted-foreground">
            於人客多後台儲存後，Secret 會進入安全 Secret Storage，不會再次顯示明文。
          </p>
          <p className="text-muted-foreground">
            若懷疑外洩，請在 Google Cloud rotate / regenerate Secret，
            回到該館設定頁更新 Secret，再重新授權 Google 商家。
          </p>
        </div>
      </Section>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">官方文件</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {OFFICIAL_LINKS.map((l) => (
            <ExtLink key={l.url} href={l.url}>
              {l.label}
            </ExtLink>
          ))}
        </CardContent>
      </Card>

      <div>
        <Button asChild variant="outline" className="gap-2">
          <Link to="/admin/website-content?tab=reviews">
            <ArrowLeft className="h-4 w-4" />
            返回 Google 評論設定
          </Link>
        </Button>
      </div>
    </div>
  );
}
