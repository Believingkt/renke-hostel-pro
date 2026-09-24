import { LifeBuoy, MessageCircle, Phone } from "lucide-react";
import { Button } from "@lakeze/shared/components/ui/button";
import {
  hasVenueContact,
  lineOfficialUrl,
  MANUAL_REFUND_FIELDS_TITLE,
  MANUAL_REFUND_INTRO,
  MANUAL_REFUND_NO_CONTACT,
  MANUAL_REFUND_OUTRO,
  MANUAL_REFUND_REQUIRED_FIELDS,
  type VenueContact,
} from "@/lib/manualRefundRequest";

/**
 * ATM 虛擬帳號／銀行匯款訂單取消後的「人工退款申請說明」。
 * 信用卡（原卡退刷）不得渲染本元件。
 * 安全限制：本頁不收集任何銀行帳號／存摺檔案，只引導旅客聯繫客服或官方 LINE。
 */
export function ManualRefundRequestNotice({ contact }: { contact?: VenueContact | null }) {
  const line = lineOfficialUrl(contact?.lineId);
  const supportHref = contact?.phone
    ? `tel:${String(contact.phone).replace(/\s/g, "")}`
    : contact?.email
    ? `mailto:${contact.email}`
    : contact?.websiteUrl || null;

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
      <p className="mb-1 flex items-center gap-2 font-semibold text-foreground">
        <LifeBuoy className="h-4 w-4" />
        退款處理中
      </p>
      <p className="text-muted-foreground">您的退款將由館方人工辦理。</p>
      <p className="mt-2 text-foreground">{MANUAL_REFUND_INTRO}</p>
      <p className="mt-2 text-foreground">{MANUAL_REFUND_FIELDS_TITLE}</p>
      <ul className="mt-1 space-y-1">
        {MANUAL_REFUND_REQUIRED_FIELDS.map((field) => (
          <li key={field} className="flex items-start gap-2 text-foreground">
            <span className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
            <span className="min-w-0 break-words">{field}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-muted-foreground">{MANUAL_REFUND_OUTRO}</p>

      {hasVenueContact(contact) ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {supportHref && (
            <Button asChild size="sm" variant="outline">
              <a href={supportHref}>
                <Phone className="mr-1.5 h-4 w-4" />
                聯繫客服
              </a>
            </Button>
          )}
          {line && (
            <Button asChild size="sm">
              <a href={line} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="mr-1.5 h-4 w-4" />
                官方 LINE
              </a>
            </Button>
          )}
        </div>
      ) : (
        <p className="mt-2 text-foreground">{MANUAL_REFUND_NO_CONTACT}</p>
      )}
    </div>
  );
}

export default ManualRefundRequestNotice;
