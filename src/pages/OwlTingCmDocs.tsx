import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, FileText, Lock, Server, Zap, Plug, Activity, Database, Boxes, Tag, Calendar, Copy, Check,
} from "lucide-react";
import { Link } from "react-router-dom";
import { SEOHead } from "@/components/SEOHead";
import { useState } from "react";
import { toast } from "sonner";

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string) ?? "https://YOUR-PROJECT.supabase.co";
const CM_URL = `${SUPABASE_URL}/functions/v1/owlting-cm`;
const SNAPSHOT_URL = `${SUPABASE_URL}/functions/v1/owlting-cm-snapshot`;
const CM_HOST = (() => {
  try { return new URL(CM_URL).host; } catch { return "YOUR-PROJECT.supabase.co"; }
})();
const CM_PATH = (() => {
  try { return new URL(CM_URL).pathname; } catch { return "/functions/v1/owlting-cm"; }
})();

function buildHttpHeaders(soapAction: string): string {
  return `POST ${CM_PATH} HTTP/1.1
Host: ${CM_HOST}
Content-Type: text/xml; charset=utf-8
SOAPAction: "${soapAction}"
Accept: text/xml
Accept-Charset: utf-8
User-Agent: OwlTingCM/1.0
Connection: keep-alive
Content-Length: <自動計算 body byte 數>`;
}

