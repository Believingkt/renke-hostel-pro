// 團購信用卡付款保留「續付」查詢（Phase F3-D）
//
// 用途：旅客關掉付款視窗／重新整理／換裝置後，能找回「同一張未過期的 Draft」繼續付款，
// 避免重複建立 Draft 造成同一位客人同時吃掉兩份庫存保留。
//
// 嚴格唯讀原則：
//   1. 絕不 UPDATE / INSERT 任何資料表 —— 特別是不得延長 expires_at（保留時間只會變短不會變長）。
//   2. 只回傳續付所需的最小欄位，PII 一律遮罩，不回傳 rec_trade_id／付款細節。
//   3. 雙因子驗證：draftId + phoneLast4（同裝置），或 slug + phoneLast4 + email（跨裝置）。
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const FN = "group-buy-resume-payment-draft";

/** 可續付的 draft 狀態：已成功付款／已轉單／已取消一律不可續付 */
const RESUMABLE_STATUSES = ["pending", "payment_processing", "failed"];

/**
 * 已經產生扣款事實（或待人工確認）的狀態：一律不可續付，也不可讓前台再建立新 Draft，
 * 否則同一位客人會被重複請款。前台必須改導向訂單查詢／客服。
 */
const BLOCKING_STATUSES = ["paid", "converted", "manual_review"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const ipMap = new Map<string, { n: number; reset: number }>();
function rateOk(ip: string) {
  const now = Date.now();
  const rec = ipMap.get(ip);
  if (!rec || now > rec.reset) {
    ipMap.set(ip, { n: 1, reset: now + 60_000 });
    return true;
  }
  if (rec.n >= 20) return false;
  rec.n++;
  return true;
}

const digits = (s: unknown) => String(s ?? "").replace(/\D/g, "");

function maskEmail(em: string | null): string | null {
  const [local, domain] = String(em ?? "").split("@");
  if (!local || !domain) return null;
  return `${local.slice(0, 1)}${"*".repeat(Math.max(local.length - 1, 1))}@${domain}`;
}

function maskPhone(p: string | null): string | null {
  const d = digits(p);
  if (d.length < 4) return null;
  return `${"*".repeat(Math.max(d.length - 4, 0))}${d.slice(-4)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateOk(ip)) return json({ error: "查詢過於頻繁，請稍後再試" }, 429);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const draftId = String(body.draftId ?? "").trim();
    const slug = String(body.slug ?? "").trim();
    const phoneLast4 = digits(body.phoneLast4).slice(-4);
    const email = String(body.email ?? "").trim().toLowerCase();

    if (phoneLast4.length !== 4) return json({ error: "請提供聯絡電話後四碼" }, 400);

    const fp = (body.fingerprint ?? null) as any;
    const requireMatch = body.requireMatch !== false;

    /**
     * Booking fingerprint：判斷「這個 draft 是不是目前畫面正在進行的這一次預訂」。
     * 只比對會影響價格／庫存的核心條件（方案 + 入退房日期 + 間數）。
     */
    const matchesFingerprint = (d: any) => {
      if (!fp || !requireMatch) return true;
      return String(fp.campaignPackageId ?? "") === String(d.campaign_package_id ?? "") &&
        String(fp.checkInDate ?? "") === String(d.check_in_date ?? "") &&
        String(fp.checkOutDate ?? "") === String(d.check_out_date ?? "") &&
        (fp.roomQuantity == null || Number(fp.roomQuantity) === Number(d.room_quantity));
    };

    const SELECT_COLS =
      "id, campaign_id, campaign_package_id, status, expires_at, amount_to_charge, total_price, guest_name, guest_phone, guest_email, check_in_date, check_out_date, room_quantity, booking_payload, rec_trade_id, converted_order_id";

    let draft: any = null;

    if (draftId) {
      // ── 同裝置：sessionStorage 保存的 draftId + 電話後四碼 ──
      const { data } = await admin
        .from("group_buy_payment_drafts")
        .select(SELECT_COLS)
        .eq("id", draftId)
        .maybeSingle();
      if (data && digits(data.guest_phone).slice(-4) === phoneLast4) draft = data;
      if (!draft) return json({ found: false });

      // 身分驗證通過後，先確認「是不是同一次 booking attempt」，之後才允許 alreadyPaid 判定。
      // 歷史 draft（不同方案／日期）絕不可宣告目前這一次已付款。
      if (!matchesFingerprint(draft)) {
        const isBlocking = BLOCKING_STATUSES.includes(String(draft.status)) || draft.converted_order_id;
        const remaining = new Date(draft.expires_at).getTime() - Date.now();
        if (isBlocking || !(remaining > 0) || !RESUMABLE_STATUSES.includes(String(draft.status))) {
          // 舊的、已完成或已失效的 booking attempt：完全不影響目前這一次
          return json({ found: false, reason: "fingerprint_mismatch_historical" });
        }
        return json({
          found: false,
          reason: "fingerprint_mismatch",
          conflict: {
            draftId: draft.id,
            status: draft.status,
            expiresAt: draft.expires_at,
            remainingSeconds: Math.floor(remaining / 1000),
            checkInDate: draft.check_in_date,
            checkOutDate: draft.check_out_date,
            roomQuantity: draft.room_quantity,
            amountToCharge: Math.round(Number(draft.amount_to_charge) || 0),
            packageName: (draft.booking_payload as any)?.package_name ?? null,
            releasable: String(draft.status) === "pending" && !draft.rec_trade_id,
          },
        });
      }
    } else if (slug && email) {
      // ── 跨裝置：活動 slug + 電話後四碼 + Email ──
      // 只負責「找回目前仍可繼續付款的有效 draft」，絕不搜尋歷史已付款訂單。
      const { data: campaign } = await admin
        .from("group_buy_campaigns")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (!campaign?.id) return json({ found: false });
      const { data: rows } = await admin
        .from("group_buy_payment_drafts")
        .select(SELECT_COLS)
        .eq("campaign_id", campaign.id)
        .is("converted_order_id", null)
        .in("status", RESUMABLE_STATUSES)
        .order("created_at", { ascending: false })
        .limit(20);
      const mine = (rows ?? []).filter((r: any) =>
        digits(r.guest_phone).slice(-4) === phoneLast4 &&
        String(r.guest_email ?? "").trim().toLowerCase() === email
      );
      // 必須仍在有效期內，且 fingerprint 與目前預訂一致
      draft = mine.find((r: any) =>
        new Date(r.expires_at).getTime() > Date.now() && matchesFingerprint(r)
      ) ?? null;
      if (!draft) return json({ found: false });
    } else {
      return json({ error: "缺少查詢條件" }, 400);
    }

    const status = String(draft.status ?? "");
    // 已扣款／已轉單／待人工確認：只在「同一次 booking attempt」成立時才回報（僅 draftId 路徑會走到這）
    if (BLOCKING_STATUSES.includes(status) || draft.converted_order_id) {
      let orderNumber: string | null = null;
      if (draft.converted_order_id) {
        const { data: ord } = await admin
          .from("orders")
          .select("order_number")
          .eq("id", draft.converted_order_id)
          .maybeSingle();
        orderNumber = ord?.order_number ?? null;
      }
      return json({
        found: false,
        alreadyPaid: true,
        reason: draft.converted_order_id || status === "converted"
          ? "converted"
          : status === "manual_review"
          ? "manual_review"
          : "paid_not_converted",
        status,
        orderNumber,
      });
    }

    if (!RESUMABLE_STATUSES.includes(status)) {
      return json({ found: false, reason: "not_resumable", status });
    }

    const remainingMs = new Date(draft.expires_at).getTime() - Date.now();
    if (!(remainingMs > 0)) return json({ found: false, reason: "expired" });




    // 唯讀回傳：不含 rec_trade_id、不含完整 PII、不延長 expires_at
    return json({
      found: true,
      draftId: draft.id,
      status: draft.status,
      expiresAt: draft.expires_at,
      remainingSeconds: Math.floor(remainingMs / 1000),
      amountToCharge: Math.round(Number(draft.amount_to_charge) || 0),
      total: Math.round(Number(draft.total_price) || 0),
      chargeMode: "full",
      packageName: (draft.booking_payload as any)?.package_name ?? null,
      campaignTitle: (draft.booking_payload as any)?.campaign_title ?? null,
      checkInDate: draft.check_in_date,
      checkOutDate: draft.check_out_date,
      roomQuantity: draft.room_quantity,
      guestNameMasked: String(draft.guest_name ?? "").slice(0, 1) + "**",
      guestPhoneMasked: maskPhone(draft.guest_phone),
      guestEmailMasked: maskEmail(draft.guest_email),
      /** 已向 TapPay 發動過扣款（3DS 中斷）：前台需提醒客人先確認是否已成功付款 */
      hasPaymentAttempt: Boolean(draft.rec_trade_id),
    });
  } catch (e) {
    console.error(`[${FN}] error`, e);
    return json({ error: "目前無法恢復付款，請重新操作或聯繫客服。" }, 500);
  }
});
