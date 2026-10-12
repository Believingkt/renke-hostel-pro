/**
 * AI 對話行程卡底部動作列：收藏 / 分享 / 複製連結。
 * 收藏沿用 trip_favorites（與「我的收藏」「我的行程」同源）；分享沿用 ShareTripDialog；
 * 複製沿用 ShareTripDialog 的網址產生邏輯。所有按鈕會阻止卡片 Link 導頁與 trip_rec_click。
 */
import { useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Heart, Link2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { emitMetric } from "@lakeze/shared/lib/metric";
import { ShareTripDialog } from "@lakeze/shared/components/trips/ShareTripDialog";
import { copyText, ensureShareSlug, shareUrl } from "@lakeze/shared/lib/tripShare";
import type { TripLang } from "@lakeze/shared/lib/tripI18n";

const BTN =
  "inline-flex min-w-0 flex-1 items-center justify-center gap-1 rounded-xl border border-border bg-background px-2 py-2 text-xs font-medium text-foreground transition-colors active:bg-muted disabled:opacity-60";

export function TripCardActions({
  tripId,
  accommodationId,
  recId,
  lang,
  title,
  tripUrl,
}: {
  tripId: string;
  accommodationId: string | null;
  recId?: string | null;
  lang: TripLang;
  title?: unknown;
  tripUrl?: string | null;
}) {
  const navigate = useNavigate();
  const [fav, setFav] = useState(false);
  const [busy, setBusy] = useState(false);

  const stop = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const onFavorite = async (e: MouseEvent) => {
    stop(e);
    if (busy || fav) return;
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) {
        toast.info("請先登入會員以收藏行程");
        const back = encodeURIComponent(window.location.pathname + window.location.search);
        navigate(`/member/auth?redirect=${back}`);
        return;
      }
      const { data: existing } = await supabase
        .from("trip_favorites")
        .select("id")
        .eq("user_id", auth.user.id)
        .eq("ref_type", "trip")
        .eq("ref_id", tripId)
        .maybeSingle();
      if (existing) {
        setFav(true);
        toast.info("已在收藏");
        return;
      }
      const { error } = await supabase.from("trip_favorites").insert({
        user_id: auth.user.id,
        ref_type: "trip",
        ref_id: tripId,
        meta: { title: title ?? null, trip_url: tripUrl || `/trips/${tripId}` } as unknown as never,
      });
      if (error) throw error;
      setFav(true);
      emitMetric({
        event_type: "trip_favorite",
        ref_type: "trip",
        ref_id: tripId,
        accommodation_id: accommodationId,
        metadata: { source: "ai_chat_card", rec_id: recId ?? null },
      });
      toast.success("已收藏");
    } catch {
      toast.error("收藏失敗，請稍後再試");
    } finally {
      setBusy(false);
    }
  };

  const onCopy = async (e: MouseEvent) => {
    stop(e);
    const slug = (await ensureShareSlug(tripId)) || tripId;
    const ok = await copyText(shareUrl(slug, lang));
    if (ok) {
      emitMetric({
        event_type: "trip_copy",
        ref_type: "trip",
        ref_id: tripId,
        accommodation_id: accommodationId,
        metadata: { source: "ai_chat_card", rec_id: recId ?? null },
      });
      toast.success("已複製");
    }
  };

  return (
    <div className="flex items-stretch gap-1.5 pt-1" onClick={stop} data-testid={`trip-card-actions-${tripId}`}>
      <button type="button" className={BTN} onClick={onFavorite} disabled={busy} data-testid={`trip-card-fav-${tripId}`}>
        <Heart className={`h-3.5 w-3.5 shrink-0 ${fav ? "fill-current text-primary" : ""}`} />
        <span className="truncate">{fav ? "已收藏" : "收藏"}</span>
      </button>
      <ShareTripDialog
        tripId={tripId}
        lang={lang}
        accommodationId={accommodationId}
        recId={recId ?? null}
        source="ai_chat_card"
        triggerClassName={BTN}
        triggerLabel="分享"
      />
      <button type="button" className={BTN} onClick={onCopy} data-testid={`trip-card-copy-${tripId}`}>
        <Link2 className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">複製</span>
      </button>
    </div>
  );
}
