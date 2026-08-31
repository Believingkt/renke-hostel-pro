import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Copy, AlertTriangle, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

const STEPS = [
  { id: "step-01", title: "01 準備資料" },
  { id: "step-02", title: "02 建立 Google Cloud Project" },
  { id: "step-03", title: "03 取得 Project Number" },
  { id: "step-04", title: "04 申請 Business Profile API Access" },
  { id: "step-05", title: "05 等待 Google 核准" },
  { id: "step-06", title: "06 啟用 Business Profile APIs" },
  { id: "step-07", title: "07 設定 OAuth Consent Screen" },
  { id: "step-08", title: "08 建立 OAuth Client ID" },
  { id: "step-09", title: "09 回後台完成串接" },
  { id: "step-10", title: "10 注意安全資訊" },
  { id: "step-11", title: "11 申請完成後要回填什麼" },
];

const USE_CASE_TEXT =
  "We operate a lodging management platform for properties we manage. We would like to use the Google Business Profile API to retrieve Google reviews from authorized Business Profiles and allow property administrators to select reviews for display on their official property websites. Access will only be used for Business Profiles that have explicitly authorized our platform.";

const SCOPE = "https://www.googleapis.com/auth/business.manage";

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
    label: "Business Profile API Basic Setup",
    url: "https://developers.google.com/my-business/content/basic-setup",
  },
  {
    label: "OAuth Implementation",
    url: "https://developers.google.com/my-business/content/implement-oauth",
  },
  {
    label: "Review Data / Reviews API",
    url: "https://developers.google.com/my-business/content/review-data",
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
    <div className="mx-auto w-full max-w-4xl px-4 py-6 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold md:text-3xl">
          Google Business Profile API 申請與設定教學
        </h1>
        <p className="text-sm text-muted-foreground">
          完成以下步驟後，即可讓系統同步 20 則以上 Google 評論。
        </p>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">進度目錄</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {STEPS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="text-sm underline text-muted-foreground hover:text-foreground"
            >
              {s.title}
            </a>
          ))}
        </CardContent>
      </Card>

      <Section id="step-01" title="01 準備資料">
        <ol className="list-decimal pl-5 space-y-1">
          <li>公司長期可管理的 Google 帳號</li>
          <li>該 Google 帳號需要是目標 Google 商家的 Owner 或 Manager</li>
          <li>公司／平台正式網站</li>
          <li>Google Cloud Project</li>
        </ol>
        <p className="text-muted-foreground">
          提示：不要使用離職後可能無法取回的私人帳號。
        </p>
      </Section>

      <Section id="step-02" title="02 建立 Google Cloud Project">
        <p>
          進入 Google Cloud Console，點選 <b>Select a project → New Project</b>。
          專案名稱範例：<code className="font-mono">Renke Google Reviews</code>
        </p>
        <p>建立後記錄：Project ID、Project Number。</p>
        <ExtLink href="https://console.cloud.google.com/">前往 Google Cloud Console</ExtLink>
      </Section>

      <Section id="step-03" title="03 取得 Project Number">
        <p>
          在 Google Cloud Console 專案資訊頁可查看 Project Number。
          <b className="text-primary">申請 Business Profile API 時會需要 Project Number。</b>
        </p>
      </Section>

      <Section id="step-04" title="04 申請 Business Profile API Access">
        <p>
          進入 Google 官方 Business Profile API prerequisites / access 申請頁，尋找
          <b> Application for Basic API Access</b>。
        </p>
        <p>準備填寫：Project Number、公司資料、網站、API Use Case。</p>
        <ExtLink href="https://developers.google.com/my-business/content/prereqs">
          前往 Google Business Profile API 官方申請說明
        </ExtLink>

        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
          <div className="text-xs font-semibold">API Use Case 英文範例</div>
          <p className="font-mono text-xs whitespace-pre-wrap">{USE_CASE_TEXT}</p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="gap-2"
            onClick={() => copy(USE_CASE_TEXT, "申請用途文字")}
          >
            <Copy className="h-3.5 w-3.5" />
            複製文字
          </Button>
        </div>
      </Section>

      <Section id="step-05" title="05 等待 Google 核准">
        <p>送出申請後，等待 Google 審核。</p>
        <p className="text-muted-foreground">
          申請尚未核准前，Business Profile API 可能無法正常啟用或使用。
        </p>
        <p>
          完成後回到本系統，於「串接準備進度」勾選：
          <b>「Google 已核准 API Access」</b>。
        </p>
      </Section>

      <Section id="step-06" title="06 啟用 Business Profile APIs">
        <p>
          核准後前往 Google Cloud Console → <b>APIs &amp; Services → Library</b>，
          啟用 Google Business Profile 相關 APIs，至少包含：
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>My Business Account Management API</li>
          <li>My Business Business Information API</li>
          <li>Google Business Profile / My Business API（Reviews）</li>
        </ul>
        <ExtLink href="https://developers.google.com/my-business/content/basic-setup">
          Business Profile API Basic Setup
        </ExtLink>
      </Section>

      <Section id="step-07" title="07 設定 OAuth Consent Screen">
        <p>
          路徑：Google Auth Platform 或 APIs &amp; Services → OAuth consent screen。
          填寫 App name、User support email、Developer contact。
        </p>
        <p className="text-muted-foreground">
          若不是單一公司 Google Workspace，通常使用 External。
        </p>
        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
          <div className="text-xs font-semibold">OAuth Scope</div>
          <p className="font-mono text-xs break-all">{SCOPE}</p>
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
        <ExtLink href="https://developers.google.com/my-business/content/implement-oauth">
          OAuth Implementation
        </ExtLink>
      </Section>

      <Section id="step-08" title="08 建立 OAuth Client ID">
        <p>建立 OAuth Client ID → Web application，會取得 Client ID、Client Secret、Authorized Redirect URI。</p>
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 flex gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <div className="space-y-1">
            <div className="font-semibold text-destructive">Redirect URI 請不要自行猜測。</div>
            <p className="text-muted-foreground">
              目前系統尚未完成 OAuth callback。此步驟先取得 Client ID 與 Client Secret，
              Client Secret 僅保留在安全位置，然後回到系統。請勿把 Secret 貼到本頁或任何文件。
            </p>
          </div>
        </div>
      </Section>

      <Section id="step-09" title="09 回後台完成串接">
        <p>
          回到「官網內容 → Google 評論 → Google Business Profile API」，填入 Project ID、OAuth Client ID。
        </p>
        <p>
          之後待系統 OAuth 功能完成，再點「連結 Google 商家帳號」。
          目前 OAuth 尚未實作，狀態顯示為 <Badge variant="outline">串接功能準備中</Badge>。
        </p>
      </Section>

      <Section id="step-10" title="10 注意安全資訊">
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2">
          <div className="font-semibold text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            安全提醒
          </div>
          <p>可以交給系統管理員：Project ID、Project Number、OAuth Client ID、Account ID、Location ID。</p>
          <p className="text-destructive">
            不要透過 LINE / Email / 截圖傳送：Client Secret、Access Token、Refresh Token。
          </p>
          <p className="text-muted-foreground">
            Client Secret 與 Refresh Token 必須使用後端安全儲存。
          </p>
        </div>
      </Section>

      <Section id="step-11" title="11 申請完成後，要回系統填什麼？">
        <p>回到「官網內容 → Google 評論 → Google Business Profile API」，填入以下三項：</p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Project ID</li>
          <li>Project Number</li>
          <li>OAuth Client ID</li>
        </ol>
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-1">
          <div className="font-semibold text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            不要將以下內容貼入普通欄位
          </div>
          <ul className="list-disc pl-5 space-y-1">
            <li>Client Secret</li>
            <li>Access Token</li>
            <li>Refresh Token</li>
          </ul>
          <p className="text-muted-foreground">
            Client Secret 請保留在 Google Cloud，待 OAuth Backend 完成後再由後端安全設定。
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
