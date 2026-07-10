import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";

/**
 * 奧丁丁欄位映射檢查
 * ---
 * 用途：當奧丁丁回覆 Success，但實際後台的「付款狀態 / 訂單備註」沒變動時，
 *      比對「PMS 送出的 XML 節點」與「奧丁丁實際顯示的值」，
 *      指出哪些節點可能沒有被奧丁丁採用，並建議下一步該改哪個節點。
 */

type PushLog = {
  id: string;
  queue_id: string | null;
  accommodation_id: string | null;
  res_status: string | null;
  request_xml: string | null;
  response_xml: string | null;
  http_status: number | null;
  success: boolean | null;
  created_at: string;
};

// --- 節點抽取 ---------------------------------------------------
type Extracted = {
  totalAmount?: string;
  guaranteeType?: string;      // DepositPayments/GuaranteePayment@GuaranteeType
  paymentType?: string;        // BookingRules/AcceptableGuarantee@PaymentType
  comments?: string;           // ResGlobalInfo/Comments/Comment/Text
  orderRemarksGlobal?: string; // ResGlobalInfo/OrderRemarks/OrderRemark
  orderRemarksTpa?: string;    // HotelReservation/TPA_Extensions/OrderRemarks/OrderRemark
  specialRequests?: string;    // HotelReservation/SpecialRequests/SpecialRequest/Text
};

function pick(xml: string, re: RegExp): string | undefined {
  const m = xml.match(re);
  return m ? m[1] : undefined;
}

function extract(xml: string): Extracted {
  return {
    totalAmount: pick(xml, /<Total[^>]*AmountAfterTax="([^"]+)"/),
    guaranteeType: pick(xml, /<GuaranteePayment[^>]*GuaranteeType="([^"]+)"/),
    paymentType: pick(xml, /<AcceptableGuarantee[^>]*PaymentType="([^"]+)"/),
    comments: pick(xml, /<Comments>\s*<Comment>\s*<Text>([\s\S]*?)<\/Text>/),
    orderRemarksGlobal: pick(xml, /<ResGlobalInfo>[\s\S]*?<OrderRemarks>\s*<OrderRemark>([\s\S]*?)<\/OrderRemark>[\s\S]*?<\/ResGlobalInfo>/),
    orderRemarksTpa: pick(xml, /<TPA_Extensions>\s*<OrderRemarks>\s*<OrderRemark>([\s\S]*?)<\/OrderRemark>/),
    specialRequests: pick(xml, /<SpecialRequests>\s*<SpecialRequest>\s*<Text>([\s\S]*?)<\/Text>/),
  };
}

// --- 比對規則 ---------------------------------------------------
type Row = {
  label: string;
  node: string;
  sent?: string;
  expected: string;      // 我們希望奧丁丁顯示的
  observed: string;      // 使用者輸入的實際值
  match: "sent-empty" | "match" | "mismatch" | "not-applicable";
  hint?: string;
};

/** 付款狀態欄位候選節點 */
function paymentRows(x: Extracted, observed: string): Row[] {
  const wantPending = /待|pending|unpaid|未|尚未/i.test(observed);
  const shouldBePending = true; // 我們每次推送都想讓奧丁丁保持待結清
  const expected = "待結清 (Unpaid / PayAtHotel)";
  const observedLabel = observed || "(未填)";
  const guaranteeOk = x.guaranteeType === "None";
  const bookingOk = x.paymentType === "PayAtHotel";
  return [
    {
      label: "GuaranteePayment.GuaranteeType",
      node: "ResGlobalInfo/DepositPayments/GuaranteePayment/@GuaranteeType",
      sent: x.guaranteeType,
      expected,
      observed: observedLabel,
      match: !x.guaranteeType ? "sent-empty" : guaranteeOk && wantPending ? "match" : "mismatch",
      hint: guaranteeOk && !wantPending
        ? "已送 GuaranteeType=None 但奧丁丁仍顯示已結清 → 此節點未被採用，改試 BookingRules/PayAtHotel 或聯絡奧丁丁確認 Channel 對應欄位。"
        : undefined,
    },
    {
      label: "AcceptableGuarantee.PaymentType",
      node: "ResGlobalInfo/BookingRules/BookingRule/AcceptableGuarantees/AcceptableGuarantee/@PaymentType",
      sent: x.paymentType,
      expected,
      observed: observedLabel,
      match: !x.paymentType ? "sent-empty" : bookingOk && wantPending ? "match" : "mismatch",
      hint: bookingOk && !wantPending
        ? "已送 PaymentType=PayAtHotel 但仍顯示已結清 → 改試 ResGlobalInfo/Total 帶 0 + 備註寫入實際金額，或改用 <PaymentCard>/<GuaranteeDescription>。"
        : undefined,
    },
    {
      label: "Total.AmountAfterTax",
      node: "ResGlobalInfo/Total/@AmountAfterTax",
      sent: x.totalAmount,
      expected: "應收總額（未收含在內）",
      observed: observedLabel,
      match: !x.totalAmount ? "sent-empty" : "match",
      hint: !wantPending
        ? "備援：把 Total 送 0，讓奧丁丁不自動 mark 為已結清；實際金額改寫在 OrderRemarks。"
        : undefined,
    },
  ];
  void shouldBePending;
}

