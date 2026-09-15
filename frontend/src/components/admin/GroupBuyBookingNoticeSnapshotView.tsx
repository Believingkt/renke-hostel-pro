import { createSanitizedHtml } from "@/utils/sanitizeHtml";
import type { BookingNoticePanel } from "@/lib/bookingNoticePanels";

interface Props {
  snapshot: any | null;
}

/** 後台稽核：顯示「下單當時」的訂房須知快照（immutable，不隨住宿規則異動） */
export function GroupBuyBookingNoticeSnapshotView({ snapshot }: Props) {
  if (!snapshot) {
    return (
      <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        此訂單缺少下單時訂房須知快照（可能建立於快照機制上線前，或快照建立失敗）；旅客查詢頁目前顯示最新版本的訂房須知。
      </p>
    );
  }

  const sections: BookingNoticePanel[] = Array.isArray(snapshot.sections) ? snapshot.sections : [];
  const capturedAt = snapshot.captured_at ? new Date(snapshot.captured_at).toLocaleString("zh-TW") : "—";

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">擷取時間：{capturedAt}</p>
      {sections.length === 0 ? (
        <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          下單當時未設定任何訂房須知。
        </p>
      ) : (
        sections.map((s) => (
          <div key={s.key} className="rounded-lg border p-3">
            <p className="text-sm font-semibold">{s.title}</p>
            {s.subtitle && <p className="text-xs text-muted-foreground">{s.subtitle}</p>}
            {s.textRows?.length ? (
              <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                {s.textRows.map((r, i) => (
                  <li key={i}>{r.label ? `${r.label}：${r.value}` : r.value}</li>
                ))}
              </ul>
            ) : null}
            {s.html ? (
              <div
                className="prose prose-sm mt-1.5 max-w-none text-xs text-muted-foreground"
                dangerouslySetInnerHTML={createSanitizedHtml(s.html)}
              />
            ) : null}
          </div>
        ))
      )}
      {snapshot.post_booking_notice?.trim() ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="text-sm font-semibold">入住前提醒（下單當時）</p>
          <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{snapshot.post_booking_notice}</p>
        </div>
      ) : null}
    </div>
  );
}

export default GroupBuyBookingNoticeSnapshotView;
