import { useEffect, useMemo, useState } from "react";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { writeWithRowCheck, writeErrorMessage } from "@lakeze/shared/lib/supabaseWriteGuard";
import { Card, CardContent, CardHeader, CardTitle } from "@lakeze/shared/components/ui/card";
import { Button } from "@lakeze/shared/components/ui/button";
import { useToast } from "@lakeze/shared/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { GroupBuyItemPicker, type PickerOption } from "@/components/admin/GroupBuyItemPicker";

interface Props {
  campaignId: string;
  accommodationId: string;
  faqItemIds: string[] | null;
  bookingNoticeKeys: string[] | null;
  onSaved: () => void;
}

/** 訂房須知 panel key 對應（與 BookingInfoSection 的 panels 一致） */
function buildNoticeOptions(
  bookingSettings: any,
  checkInNotice: string | null,
  customSections: { id: string; section_title: string; section_content: string | null; is_enabled: boolean; display_order: number }[],
): PickerOption[] {
  const opts: PickerOption[] = [];
  const has = (v: unknown) => typeof v === "string" && v.trim() !== "";
  if (has(bookingSettings?.check_in_time) || has(bookingSettings?.check_out_time)) {
    opts.push({ key: "checkIn", label: bookingSettings?.check_in_section_title || "入住時間" });
  }
  if (Array.isArray(bookingSettings?.payment_methods) && bookingSettings.payment_methods.length > 0) {
    opts.push({ key: "payment", label: bookingSettings?.payment_section_title || "付款方式" });
  }
  if (has(bookingSettings?.cancellation_policy)) {
    opts.push({ key: "cancellation", label: bookingSettings?.cancellation_section_title || "取消政策" });
  }
  if (has(checkInNotice)) {
    opts.push({ key: "important", label: bookingSettings?.important_section_title || "重要事項" });
  }
  if (has(bookingSettings?.pet_policy)) {
    opts.push({ key: "pet", label: bookingSettings?.pet_section_title || "寵物入住守則" });
  }
  if (has(bookingSettings?.other_notes)) {
    opts.push({ key: "other", label: bookingSettings?.other_section_title || "其他注意事項" });
  }
  customSections
    .filter((s) => s.is_enabled && s.section_content?.trim())
    .sort((a, b) => a.display_order - b.display_order)
    .forEach((s) => opts.push({ key: `custom-${s.id}`, label: s.section_title, hint: "自訂區塊" }));
  return opts;
}

/** 團購後台「頁面內容」：挑選並排序要顯示在團購頁的 FAQ 與訂房須知 */
export function GroupBuyPageContentTab({
  campaignId,
  accommodationId,
  faqItemIds,
  bookingNoticeKeys,
  onSaved,
}: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [faqOptions, setFaqOptions] = useState<PickerOption[]>([]);
  const [noticeOptions, setNoticeOptions] = useState<PickerOption[]>([]);
  const [faqValue, setFaqValue] = useState<string[] | null>(faqItemIds);
  const [noticeValue, setNoticeValue] = useState<string[] | null>(bookingNoticeKeys);

  useEffect(() => {
    setFaqValue(faqItemIds);
    setNoticeValue(bookingNoticeKeys);
  }, [campaignId, faqItemIds, bookingNoticeKeys]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [faqRes, bsRes, accRes, csRes] = await Promise.all([
        supabase
          .from("faqs")
          .select("id, question, answer")
          .eq("accommodation_id", accommodationId)
          .eq("is_published", true)
          .order("display_order"),
        supabase.from("booking_settings").select("*").eq("accommodation_id", accommodationId).maybeSingle(),
        supabase.from("accommodation_info").select("check_in_notice").eq("id", accommodationId).maybeSingle(),
        supabase
          .from("custom_sections")
          .select("id, section_title, section_content, is_enabled, display_order")
          .eq("accommodation_id", accommodationId),
      ]);
      if (cancelled) return;
      setFaqOptions(
        ((faqRes.data ?? []) as any[]).map((f) => ({
          key: f.id,
          label: f.question,
          hint: (f.answer || "").replace(/<[^>]+>/g, "").slice(0, 60),
        })),
      );
      setNoticeOptions(
        buildNoticeOptions(bsRes.data, (accRes.data as any)?.check_in_notice ?? null, (csRes.data ?? []) as any[]),
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [accommodationId]);

  const dirty = useMemo(
    () =>
      JSON.stringify(faqValue) !== JSON.stringify(faqItemIds) ||
      JSON.stringify(noticeValue) !== JSON.stringify(bookingNoticeKeys),
    [faqValue, noticeValue, faqItemIds, bookingNoticeKeys],
  );

  const save = async () => {
    setSaving(true);
    try {
      await writeWithRowCheck(
        supabase
          .from("group_buy_campaigns")
          .update({ faq_item_ids: faqValue, booking_notice_keys: noticeValue } as any)
          .eq("id", campaignId)
          .select("id"),
        "儲存團購頁顯示設定",
      );
      toast({ title: "已儲存團購頁顯示設定" });
      onSaved();
    } catch (e) {
      toast({
        title: "儲存失敗",
        description: writeErrorMessage(e),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> 載入中…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">常見問題（團購頁顯示）</CardTitle>
        </CardHeader>
        <CardContent>
          <GroupBuyItemPicker
            options={faqOptions}
            value={faqValue}
            onChange={setFaqValue}
            emptyHint="此館別尚未建立已發布的常見問題"
            allHint="未設定時，團購頁顯示全部已發布 FAQ"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">訂房須知（團購頁顯示）</CardTitle>
        </CardHeader>
        <CardContent>
          <GroupBuyItemPicker
            options={noticeOptions}
            value={noticeValue}
            onChange={setNoticeValue}
            emptyHint="此館別尚未填寫訂房須知內容"
            allHint="未設定時，團購頁顯示全部訂房須知項目"
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving || !dirty}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          儲存設定
        </Button>
      </div>
    </div>
  );
}

export default GroupBuyPageContentTab;