/** 備註欄位候選節點 */
function remarksRows(x: Extracted, observed: string): Row[] {
  const cmp = (sent?: string) =>
    !sent ? "sent-empty" as const
    : observed.trim() === "" ? "not-applicable" as const
    : sent.trim() === observed.trim() ? "match" as const
    : observed.includes(sent.trim().slice(0, 8)) ? "match" as const
    : "mismatch" as const;
  const observedLabel = observed || "(未填)";
  return [
    {
      label: "Comments/Comment/Text (OTA 標準)",
      node: "ResGlobalInfo/Comments/Comment/Text",
      sent: x.comments,
      expected: "訂單備註全文",
      observed: observedLabel,
      match: cmp(x.comments),
      hint: x.comments && cmp(x.comments) === "mismatch"
        ? "已送 Comments/Comment/Text 但奧丁丁「訂單備註」欄未顯示 → 奧丁丁未把此欄映射到訂單備註。"
        : undefined,
    },
    {
      label: "OrderRemarks (ResGlobalInfo)",
      node: "ResGlobalInfo/OrderRemarks/OrderRemark",
      sent: x.orderRemarksGlobal,
      expected: "訂單備註全文",
      observed: observedLabel,
      match: cmp(x.orderRemarksGlobal),
      hint: x.orderRemarksGlobal && cmp(x.orderRemarksGlobal) === "mismatch"
        ? "此為奧丁丁自訂節點；若仍不顯示 → 改試 TPA_Extensions/OrderRemarks 或改寫到 GuestCounts 附近的自訂欄位。"
        : undefined,
    },
    {
      label: "TPA_Extensions/OrderRemarks (HotelReservation)",
      node: "HotelReservation/TPA_Extensions/OrderRemarks/OrderRemark",
      sent: x.orderRemarksTpa,
      expected: "訂單備註全文",
      observed: observedLabel,
      match: cmp(x.orderRemarksTpa),
      hint: x.orderRemarksTpa && cmp(x.orderRemarksTpa) === "mismatch"
        ? "TPA_Extensions 節點通常需通道方對應；備援：改把備註串到旅客姓名/電話後綴，強迫顯示於前台。"
        : undefined,
    },
    {
      label: "SpecialRequests/SpecialRequest/Text",
      node: "HotelReservation/SpecialRequests/SpecialRequest/Text",
      sent: x.specialRequests,
      expected: "（僅前台特殊需求，不應該是訂單備註）",
      observed: observedLabel,
      match: cmp(x.specialRequests),
      hint: x.specialRequests
        ? "已確認奧丁丁把此欄映射到「特殊需求」而非「訂單備註」，可移除以避免混淆。"
        : undefined,
    },
  ];
}

