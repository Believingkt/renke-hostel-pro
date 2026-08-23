import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, ShieldCheck, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useTapPayConfig } from "@/hooks/use-tappay-config";
import { getTapPayPrime } from "@/utils/tappayPrime";
import { toGuestMessage } from "@/lib/guestFacingError";

const twd = (n: number) => `NT$ ${Math.round(n || 0).toLocaleString("en-US")}`;

export interface GroupBuyDraftRequest {
  slug: string;
  campaignPackageId: string;
  checkInDate: string;
  checkOutDate: string;
  adultCount: number;
  childCount: number;
  toddlerCount: number;
  infantCount: number;
  guestName: string;
  guestPhone: string;
  guestEmail: string;
  guestNote: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 顯示用金額（實際請款金額一律由後端 draft 決定） */
  deposit: number;
  packageName: string;
  buildRequest: () => GroupBuyDraftRequest;
}

/**
 * 團購信用卡付款（3DS）。
 *
 * 生命週期與匯款／ATM 完全不同：
 *   1. 建立 payment draft（保留 10 分鐘庫存，不建立正式訂單）
 *   2. TapPay getPrime → group-buy-start-payment 發動 3DS
 *   3. 導向銀行驗證頁；付款成功後才由後端建立正式訂單
 * 使用者中途放棄或逾時 → 保留自動釋放，不會產生任何訂單。
 */
