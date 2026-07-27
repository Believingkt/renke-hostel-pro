import { useEffect, useState } from "react";
import {
  getAccommodationChannel,
  channelLabelOf,
  type ChannelManager,
} from "@/lib/owltingPackageRequirement";

/**
 * 判斷該民宿是否有啟用通路同步，並回傳「對應方案」欄位的顯示政策：
 * - owlting  → 顯示欄位，必填
 * - hotelnabe→ 顯示欄位，選填（庫存推送只依房型，方案僅供對帳）
 * - null     → 完全隱藏欄位
 */
export function usePackageChannel(accommodationId: string | null | undefined) {
  const [channel, setChannel] = useState<ChannelManager | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setChannel(null);
    if (!accommodationId) {
      setLoaded(true);
      return;
    }
    getAccommodationChannel(accommodationId)
      .then((c) => {
        if (!cancelled) setChannel(c);
      })
      .catch(() => {
        if (!cancelled) setChannel(null);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [accommodationId]);

  const isRequired = channel === "owlting";
  return {
    channel,
    channelLabel: channelLabelOf(channel),
    loaded,
    /** 是否顯示「對應方案」欄位 */
    showPackageField: channel !== null,
    /** 是否為必填 */
    isRequired,
    helperText:
      channel === "owlting"
        ? "此民宿已串接奧丁丁，需選擇對應方案，推送的 RatePlanCode 會以此為準。"
        : channel === "hotelnabe"
          ? "選填。旭海（hotelnabe）庫存會依房型自動同步關房，不選方案也不影響；填寫僅供通路對帳使用。"
          : "",
  };
}