function BadgeFor({ m }: { m: Row["match"] }) {
  const map: Record<Row["match"], { label: string; cls: string }> = {
    match: { label: "一致", cls: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" },
    mismatch: { label: "不一致", cls: "bg-red-500/15 text-red-700 border-red-500/30" },
    "sent-empty": { label: "未送出", cls: "bg-muted text-muted-foreground" },
    "not-applicable": { label: "N/A", cls: "bg-muted text-muted-foreground" },
  };
  const it = map[m];
  return <Badge variant="outline" className={it.cls}>{it.label}</Badge>;
}

export default function OwlTingFieldMappingCheck() {
  const [orderCode, setOrderCode] = useState("");
  const [log, setLog] = useState<PushLog | null>(null);
  const [loading, setLoading] = useState(false);
  const [observedPayment, setObservedPayment] = useState("");
  const [observedRemarks, setObservedRemarks] = useState("");

  const extracted = useMemo(() => (log?.request_xml ? extract(log.request_xml) : null), [log]);
  const rowsPay = useMemo(() => (extracted ? paymentRows(extracted, observedPayment) : []), [extracted, observedPayment]);
  const rowsRem = useMemo(() => (extracted ? remarksRows(extracted, observedRemarks) : []), [extracted, observedRemarks]);

  async function loadLatest() {
    if (!orderCode.trim()) return;
    setLoading(true);
    try {
      const { data: ord, error: e1 } = await supabase
        .from("orders")
        .select("id")
        .eq("order_code", orderCode.trim())
        .maybeSingle();
      if (e1 || !ord) { toast.error("找不到訂單"); return; }
      const { data: qs } = await supabase
        .from("owlting_order_push_queue")
        .select("id")
        .eq("order_id", ord.id)
        .order("created_at", { ascending: false })
        .limit(20);
      const qids = (qs || []).map((q) => q.id);
      if (qids.length === 0) { toast.error("尚無推送紀錄"); return; }
      const { data: logs, error: e2 } = await supabase
        .from("owlting_order_push_log")
        .select("*")
        .in("queue_id", qids)
        .order("created_at", { ascending: false })
        .limit(1);
      if (e2 || !logs || logs.length === 0) { toast.error("找不到推送 log"); return; }
      setLog(logs[0] as PushLog);
      toast.success("已載入最新一筆推送 XML");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { setLog(null); }, [orderCode]);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">奧丁丁欄位映射檢查</h1>
        <p className="text-sm text-muted-foreground mt-1">
          奧丁丁回覆 Success 但付款狀態／備註沒變？貼入訂單編號，抓最新一筆送出的 XML，
          並輸入奧丁丁後台實際顯示的內容，系統會比對各節點並提示該改哪裡。
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">1. 選擇訂單</CardTitle></CardHeader>
        <CardContent className="flex gap-2 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <Label>訂單編號 (order_code)</Label>
            <Input value={orderCode} onChange={(e) => setOrderCode(e.target.value)} placeholder="RD3C94X2" />
          </div>
          <Button onClick={loadLatest} disabled={loading || !orderCode.trim()}>
            {loading ? "載入中…" : "抓取最新推送 XML"}
          </Button>
        </CardContent>
      </Card>

      {log && (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">2. 輸入奧丁丁實際顯示</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>付款狀態（奧丁丁後台實際顯示，例：已結清 / 待結清 / Paid）</Label>
                <Input value={observedPayment} onChange={(e) => setObservedPayment(e.target.value)} placeholder="已結清" />
              </div>
              <div>
                <Label>訂單備註（奧丁丁後台實際顯示的備註文字；沒有就留空）</Label>
                <Textarea value={observedRemarks} onChange={(e) => setObservedRemarks(e.target.value)} rows={3} placeholder="(空白)" />
              </div>
              <div className="text-xs text-muted-foreground">
                Log 時間：{new Date(log.created_at).toLocaleString()}　·　
                res_status: <b>{log.res_status}</b>　·　HTTP: <b>{log.http_status}</b>　·　
                success: <b>{String(log.success)}</b>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">3. 付款狀態欄位映射</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {rowsPay.map((r) => (
                <MappingRow key={r.node} r={r} />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">4. 訂單備註欄位映射</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {rowsRem.map((r) => (
                <MappingRow key={r.node} r={r} />
              ))}
            </CardContent>
          </Card>

          <Suggestions rowsPay={rowsPay} rowsRem={rowsRem} />

          <Card>
            <CardHeader><CardTitle className="text-base">附錄：原始送出 XML</CardTitle></CardHeader>
            <CardContent>
              <pre className="text-xs bg-muted p-3 rounded max-h-[400px] overflow-auto whitespace-pre-wrap break-all">
                {log.request_xml}
              </pre>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function MappingRow({ r }: { r: Row }) {
  return (
    <div className="border rounded p-3 space-y-1">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="font-medium">{r.label}</div>
        <BadgeFor m={r.match} />
      </div>
      <div className="text-xs text-muted-foreground font-mono">{r.node}</div>
      <div className="text-xs grid grid-cols-1 md:grid-cols-3 gap-2 pt-1">
        <div><span className="text-muted-foreground">送出：</span><span className="font-mono break-all">{r.sent ?? "(未送)"}</span></div>
        <div><span className="text-muted-foreground">期望：</span>{r.expected}</div>
        <div><span className="text-muted-foreground">實際：</span><span className="break-all">{r.observed}</span></div>
      </div>
      {r.hint && <div className="text-xs text-orange-700 bg-orange-500/10 border border-orange-500/20 rounded p-2 mt-1">💡 {r.hint}</div>}
    </div>
  );
}

function Suggestions({ rowsPay, rowsRem }: { rowsPay: Row[]; rowsRem: Row[] }) {
  const suggestions: string[] = [];
  const payMismatch = rowsPay.filter((r) => r.match === "mismatch");
  const remMismatch = rowsRem.filter((r) => r.match === "mismatch");

  if (payMismatch.length > 0) {
    suggestions.push(
      "付款狀態未同步：" + payMismatch.map((r) => r.label).join("、") +
      " → 建議下一步改用備援方案（Total=0 + 備註寫入實收/未收金額），或聯絡奧丁丁確認此 Channel 支援哪個節點對應「已收/未收」。"
    );
  }
  if (remMismatch.length > 0) {
    suggestions.push(
      "訂單備註未同步：" + remMismatch.map((r) => r.label).join("、") +
      " → 建議把備註寫到旅客名稱後綴或 GuestName 附近欄位當備援，並移除已確認被映射到「特殊需求」的 SpecialRequests。"
    );
  }
  if (suggestions.length === 0) return null;
  return (
    <Alert>
      <AlertTitle>下一步建議</AlertTitle>
      <AlertDescription>
        <ul className="list-disc pl-5 space-y-1 text-sm">
          {suggestions.map((s, i) => <li key={i}>{s}</li>)}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
