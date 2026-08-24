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
import { CancellationPolicyLines } from "@/components/groupbuy/CancellationPolicyLines";

const twd = (n: number) => `NT$ ${Math.round(n || 0).toLocaleString("en-US")}`;

/**
 * 付款保留（Draft）在同一分頁／同一裝置的落地位置。
 * 只存 draftId 與到期時間；金額一律以後端回傳為準，不信任本地值。
 * 關掉 Dialog 或 reload 後可用它找回原本的 Draft，避免重複建立造成雙重庫存保留。
 */
const draftStorageKey = (slug: string) => `gb_payment_draft_${slug}`;

function readStoredDraft(slug: string): { draftId: string; expiresAt: string; phoneLast4: string } | null {
  try {
    const raw = sessionStorage.getItem(draftStorageKey(slug));
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v?.draftId || !v?.expiresAt) return null;
    if (new Date(v.expiresAt).getTime() <= Date.now()) {
      sessionStorage.removeItem(draftStorageKey(slug));
      return null;
    }
    return v;
  } catch {
    return null;
  }
}

function writeStoredDraft(slug: string, v: { draftId: string; expiresAt: string; phoneLast4: string }) {
  try {
    sessionStorage.setItem(draftStorageKey(slug), JSON.stringify(v));
  } catch {
    /* 隱私模式等情境無法寫入時，僅失去續付能力，不影響付款 */
  }
}