function buildFullEnvelope(bodyXml: string): string {
  // Wrap a raw method block (without soap:Envelope) with header + envelope
  const indented = bodyXml.split("\n").map((l) => "    " + l).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Header>
    <wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
      <wsse:UsernameToken>
        <wsse:Username>YOUR_USERNAME</wsse:Username>
        <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">YOUR_PASSWORD</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soap:Header>
  <soap:Body>
${indented}
  </soap:Body>
</soap:Envelope>`;
}

function CodeBlock({ children, label }: { children: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      toast.success("已複製到剪貼簿");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("複製失敗,請手動選取");
    }
  };
  return (
    <div className="rounded-md border bg-muted/40 relative group">
      {label ? (
        <div className="px-3 py-1.5 border-b text-[11px] font-mono text-muted-foreground bg-muted/60 flex items-center justify-between gap-2">
          <span className="truncate">{label}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 gap-1 text-[11px] -my-1 shrink-0"
            onClick={handleCopy}
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "已複製" : "複製"}
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 gap-1 text-[11px] absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 z-10"
          onClick={handleCopy}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "已複製" : "複製"}
        </Button>
      )}
      <pre className="text-[12px] font-mono p-3 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
        {children}
      </pre>
    </div>
  );
}

const SAMPLE_AUTH_HEADER = `<soap:Header>
  <wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
    <wsse:UsernameToken>
      <wsse:Username>YOUR_USERNAME</wsse:Username>
      <wsse:Password Type="...#PasswordText">YOUR_PASSWORD</wsse:Password>
    </wsse:UsernameToken>
  </wsse:Security>
</soap:Header>`;

const SAMPLE_AVAIL_RQ = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <OTA_HotelAvailRQ xmlns="http://www.opentravel.org/OTA/2003/05"
        Version="1.0" TimeStamp="2026-05-05T10:00:00Z" EchoToken="abc-001">
      <AvailRequestSegments>
        <AvailRequestSegment>
          <HotelSearchCriteria>
            <Criterion>
              <HotelRef HotelCode="SENSAN"/>
            </Criterion>
          </HotelSearchCriteria>
        </AvailRequestSegment>
      </AvailRequestSegments>
    </OTA_HotelAvailRQ>
  </soap:Body>
</soap:Envelope>`;

const SAMPLE_AVAIL_RS = `<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">
  <SOAP-ENV:Body>
    <OTA_HotelAvailRS xmlns="http://www.opentravel.org/OTA/2003/05"
        Version="1.0" TimeStamp="2026-05-05T10:00:01Z" EchoToken="abc-001">
      <Success/>
      <RoomStays>
        <RoomStay>
          <RoomTypes>
            <RoomType RoomTypeCode="RT_a1b2c3d4">
              <RoomDescription Name="雙人房"/>
            </RoomType>
          </RoomTypes>
          <RatePlans>
            <RatePlan RatePlanCode="RP_e5f6g7h8">
              <RatePlanDescription Name="標準方案"/>
            </RatePlan>
          </RatePlans>
        </RoomStay>
      </RoomStays>
    </OTA_HotelAvailRS>
  </SOAP-ENV:Body>
</SOAP-ENV:Envelope>`;

const SAMPLE_AVAIL_NOTIF_RQ = `<OTA_HotelAvailNotifRQ xmlns="http://www.opentravel.org/OTA/2003/05"
    Version="1.0" TimeStamp="2026-05-05T10:00:00Z" EchoToken="inv-001">
  <AvailStatusMessages HotelCode="SENSAN">
    <!-- ① 設定庫存數量：BookingLimit=N -->
    <AvailStatusMessage BookingLimit="3">
      <StatusApplicationControl Start="2026-06-01" End="2026-06-30"
          InvTypeCode="RT_a1b2c3d4"/>
    </AvailStatusMessage>

    <!-- ② 房間鎖：RestrictionStatus -->
    <AvailStatusMessage>
      <StatusApplicationControl Start="2026-06-01" End="2026-06-05"
          InvTypeCode="RT_a1b2c3d4"/>
      <RestrictionStatus Status="Close"/>
    </AvailStatusMessage>

    <!-- ③ 方案鎖：RestrictionStatus + RatePlanCode -->
    <AvailStatusMessage>
      <StatusApplicationControl Start="2026-07-01" End="2026-07-10"
          InvTypeCode="RT_a1b2c3d4" RatePlanCode="RP_e5f6g7h8"/>
      <RestrictionStatus Status="Close"/>
    </AvailStatusMessage>
  </AvailStatusMessages>
</OTA_HotelAvailNotifRQ>`;

const SAMPLE_AVAIL_NOTIF_RS = `<OTA_HotelAvailNotifRS xmlns="http://www.opentravel.org/OTA/2003/05"
    Version="1.0" TimeStamp="2026-05-05T10:00:01Z" EchoToken="inv-001">
  <Success/>
</OTA_HotelAvailNotifRS>`;

const SAMPLE_RATE_RQ = `<OTA_HotelRateAmountNotifRQ xmlns="http://www.opentravel.org/OTA/2003/05"
    Version="1.0" TimeStamp="2026-05-05T10:00:00Z" EchoToken="rate-001">
  <RateAmountMessages HotelCode="SENSAN">
    <RateAmountMessage>
      <StatusApplicationControl Start="2026-06-01" End="2026-06-30"
          InvTypeCode="RT_a1b2c3d4" RatePlanCode="RP_e5f6g7h8"/>
      <Rates>
        <Rate>
          <BaseByGuestAmts>
            <BaseByGuestAmt AmountAfterTax="3800" CurrencyCode="TWD"/>
          </BaseByGuestAmts>
        </Rate>
      </Rates>
    </RateAmountMessage>
  </RateAmountMessages>
</OTA_HotelRateAmountNotifRQ>`;

const SAMPLE_RATE_RS = `<OTA_HotelRateAmountNotifRS xmlns="http://www.opentravel.org/OTA/2003/05"
    Version="1.0" TimeStamp="2026-05-05T10:00:01Z" EchoToken="rate-001">
  <Success/>
</OTA_HotelRateAmountNotifRS>`;

const SAMPLE_RES_COMMIT_RQ = `<OTA_HotelResNotifRQ xmlns="http://www.opentravel.org/OTA/2003/05"
    Version="1.0" TimeStamp="2026-05-05T10:00:00Z" EchoToken="res-001"
    ResStatus="Commit">
  <HotelReservations>
    <HotelReservation>
      <UniqueID Type="14" ID="OWLTING-RES-20260505-0001"/>
      <RoomStays>
        <RoomStay>
          <RoomTypes>
            <RoomType RoomTypeCode="RT_a1b2c3d4" NumberOfUnits="1"/>
          </RoomTypes>
          <RatePlans>
            <RatePlan RatePlanCode="RP_e5f6g7h8"/>
          </RatePlans>
          <GuestCounts>
            <GuestCount AgeQualifyingCode="10" Count="2"/>
          </GuestCounts>
          <TimeSpan Start="2026-06-15" End="2026-06-17"/>
          <Total AmountAfterTax="7600" CurrencyCode="TWD"/>
          <BasicPropertyInfo HotelCode="SENSAN"/>
          <Comments>
            <Comment Name="Source"><Text>Booking.com</Text></Comment>
          </Comments>
        </RoomStay>
      </RoomStays>
      <ResGuests>
        <ResGuest>
          <Profiles>
            <ProfileInfo>
              <Profile>
                <Customer>
                  <PersonName>
                    <GivenName>三郎</GivenName>
                    <Surname>山田</Surname>
                  </PersonName>
                  <Telephone PhoneNumber="+886912345678"/>
                  <Email>guest@example.com</Email>
                </Customer>
              </Profile>
            </ProfileInfo>
          </Profiles>
        </ResGuest>
      </ResGuests>
    </HotelReservation>
  </HotelReservations>
</OTA_HotelResNotifRQ>`;

const SAMPLE_RES_RS = `<OTA_HotelResNotifRS xmlns="http://www.opentravel.org/OTA/2003/05"
    Version="1.0" TimeStamp="2026-05-05T10:00:01Z" EchoToken="res-001">
  <Success/>
  <HotelReservations>
    <HotelReservation>
      <UniqueID Type="14" ID="OWLTING-RES-20260505-0001"/>
      <ResGlobalInfo>
        <HotelReservationIDs>
          <HotelReservationID ResID_Type="14" ResID_Value="A2B3C4D5"/>
        </HotelReservationIDs>
      </ResGlobalInfo>
    </HotelReservation>
  </HotelReservations>
</OTA_HotelResNotifRS>`;

const SAMPLE_ERROR = `<OTA_HotelAvailRS xmlns="http://www.opentravel.org/OTA/2003/05"
    Version="1.0" TimeStamp="2026-05-05T10:00:01Z" EchoToken="abc-001">
  <Errors>
    <Error Type="13" Code="450">Invalid credentials</Error>
  </Errors>
</OTA_HotelAvailRS>`;

const methods = [
  {
    id: "avail",
    n: "①",
    name: "OTA_HotelAvailRQ",
    title: "取得房型 / 方案 (AR ID)",
    desc: "OwlTing 取得人客多側目前的房型清單與對應方案碼。",
    rq: SAMPLE_AVAIL_RQ,
    rs: SAMPLE_AVAIL_RS,
    notes: [
      "回傳所有 room_types 與 pricing_templates。",
      "RoomTypeCode 與 RatePlanCode 為自動產生 (見『代號規則』)，OwlTing 應將其原樣存回，後續所有 API 都以該代碼為依據。",
    ],
  },
  {
    id: "availnotif",
    n: "②",
    name: "OTA_HotelAvailNotifRQ",
    title: "庫存數量 / 房間鎖 / 方案鎖",
    desc: "更新指定日期區間的可訂房數，或設定房型 / 方案的關房狀態。",
    rq: SAMPLE_AVAIL_NOTIF_RQ,
    rs: SAMPLE_AVAIL_NOTIF_RS,
    notes: [
      "BookingLimit=N → 將 room_inventory_pricing.available_rooms 設為 N。",
      "RestrictionStatus + InvTypeCode → 房間鎖 (整個房型在該日期關閉)。",
      "RestrictionStatus + InvTypeCode + RatePlanCode → 方案鎖 (僅該方案在該日期關閉)。",
      "我方信任 OwlTing 已扣除其他 OTA 的庫存，僅依收到的 BookingLimit 寫入。",
      "可在同一個 Request 中放多個 AvailStatusMessage，一次處理多筆。",
    ],
  },
  {
    id: "rate",
    n: "③",
    name: "OTA_HotelRateAmountNotifRQ",
    title: "方案售價 (含稅)",
    desc: "更新指定房型 + 方案於日期區間內的售價。",
    rq: SAMPLE_RATE_RQ,
    rs: SAMPLE_RATE_RS,
    notes: [
      "AmountAfterTax 為含稅售價 (TWD)，會 upsert 至 room_inventory_pricing。",
      "若該日期尚未有 inventory_pricing 紀錄，會自動建立 (預設 available_rooms 由系統管理)。",
      "可在同一個 Request 中放多個 RateAmountMessage。",
    ],
  },
  {
    id: "res",
    n: "④",
    name: "OTA_HotelResNotifRQ",
    title: "OTA 訂單通知 (Commit / Modify / Cancel)",
    desc: "OTA 平台 (Booking / Agoda / Trip / Expedia) 訂單通知。",
    rq: SAMPLE_RES_COMMIT_RQ,
    rs: SAMPLE_RES_RS,
    notes: [
      "ResStatus='Commit' → 建立訂單，回傳人客多端訂單編號 (8 碼，A-Z2-9)。",
      "ResStatus='Modify' → 以 UniqueID 找到既有訂單後更新。",
      "ResStatus='Cancel' → 以 UniqueID 找到既有訂單後將狀態設為已取消。",
      "UniqueID 必須是 OwlTing 端唯一識別 (例如 Booking.com 的 ReservationID)。",
      "Comments/Comment[Name='Source'] 會被存為 ota_channel (booking / agoda / trip / expedia)。",
      "我方不再次驗證庫存與價格，完全信任 OwlTing 在通知前已完成扣減。",
    ],
  },
];

const OwlTingCmDocs = () => {
  return (
    <>
      <SEOHead
        title="OwlTing Channel Manager API 文件 | 人客多 × 奧丁丁"
        description="人客多訂房系統與奧丁丁 Channel Manager 介接技術文件 — SOAP / OTA 規範、4 組 method、庫存與售價對帳 endpoint。"
      />
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4">
                <Link to="/">
                  <Button variant="ghost" size="sm" className="gap-2">
                    <ArrowLeft className="h-4 w-4" />
                    返回首頁
                  </Button>
                </Link>
                <div>
                  <h1 className="text-xl font-bold">OwlTing Channel Manager API</h1>
                  <p className="text-sm text-muted-foreground">人客多 × 奧丁丁 介接技術文件 v1.0</p>
                </div>
              </div>
              <Badge className="bg-primary text-primary-foreground">SOAP / OTA 2003/05</Badge>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-8 max-w-4xl space-y-10">
          {/* Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                介接概述
              </CardTitle>
              <CardDescription>
                人客多訂房系統提供 OTA 標準 SOAP endpoint 給奧丁丁 Channel Manager 串接，含 4 組業務 method 與 2 組 REST 對帳 endpoint。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-3 gap-3">
                <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                  <Server className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">SOAP 1.1 / OTA 2003/05</p>
                    <p className="text-xs text-muted-foreground">單一 endpoint 依 root 元素分派</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                  <Lock className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">WS-Security UsernameToken</p>
                    <p className="text-xs text-muted-foreground">每家民宿一組帳密 (SHA-256)</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                  <Zap className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">Cloud-native</p>
                    <p className="text-xs text-muted-foreground">Edge Function，全球低延遲</p>
                  </div>
                </div>
              </div>
              <div className="text-sm text-muted-foreground leading-relaxed">
                整體流程：民宿管理者先在奧丁丁與人客多後台建立相同的房間與方案資料，奧丁丁將資訊上架到 Booking / Agoda / Trip / Expedia 等 OTA。
                旅客在 OTA 下單後，奧丁丁透過本文件第 ④ 組 API 通知人客多新建訂單；旅客在人客多直接下單時，人客多會反向通知奧丁丁同步庫存。
              </div>
            </CardContent>
          </Card>

          {/* Endpoints */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Plug className="h-5 w-5" /> Endpoint URL
            </h2>
            <Card>
              <CardContent className="p-4 space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">SOAP Endpoint (4 組 method 共用)</p>
                  <CodeBlock label="POST">{CM_URL}</CodeBlock>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">REST 對帳 — 庫存</p>
                  <CodeBlock label="GET">{`${SNAPSHOT_URL}?type=inventory&hotel_code=SENSAN&date_from=2026-06-01&date_to=2026-06-30`}</CodeBlock>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">REST 對帳 — 售價</p>
                  <CodeBlock label="GET">{`${SNAPSHOT_URL}?type=rates&hotel_code=SENSAN&date_from=2026-06-01&date_to=2026-06-30`}</CodeBlock>
                </div>
                <p className="text-xs text-muted-foreground">
                  上述網址為 Production；測試與正式環境共用同一 URL，以帳號區分。Content-Type 必為 <code className="font-mono">text/xml; charset=utf-8</code>，HTTP method 為 POST (SOAP) / GET (REST)。
                </p>
              </CardContent>
            </Card>
          </section>

          {/* Auth */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Lock className="h-5 w-5" /> 認證 — WS-Security UsernameToken
            </h2>
            <Card>
              <CardContent className="p-4 space-y-3 text-sm">
                <p>
                  每家民宿會由人客多後台建立一組獨立的 <strong>Hotel Code / Username / Password</strong>，密碼以 SHA-256 加密儲存。
                  奧丁丁需在每筆 SOAP Request 的 <code>{`<soap:Header>`}</code> 中加入下列 WS-Security 區塊：
                </p>
                <CodeBlock label="SOAP Header">{SAMPLE_AUTH_HEADER}</CodeBlock>
                <ul className="list-disc list-inside text-muted-foreground space-y-1 text-xs">
                  <li>Password 採 <strong>PasswordText</strong>，明文傳輸 (TLS 已加密整段流量)。</li>
                  <li>Body 中所帶的 HotelCode 必須與該帳號授權的 hotel_code 一致，否則回傳 <code>HotelCode not authorized</code>。</li>
                  <li>密碼可由民宿端隨時於人客多後台輪替，輪替後請更新奧丁丁端設定。</li>
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* Code conventions */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Tag className="h-5 w-5" /> 代號規則
            </h2>
            <Card>
              <CardContent className="p-4 text-sm space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-md border bg-muted/40 p-3">
                    <p className="text-xs text-muted-foreground">HotelCode</p>
                    <p className="font-mono text-sm">由人客多後台設定 (例：<code>SENSAN</code>)</p>
                  </div>
                  <div className="rounded-md border bg-muted/40 p-3">
                    <p className="text-xs text-muted-foreground">RoomTypeCode</p>
                    <p className="font-mono text-sm">RT_ + room_types.id 前 8 碼</p>
                  </div>
                  <div className="rounded-md border bg-muted/40 p-3">
                    <p className="text-xs text-muted-foreground">RatePlanCode</p>
                    <p className="font-mono text-sm">RP_ + pricing_templates.id 前 8 碼</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  ※ 請以第 ① 組 API 取得代碼後存入奧丁丁端對應表，後續所有呼叫皆使用該代碼。
                </p>
              </CardContent>
            </Card>
          </section>

          {/* Methods */}
          <section className="space-y-6">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Boxes className="h-5 w-5" /> SOAP Methods
            </h2>
            <Card>
              <CardContent className="p-4 text-sm space-y-2">
                <p className="font-medium">所有 4 組 method 共用的 HTTP Header 規範</p>
                <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1">
                  <li><code>POST</code> 至同一個 SOAP Endpoint，依 root 元素分派。</li>
                  <li><code>Content-Type</code> 必為 <code>text/xml; charset=utf-8</code> (不可使用 <code>application/soap+xml</code>，那是 SOAP 1.2)。</li>
                  <li><code>SOAPAction</code> 必填且 <strong>需加雙引號</strong>，值為對應 method 名稱 (例：<code>"OTA_HotelAvailRQ"</code>)。</li>
                  <li><code>Content-Length</code> 由 HTTP client 自動計算，請勿手動填入錯誤值。</li>
                  <li>建議加上 <code>Accept: text/xml</code> 與唯一的 <code>User-Agent</code> 方便我方 log 追蹤。</li>
                </ul>
              </CardContent>
            </Card>
            {methods.map((m) => {
              const fullEnvelope = m.id === "avail" ? m.rq : buildFullEnvelope(m.rq);
              const curl = `curl -X POST '${CM_URL}' \\
  -H 'Content-Type: text/xml; charset=utf-8' \\
  -H 'SOAPAction: "${m.name}"' \\
  -H 'Accept: text/xml' \\
  --data-binary @request.xml`;
              return (
                <Card key={m.id} id={m.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <span>{m.n}</span>
                          <code className="font-mono">{m.name}</code>
                        </CardTitle>
                        <CardDescription className="mt-1">{m.title} — {m.desc}</CardDescription>
                      </div>
                      <Badge variant="outline">SOAPAction: "{m.name}"</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <CodeBlock label="HTTP Request Headers (可直接貼上)">{buildHttpHeaders(m.name)}</CodeBlock>
                    <CodeBlock label="Full SOAP Request (含 Envelope + WS-Security Header,可直接貼上)">{fullEnvelope}</CodeBlock>
                    <CodeBlock label="cURL 範例">{curl}</CodeBlock>
                    <CodeBlock label="Success Response">{m.rs}</CodeBlock>
                    <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1">
                      {m.notes.map((n, i) => <li key={i}>{n}</li>)}
                    </ul>
                  </CardContent>
                </Card>
              );
            })}
          </section>


          {/* Errors */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Activity className="h-5 w-5" /> 錯誤回應
            </h2>
            <Card>
              <CardContent className="p-4 space-y-3 text-sm">
                <p>所有錯誤皆以 OTA 標準 <code>{`<Errors><Error/></Errors>`}</code> 結構回傳，HTTP 狀態碼仍為 200 (僅伺服器內部錯誤為 500)。</p>
                <CodeBlock label="Error Sample">{SAMPLE_ERROR}</CodeBlock>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md border bg-muted/40 p-2">
                    <p className="font-mono">450 — Invalid credentials</p>
                    <p className="text-muted-foreground">UsernameToken 缺失或密碼錯誤。</p>
                  </div>
                  <div className="rounded-md border bg-muted/40 p-2">
                    <p className="font-mono">450 — HotelCode XXX not authorized</p>
                    <p className="text-muted-foreground">該帳號不對應指定 HotelCode。</p>
                  </div>
                  <div className="rounded-md border bg-muted/40 p-2">
                    <p className="font-mono">450 — RoomType not found</p>
                    <p className="text-muted-foreground">RoomTypeCode 對應不到資料。</p>
                  </div>
                  <div className="rounded-md border bg-muted/40 p-2">
                    <p className="font-mono">500 — Server error: ...</p>
                    <p className="text-muted-foreground">系統錯誤；請保留 EchoToken 與時間後通知對接窗口。</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* REST */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Database className="h-5 w-5" /> REST 對帳 Endpoint
            </h2>
            <Card>
              <CardContent className="p-4 space-y-3 text-sm">
                <p>
                  提供 OwlTing 或內部對帳工具直接以 GET 取得目前資料庫中的庫存 / 售價快照，回傳 JSON。
                  本 endpoint 僅在白名單環境呼叫；正式整合請以 SOAP 為主。
                </p>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">參數</p>
                  <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1">
                    <li><code>type</code> — <code>inventory</code> 或 <code>rates</code></li>
                    <li><code>hotel_code</code> — 例：<code>SENSAN</code></li>
                    <li><code>date_from</code> / <code>date_to</code> — <code>YYYY-MM-DD</code></li>
                  </ul>
                </div>
                <CodeBlock label="Response Sample (inventory)">{`{
  "hotel_code": "SENSAN",
  "items": [
    { "date": "2026-06-01", "room_type_code": "RT_a1b2c3d4", "available_rooms": 3, "is_available": true },
    { "date": "2026-06-02", "room_type_code": "RT_a1b2c3d4", "available_rooms": 0, "is_available": false }
  ]
}`}</CodeBlock>
              </CardContent>
            </Card>
          </section>

          {/* Misc */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Calendar className="h-5 w-5" /> 其他事項
            </h2>
            <Card>
              <CardContent className="p-4 text-sm space-y-2">
                <ul className="list-disc list-inside text-muted-foreground space-y-1">
                  <li>所有時間統一使用 ISO-8601，日期欄位為 <code>YYYY-MM-DD</code> (民宿所在時區，預設 Asia/Taipei)。</li>
                  <li>EchoToken 必填且應為唯一字串，會原樣回填於回應，並寫入我方 audit log。</li>
                  <li>相同訂單 (UniqueID) 重送將視為 Modify，不會重複建立。</li>
                  <li>建議實作 retry：HTTP 5xx / 網路錯誤可重試，4xx 與 OTA Error 應人工介入。</li>
                  <li>所有 inbound / outbound 流量皆會記錄於 <code>owlting_cm_logs</code>，可向窗口申請查詢。</li>
                </ul>
                <Separator className="my-3" />
                <p className="text-xs text-muted-foreground">
                  技術窗口請聯絡 <a className="underline" href="mailto:tech@lakeze.com">tech@lakeze.com</a>。
                  本文件版本：v1.0 (2026-05)。
                </p>
              </CardContent>
            </Card>
          </section>
        </main>
      </div>
    </>
  );
};

export default OwlTingCmDocs;