export function GroupBuyCreditCardDialog(props: Props) {
  const { open, onOpenChange, deposit, packageName, buildRequest } = props;
  const { config, loading: configLoading, error: configError } = useTapPayConfig(open);
  const [sdkReady, setSdkReady] = useState(false);
  const [cardValid, setCardValid] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [holdSeconds, setHoldSeconds] = useState<number | null>(null);
  const draftRef = useRef<{ draftId: string; expiresAt: string; amount: number } | null>(null);

  // 載入 SDK
  useEffect(() => {
    if (!open || !config) return;
    let cancelled = false;
    const setup = () => {
      if (cancelled || !window.TPDirect) return;
      try {
        window.TPDirect.setupSDK(config.appId, config.appKey, config.env);
        setSdkReady(true);
      } catch (e) {
        console.error("[group-buy-credit] setupSDK failed", e);
        setError("付款元件載入失敗，請重新整理頁面後再試");
      }
    };
    if (window.TPDirect) {
      setup();
      return () => {
        cancelled = true;
      };
    }
    const script = document.createElement("script");
    script.src = "https://js.tappaysdk.com/sdk/tpdirect/v5.19.2";
    script.async = true;
    script.onload = setup;
    script.onerror = () => setError("付款元件載入失敗，請確認網路後再試");
    document.body.appendChild(script);
    return () => {
      cancelled = true;
    };
  }, [open, config]);

  // 掛載卡片欄位
  useEffect(() => {
    if (!open || !sdkReady) return;
    const timer = window.setTimeout(() => {
      if (!window.TPDirect || !document.getElementById("gb-card-number")) return;
      try {
        window.TPDirect.card.setup({
          fields: {
            number: { element: "#gb-card-number", placeholder: "1234 5678 9012 3456" },
            expirationDate: { element: "#gb-card-expiration-date", placeholder: "MM / YY" },
            ccv: { element: "#gb-card-ccv", placeholder: "CVV" },
          },
          styles: {
            input: { "font-size": "16px", color: "rgb(23,23,23)" },
            ".valid": { color: "rgb(34,197,94)" },
            ".invalid": { color: "rgb(239,68,68)" },
          },
        });
        window.TPDirect.card.onUpdate((update: any) => {
          setCardValid(Boolean(update?.canGetPrime));
          setCardError(update?.hasError ? "卡片資訊尚未填寫完整或格式有誤" : null);
        });
      } catch (e) {
        console.error("[group-buy-credit] card setup failed", e);
        setError("信用卡欄位載入失敗，請重新整理頁面後再試");
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [open, sdkReady]);

  // 保留倒數
  useEffect(() => {
    if (holdSeconds == null) return;
    if (holdSeconds <= 0) return;
    const t = window.setInterval(() => setHoldSeconds((s) => (s == null ? null : s - 1)), 1000);
    return () => window.clearInterval(t);
  }, [holdSeconds]);

  useEffect(() => {
    if (!open) {
      setError(null);
      setSubmitting(false);
      setHoldSeconds(null);
      draftRef.current = null;
    }
  }, [open]);

  /** 建立全新的 payment draft（永不復活舊 draft） */
  const createDraft = useCallback(async () => {
    const { data, error: dErr } = await supabase.functions.invoke("group-buy-create-payment-draft", {
      body: { ...buildRequest(), origin: window.location.origin },
    });
    const payload: any = data;
    if (dErr || !payload?.success) {
      let message: string | null = payload?.error ?? null;
      const ctx: any = (dErr as any)?.context;
      if (!message && ctx && typeof ctx.json === "function") {
        try {
          message = (await ctx.clone().json())?.error ?? null;
        } catch {
          /* ignore */
        }
      }
      throw new Error(toGuestMessage(message, "目前無法開始付款，請稍後再試或聯繫客服。"));
    }
    const next = {
      draftId: payload.draftId as string,
      expiresAt: payload.expiresAt as string,
      amount: payload.amountToCharge as number,
    };
    draftRef.current = next;
    setHoldSeconds(Math.max(0, Math.floor((new Date(next.expiresAt).getTime() - Date.now()) / 1000)));
    return next;
  }, [buildRequest]);

  /** 倒數歸零後：丟棄舊 draft，重新確認房況並建立新的保留 */
  const recheck = useCallback(async () => {
    setError(null);
    setRechecking(true);
    draftRef.current = null;
    setHoldSeconds(null);
    try {
      await createDraft();
    } catch (e: any) {
      setError(e?.message || "重新確認房況失敗，請稍後再試。");
    } finally {
      setRechecking(false);
    }
  }, [createDraft]);

  const pay = useCallback(async () => {
    setError(null);
    setSubmitting(true);
    try {
      // 1) 建立付款草稿（10 分鐘保留），金額一律由後端計算
      let draft = draftRef.current;
      const expired = draft ? new Date(draft.expiresAt).getTime() < Date.now() : true;
      if (!draft || expired) {
        // 逾時的 draft 一律作廢，改建立全新 draft（不得復活舊 draft）
        draftRef.current = null;
        draft = await createDraft();
      }

      // 2) 取得 prime
      const prime = await getTapPayPrime();

      // 3) 發動 3DS
      const { data: startData, error: sErr } = await supabase.functions.invoke("group-buy-start-payment", {
        body: {
          paymentType: "credit_card",
          draftId: draft.draftId,
          prime,
          origin: window.location.origin,
        },
      });
      const startPayload: any = startData;
      if (sErr || !startPayload?.success) {
        let message: string | null = startPayload?.error ?? null;
        const ctx: any = (sErr as any)?.context;
        if (!message && ctx && typeof ctx.json === "function") {
          try {
            message = (await ctx.clone().json())?.error ?? null;
          } catch {
            /* ignore */
          }
        }
        draftRef.current = null;
        throw new Error(toGuestMessage(message, "付款失敗，請確認卡片資訊或改用其他付款方式。"));
      }

      if (startPayload.paymentUrl) {
        window.location.href = startPayload.paymentUrl;
        return;
      }
      // 少數不需 3DS 的情況：直接請後端完成建單
      window.location.href = `/payment-result?source=group_buy&draft=${draft.draftId}&rec_trade_id=${
        startPayload.recTradeId ?? ""
      }`;
    } catch (e: any) {
      setError(e?.message || "付款失敗，請稍後再試。");
      setSubmitting(false);
    }
  }, [createDraft]);

  const holdExpired = holdSeconds != null && holdSeconds <= 0;
  const holdText = holdSeconds != null && holdSeconds > 0
    ? `${Math.floor(holdSeconds / 60)}:${String(holdSeconds % 60).padStart(2, "0")}`
    : null;


  return (
    <Dialog open={open} onOpenChange={(v) => (!submitting ? onOpenChange(v) : null)}>
      <DialogContent className="gb-theme max-h-[88vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg">信用卡付款訂金</DialogTitle>
          <DialogDescription>
            付款成功後才會建立正式訂單；期間我們會為您保留 10 分鐘的房位。
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-2xl bg-muted/70 p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">{packageName}</span>
            <span className="text-xl font-bold tabular-nums text-accent">{twd(deposit)}</span>
          </div>
          {holdText && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Timer className="h-3.5 w-3.5" />
              房位保留剩餘 {holdText}，逾時後需重新選擇日期
            </p>
          )}
        </div>

        <div className="space-y-3 rounded-2xl border border-border/70 p-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">卡號</label>
            <div id="gb-card-number" className="tpfield h-11 rounded-md border border-input bg-background px-3" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">有效期限</label>
              <div
                id="gb-card-expiration-date"
                className="tpfield h-11 rounded-md border border-input bg-background px-3"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">安全碼</label>
              <div id="gb-card-ccv" className="tpfield h-11 rounded-md border border-input bg-background px-3" />
            </div>
          </div>
          {(configLoading || !sdkReady) && (
            <p className="text-xs text-muted-foreground">付款元件載入中…</p>
          )}
          {cardError && <p className="text-xs text-destructive">{cardError}</p>}
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            卡片資料由 TapPay 加密處理，本站不會儲存您的卡號。
          </p>
        </div>

        {(error || configError) && (
          <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error || configError}</p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="h-12 rounded-xl sm:h-11"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            返回修改
          </Button>
          <Button
            type="button"
            className="h-12 rounded-xl bg-accent px-5 text-base font-semibold text-accent-foreground hover:bg-accent/90 sm:h-11"
            disabled={submitting || !cardValid || !sdkReady}
            onClick={() => void pay()}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            確認付款 {twd(deposit)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default GroupBuyCreditCardDialog;