function clearStoredDraft(slug: string) {
  try {
    sessionStorage.removeItem(draftStorageKey(slug));
  } catch {
    /* ignore */
  }
}

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
  /** 顯示用金額＝訂單總額（實際請款金額一律由後端 draft 決定） */
  amount: number;
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
  const { open, onOpenChange, amount, packageName, buildRequest } = props;
  const { config, loading: configLoading, error: configError } = useTapPayConfig(open);
  const [sdkReady, setSdkReady] = useState(false);
  const [cardValid, setCardValid] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [holdSeconds, setHoldSeconds] = useState<number | null>(null);
  const [draftInfo, setDraftInfo] = useState<
    { amount: number; total: number | null } | null
  >(null);
  const [preparing, setPreparing] = useState(false);
  /** 本次是接續既有保留（非全新建立），用於提示文案 */
  const [resumed, setResumed] = useState(false);
  /**
   * 已扣款／已轉單／待人工確認的 Draft：一律封鎖再次付款，避免重複請款。
   * 由 group-buy-resume-payment-draft 回傳 alreadyPaid 判定。
   */
  const [blocked, setBlocked] = useState<{ reason: string; orderNumber: string | null } | null>(null);
  /** 找到有效保留，但與目前畫面選擇的方案／日期不同：必須讓客人二選一，不得直接建立第二張 Draft */
  const [conflict, setConflict] = useState<any | null>(null);
  /** 「返回修改」確認層：詢問是否釋放房況（X 關閉不會觸發） */
  const [askRelease, setAskRelease] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const draftRef = useRef<{ draftId: string; expiresAt: string; amount: number } | null>(null);
  /** 防止重複點擊／重複進入造成兩張有效 Draft */
  const creatingRef = useRef<Promise<{ draftId: string; expiresAt: string; amount: number }> | null>(null);


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
      setRechecking(false);
      setPreparing(false);
      setHoldSeconds(null);
      setDraftInfo(null);
      setResumed(false);
      draftRef.current = null;
      creatingRef.current = null;
    }
  }, [open]);

  /** 建立全新的 payment draft（永不復活舊 draft；同時只允許一個建立中的請求） */
  const createDraft = useCallback(async () => {
    if (creatingRef.current) return creatingRef.current;
    const run = (async () => {
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
      const req = buildRequest();
      writeStoredDraft(req.slug, {
        draftId: next.draftId,
        expiresAt: next.expiresAt,
        phoneLast4: String(req.guestPhone ?? "").replace(/\D/g, "").slice(-4),
      });
      setDraftInfo({
        amount: next.amount,
        total: typeof payload.total === "number" ? payload.total : null,
      });
      setHoldSeconds(Math.max(0, Math.floor((new Date(next.expiresAt).getTime() - Date.now()) / 1000)));
      return next;
    })();
    creatingRef.current = run;
    try {
      return await run;
    } finally {
      creatingRef.current = null;
    }
  }, [buildRequest]);

  /**
   * 續付：找回同一位客人尚未過期的 Draft。
   * 後端為純唯讀查詢，不會延長 expires_at；找不到時回 null 交由 createDraft 建立新的。
   */
  const resumeDraft = useCallback(async () => {
    const req = buildRequest();
    const stored = readStoredDraft(req.slug);
    const phoneLast4 = String(req.guestPhone ?? "").replace(/\D/g, "").slice(-4);
    if (phoneLast4.length !== 4) return null;
    const body = stored?.draftId
      ? { draftId: stored.draftId, phoneLast4 }
      : { slug: req.slug, phoneLast4, email: req.guestEmail };
    const { data, error: rErr } = await supabase.functions.invoke("group-buy-resume-payment-draft", { body });
    const payload: any = data;
    if (payload?.alreadyPaid) {
      clearStoredDraft(req.slug);
      setBlocked({ reason: String(payload.reason ?? "paid_not_converted"), orderNumber: payload.orderNumber ?? null });
      // 回傳非 null 以阻止上層再建立新的 Draft
      return "blocked" as const;
    }
    if (rErr || !payload?.found) {
      clearStoredDraft(req.slug);
      return null;
    }
    const next = {
      draftId: payload.draftId as string,
      expiresAt: payload.expiresAt as string,
      amount: payload.amountToCharge as number,
    };
    draftRef.current = next;
    writeStoredDraft(req.slug, { draftId: next.draftId, expiresAt: next.expiresAt, phoneLast4 });
    setDraftInfo({ amount: next.amount, total: typeof payload.total === "number" ? payload.total : null });
    setHoldSeconds(Math.max(0, Number(payload.remainingSeconds) || 0));
    setResumed(true);
    return next;
  }, [buildRequest]);

  // 開啟 Dialog：先嘗試恢復既有保留，沒有才建立新的（10 分鐘倒數自建立當下起算）
  useEffect(() => {
    if (!open) return;
    if (draftRef.current || creatingRef.current) return;
    let cancelled = false;
    setPreparing(true);
    void (async () => {
      const resumedDraft = await resumeDraft().catch(() => null);
      if (cancelled || resumedDraft) return;
      await createDraft();
    })()
      .catch((e: any) => {
        if (!cancelled) setError(e?.message || "目前無法保留房況，請稍後再試。");
      })
      .finally(() => {
        if (!cancelled) setPreparing(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** 倒數歸零後：丟棄舊 draft，重新確認房況並建立新的保留 */
  const recheck = useCallback(async () => {
    setError(null);
    setRechecking(true);
    clearStoredDraft(buildRequest().slug);
    setResumed(false);
    setBlocked(null);
    draftRef.current = null;
    setHoldSeconds(null);
    setDraftInfo(null);
    try {
      await createDraft();
    } catch (e: any) {
      setError(e?.message || "重新確認房況失敗，請稍後再試。");
    } finally {
      setRechecking(false);
    }
  }, [createDraft, buildRequest]);

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
  // 付款金額唯一來源＝ server draft.amount_to_charge（尚未取得前僅顯示預估）
  const chargeAmount = draftInfo?.amount ?? null;

  return (
    <Dialog open={open} onOpenChange={(v) => (!submitting ? onOpenChange(v) : null)}>
      <DialogContent className="gb-theme max-h-[88vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg">信用卡全額付款</DialogTitle>
          <DialogDescription>
            付款成功後才會建立正式訂單；期間我們會為您保留 10 分鐘的房位。
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-2xl bg-muted/70 p-4">
          <p className="text-sm text-muted-foreground">{packageName}</p>
          {draftInfo?.total != null && (
            <div className="mt-2 flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">訂單總額</span>
              <span className="tabular-nums">{twd(draftInfo.total)}</span>
            </div>
          )}
          <div className="mt-1 flex items-baseline justify-between gap-3">
            <span className="text-sm font-semibold text-foreground">本次信用卡付款金額（全額）</span>
            <span className="text-xl font-bold tabular-nums text-accent">
              {chargeAmount != null ? twd(chargeAmount) : `${twd(amount)}（確認中）`}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">信用卡為全額付款，入住當天不需再支付尾款。</p>
          {/* 信用卡＝預收房價總額制，取消政策一律顯示 3 日級距（與後端計算同源） */}
          <CancellationPolicyLines policy="full_prepayment" className="mt-3 border-t pt-3" />
          {preparing && !holdText && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              正在為您確認並保留房況…
            </p>
          )}
          {holdText && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Timer className="h-3.5 w-3.5" />
              {resumed
                ? `已為您接續原本的付款保留，請於 ${holdText} 內完成信用卡驗證。`
                : `已為您保留房況，房況將為您保留 10 分鐘，請於 ${holdText} 內完成信用卡驗證。`}
            </p>
          )}
          {holdExpired && (
            <div className="mt-3 rounded-xl bg-destructive/10 px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
                <Timer className="h-4 w-4 shrink-0" />
                付款保留時間已結束，請重新確認房況。
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 h-10 rounded-lg"
                disabled={rechecking || submitting}
                onClick={() => void recheck()}
              >
                {rechecking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                重新確認房況
              </Button>
            </div>
          )}
        </div>


        {blocked && (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            <p className="font-semibold">
              {blocked.reason === "converted"
                ? "這筆預訂已經付款成功並完成建立訂單。"
                : blocked.reason === "manual_review"
                ? "這筆付款已送出，正在人工確認中。"
                : "這筆付款已完成扣款，訂單正在建立中。"}
            </p>
            <p className="mt-1 text-destructive/90">
              為避免重複扣款，請勿再次付款。
              {blocked.orderNumber ? `訂單編號：${blocked.orderNumber}，` : ""}
              可至「訂單查詢」以電話後四碼查看，或聯繫客服協助。
            </p>
          </div>
        )}

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
            disabled={
              submitting || rechecking || preparing || holdExpired || !!blocked || !chargeAmount || !cardValid ||
              !sdkReady
            }
            onClick={() => void pay()}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {holdExpired ? "保留已逾時" : `確認付款 ${twd(chargeAmount ?? amount)}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default GroupBuyCreditCardDialog;
