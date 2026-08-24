// 團購訂單查詢／回報匯款（公開端點，以「訂單編號 + 聯絡電話後四碼」驗證）
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { bankToInfo, buildAdminGroupBuyUrl, buildEmailOrder, formatTaipei, paymentDeadline, splitDeposit } from "../_shared/groupBuy.ts";
import {
  renderGuestCancelRequested,
  renderVenueCancelRequested,
  renderVenueTransferReported,
  sendGroupBuyEmail,
} from "../_shared/groupBuyEmail.ts";
import { CANCEL_REQUEST_RECEIVED_TEXT, REFUND_PENDING_REVIEW_TEXT } from "../_shared/refundPolicy.ts";
import { resolveCancellationPolicy } from "../_shared/cancellationPolicy.ts";

import { resolveOrderNotifyEmails } from "../_shared/notifyRecipients.ts";

const FN = "group-buy-order-lookup";

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

function digits(s: unknown) {
  return String(s ?? "").replace(/\D/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateOk(ip)) return json({ error: "查詢過於頻繁，請稍後再試" }, 429);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const orderNumber = String(body.orderNumber ?? "").trim().toUpperCase();
    const phoneLast4 = digits(body.phoneLast4).slice(-4);
    const action = String(body.action ?? "lookup");

    if (!orderNumber || phoneLast4.length !== 4) {
      return json({ error: "請輸入訂單編號與聯絡電話後四碼" }, 400);
    }

    const { data: order, error: oErr } = await admin
      .from("orders")
      .select(
        "id, order_number, guest_name, guest_phone, guest_email, check_in_date, check_out_date, guest_count, room_quantity, total_price, final_price, deposit_amount, paid_amount, order_status, payment_status, payment_provider, payment_method, order_source, order_date, notes, group_buy_booking_notice_snapshot, accommodation_id, package_id, room_type_id, refund_status, refunded_amount, refunded_at, atm_vacc_no, atm_vacc_bank_code, atm_expire_at, atm_rec_trade_id",
      )
      .eq("order_number", orderNumber)
      .eq("order_source", "group_buy")
      .maybeSingle();
    if (oErr) throw oErr;
    if (!order || digits(order.guest_phone).slice(-4) !== phoneLast4) {
      return json({ error: "查無此訂單，請確認訂單編號與電話後四碼" }, 404);
    }

    const { data: commission } = await admin
      .from("group_buy_commissions")
      .select("campaign_id")
      .eq("order_id", order.id)
      .maybeSingle();

    const { data: campaign } = commission?.campaign_id
      ? await admin.from("group_buy_campaigns").select("*").eq("id", commission.campaign_id).maybeSingle()
      : { data: null as any };

    const depositPct = campaign?.deposit_percentage ?? 30;
    const { total, deposit, balance } = splitDeposit(
      Number(order.final_price ?? order.total_price ?? 0),
      depositPct,
    );
    const deadline = paymentDeadline(order.order_date ?? new Date().toISOString(), campaign?.payment_deadline_hours ?? 72);

    const { data: events } = await admin
      .from("group_buy_payment_events")
      .select("event_type, amount, account_last5, transferred_at, note, created_at")
      .eq("order_id", order.id)
      .order("created_at", { ascending: true });

    // ── 回報已匯款 ──
    if (action === "report_transfer") {
      if (order.order_status === "cancelled") return json({ error: "此訂單已取消，請聯繫客服" }, 400);
      if (order.payment_status !== "unpaid") return json({ error: "此訂單已完成收款，無需重複回報" }, 400);
      const already = (events ?? []).some((e: any) => e.event_type === "guest_reported");
      if (already) return json({ error: "您已回報過匯款，我們正在核對中" }, 400);

      const accountLast5 = digits(body.accountLast5).slice(-5);
      const transferredAtRaw = String(body.transferredAt ?? "").trim();
      if (accountLast5.length !== 5) return json({ error: "請輸入匯款帳號後五碼" }, 400);
      const transferredAt = transferredAtRaw ? new Date(transferredAtRaw) : new Date();
      if (Number.isNaN(transferredAt.getTime())) return json({ error: "匯款時間格式錯誤" }, 400);

      await admin.from("group_buy_payment_events").insert({
        campaign_id: campaign?.id ?? null,
        order_id: order.id,
        event_type: "guest_reported",
        amount: deposit,
        account_last5: accountLast5,
        transferred_at: transferredAt.toISOString(),
        actor_label: order.guest_name,
        note: "旅客自行回報已完成匯款",
      });

      // 民宿／管理者通知（失敗不可影響旅客回報結果）
      try {
        const { emails: venueEmails, source: venueSource } = await resolveOrderNotifyEmails(admin, {
          accommodationId: (order as any).accommodation_id ?? campaign?.accommodation_id ?? null,
          campaignId: campaign?.id ?? null,
        });
        if (venueEmails.length === 0) {
          await admin.from("group_buy_payment_events").insert({
            campaign_id: campaign?.id ?? null,
            order_id: order.id,
            event_type: "note",
            actor_label: "system",
            note: "venue_email_skipped／recipient_type:venue／template_type:venue_transfer_reported／no_recipients",
          });
        } else {
          const { data: accRow } = await admin
            .from("accommodation_info")
            .select("name")
            .eq("id", (order as any).accommodation_id ?? campaign?.accommodation_id ?? "")
            .maybeSingle();
          const emailOrder = buildEmailOrder({
            order,
            campaign: campaign ?? { title: "團購活動", deposit_percentage: depositPct, payment_deadline_hours: 72 },
            accommodationName: (accRow as any)?.name ?? null,
            packageName: null,
            frontendOrigin: typeof body.origin === "string" ? body.origin : null,
          });
          const tpe = (opts: Intl.DateTimeFormatOptions) =>
            new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", ...opts }).format(transferredAt);
          const venueMail = await sendGroupBuyEmail(
            venueEmails,
            renderVenueTransferReported(
              {
                ...emailOrder,
                depositAmount: deposit,
                guestPhone: order.guest_phone ?? null,
                guestEmail: order.guest_email ?? null,
                paymentStatusText: "待匯款（旅客已回報）",
                adminUrl: buildAdminGroupBuyUrl({
                  accommodationId: (order as any).accommodation_id ?? campaign?.accommodation_id ?? null,
                  campaignId: campaign?.id ?? null,
                  orderNumber: order.order_number,
                }),
              },
              {
                accountLast5,
                transferDateText: tpe({ year: "numeric", month: "2-digit", day: "2-digit" }),
                transferTimeText: tpe({ hour: "2-digit", minute: "2-digit", hour12: false }),
              },
            ),
          );
          if (!venueMail.ok) console.error(`[group-buy-order-lookup] venue email failed: ${venueMail.reason}`);
          await admin.from("group_buy_payment_events").insert({
            campaign_id: campaign?.id ?? null,
            order_id: order.id,
            event_type: venueMail.ok ? "email_sent" : "email_failed",
            actor_label: "system",
            note: `recipient_type:venue／template_type:venue_transfer_reported／recipient_count:${venueEmails.length}／source:${venueSource}${
              venueMail.ok ? "" : `／reason:${venueMail.reason ?? "unknown"}`
            }`,
          });
        }
      } catch (venueErr) {
        console.error("[group-buy-order-lookup] venue notify threw", venueErr);
      }

      return json({ success: true, reported: true });
    }

    const cancelRequestedEvent = (events ?? []).find((e: any) => e.event_type === "cancel_requested") ?? null;

    // ── 旅客提交取消訂單（退款）申請 ──
    if (action === "request_cancel") {
      if (order.order_status === "cancelled") return json({ error: "此訂單已取消" }, 400);
      if (cancelRequestedEvent) return json({ error: "您已送出取消申請，我們正在處理中" }, 400);

      const reason = String(body.reason ?? "").trim().slice(0, 300);
      await admin.from("group_buy_payment_events").insert({
        campaign_id: campaign?.id ?? null,
        order_id: order.id,
        event_type: "cancel_requested",
        actor_label: order.guest_name,
        note: reason ? `旅客申請取消訂單：${reason}` : "旅客申請取消訂單",
      });

      // 通知：旅客取消申請確認信 + 民宿／管理者通知（寄信失敗不影響申請結果）
      try {
        const { data: accRow } = await admin
          .from("accommodation_info")
          .select("name")
          .eq("id", (order as any).accommodation_id ?? campaign?.accommodation_id ?? "")
          .maybeSingle();
        const emailOrder = buildEmailOrder({
          order,
          campaign: campaign ?? { title: "團購活動", deposit_percentage: depositPct, payment_deadline_hours: 72 },
          accommodationName: (accRow as any)?.name ?? null,
          packageName: null,
          frontendOrigin: typeof body.origin === "string" ? body.origin : null,
        });
        const requestedAtText = formatTaipei(new Date());
        const paidAmount = Math.max(0, Math.round(Number((order as any).paid_amount) || 0));

        const guestMail = await sendGroupBuyEmail(
          order.guest_email,
          renderGuestCancelRequested(emailOrder, { requestedAtText, reason: reason || null }),
        );
        await admin.from("group_buy_payment_events").insert({
          campaign_id: campaign?.id ?? null,
          order_id: order.id,
          event_type: guestMail.ok ? "email_sent" : "email_failed",
          actor_label: "system",
          note: `recipient_type:guest／template_type:guest_cancel_requested${
            guestMail.ok ? "／recipient_count:1" : `／reason:${guestMail.reason ?? "unknown"}`
          }`,
        });

        const { emails: venueEmails, source: venueSource } = await resolveOrderNotifyEmails(admin, {
          accommodationId: (order as any).accommodation_id ?? campaign?.accommodation_id ?? null,
          campaignId: campaign?.id ?? null,
        });
        if (venueEmails.length === 0) {
          await admin.from("group_buy_payment_events").insert({
            campaign_id: campaign?.id ?? null,
            order_id: order.id,
            event_type: "note",
            actor_label: "system",
            note: "venue_email_skipped／recipient_type:venue／template_type:venue_cancel_requested／no_recipients",
          });
        } else {
          const venueMail = await sendGroupBuyEmail(
            venueEmails,
            renderVenueCancelRequested(
              {
                ...emailOrder,
                guestPhone: order.guest_phone ?? null,
                guestEmail: order.guest_email ?? null,
                adminUrl: buildAdminGroupBuyUrl({
                  accommodationId: (order as any).accommodation_id ?? campaign?.accommodation_id ?? null,
                  campaignId: campaign?.id ?? null,
                  orderNumber: order.order_number,
                }),
              },
              { requestedAtText, reason: reason || null, paidAmount },
            ),
          );
          await admin.from("group_buy_payment_events").insert({
            campaign_id: campaign?.id ?? null,
            order_id: order.id,
            event_type: venueMail.ok ? "email_sent" : "email_failed",
            actor_label: "system",
            note: `recipient_type:venue／template_type:venue_cancel_requested／recipient_count:${venueEmails.length}／source:${venueSource}${
              venueMail.ok ? "" : `／reason:${venueMail.reason ?? "unknown"}`
            }`,
          });
        }
      } catch (notifyErr) {
        console.error("[group-buy-order-lookup] cancel notify threw", notifyErr);
      }

      return json({
        success: true,
        cancelRequested: true,
        message: `${CANCEL_REQUEST_RECEIVED_TEXT}${REFUND_PENDING_REVIEW_TEXT}`,
      });
    }



    // ── 民宿基本資料／訂房須知（正式規則）／入住前提醒／方案內容 ──
    // 注意：訂房須知為 live data（顯示目前最新版本），非下單當時的條款快照。
    const accommodationId = (order as any).accommodation_id ?? campaign?.accommodation_id ?? null;
    const [{ data: acc }, { data: intro }, { data: bookingSettings }, { data: customSections }] = await Promise.all([
      accommodationId
        ? admin.from("accommodation_info").select("name, address, phone, check_in_notice").eq("id", accommodationId).maybeSingle()
        : Promise.resolve({ data: null as any }),
      accommodationId
        ? admin
          .from("group_buy_venue_intros")
          .select("address, phone, check_in_notice")
          .eq("accommodation_id", accommodationId)
          .maybeSingle()
        : Promise.resolve({ data: null as any }),
      accommodationId
        ? admin.from("booking_settings").select("*").eq("accommodation_id", accommodationId).maybeSingle()
        : Promise.resolve({ data: null as any }),
      accommodationId
        ? admin
          .from("custom_sections")
          .select("id, section_title, section_subtitle, section_content, display_order, is_enabled")
          .eq("accommodation_id", accommodationId)
          .order("display_order")
        : Promise.resolve({ data: [] as any[] }),
    ]);

    // ── 常見問題：與團購活動頁完全同源 ──
    // 資料表 faqs（accommodation_id + is_published，display_order 排序），
    // 後台若於 group_buy_campaigns.faq_item_ids 指定，則依該陣列順序過濾。
    let faqItems: { id: string; question: string; answer: string }[] = [];
    if (accommodationId) {
      const { data: faqRows } = await admin
        .from("faqs")
        .select("id, question, answer")
        .eq("accommodation_id", accommodationId)
        .eq("is_published", true)
        .order("display_order");
      const all = (faqRows ?? []) as { id: string; question: string; answer: string }[];
      const picked = (campaign as any)?.faq_item_ids;
      faqItems = Array.isArray(picked)
        ? (picked.map((id: string) => all.find((f) => f.id === id)).filter(Boolean) as typeof all)
        : all;
    }


    let pkg: any = null;
    if (campaign?.id) {
      const { data: pkgs } = await admin
        .from("group_buy_campaign_packages")
        .select("display_name, description, image_url, group_buy_price, package_id, room_type_id, room_type_ids")
        .eq("campaign_id", campaign.id);
      const list = (pkgs ?? []) as any[];
      // 建單時會把方案名稱寫進 notes（「方案：XXX × N 間 × M 晚」），優先用它精準比對，
      // 避免同活動多方案共用房型時抓錯方案。
      const noteName = String((order as any).notes ?? "").match(/方案：(.+?)\s*×/)?.[1]?.trim() ?? "";
      pkg = (noteName ? list.find((p) => p.display_name === noteName) : null)
        ?? list.find((p) => p.package_id && p.package_id === (order as any).package_id)
        ?? list.find((p) =>
          p.room_type_id === (order as any).room_type_id ||
          (Array.isArray(p.room_type_ids) && p.room_type_ids.includes((order as any).room_type_id))
        )
        ?? (list.length === 1 ? list[0] : null);

    }

    const emailEvents = (events ?? []).filter((e: any) =>
      e.event_type === "email_sent" || e.event_type === "email_failed"
    );


    // 團購信用卡＝全額付款：無訂金／尾款概念
    const paidAmountNow = Math.max(0, Math.round(Number((order as any).paid_amount) || 0));
    const fullPayment = String((order as any).payment_provider ?? "") === "tappay" &&
      String((order as any).payment_method ?? "").includes("credit_card");

    /**
     * 付款方式 SoT＝這張訂單的 orders.payment_method（不得依 campaign 現行設定推測）。
     * atm → ATM 虛擬帳號；credit_card* → 信用卡；其餘 → 銀行人工匯款。
     */
    const paymentMethodRaw = String((order as any).payment_method ?? "");
    const isAtmOrder = paymentMethodRaw === "atm" || !!(order as any).atm_vacc_no;
    const paymentChannel: "atm" | "credit_card" | "bank" = fullPayment
      ? "credit_card"
      : isAtmOrder
      ? "atm"
      : "bank";
    // 已收訂金／已付清：以 orders.payment_status 為準（ATM 不會有 admin_confirmed 事件）
    const depositPaid = ["deposit_paid", "partial", "partial_paid", "paid"].includes(
      String((order as any).payment_status ?? ""),
    ) || paidAmountNow > 0;

    return json({
      order: {
        orderNumber: order.order_number,
        guestName: order.guest_name,
        // 只回傳遮罩後的信箱給前台顯示（不外流完整 PII）
        guestEmailMasked: (() => {
          const em = String(order.guest_email ?? "");
          const [local, domain] = em.split("@");
          if (!domain || !local) return null;
          return `${local.slice(0, 1)}${"*".repeat(Math.max(local.length - 1, 1))}@${domain}`;
        })(),

        checkInDate: order.check_in_date,
        checkOutDate: order.check_out_date,
        guestCount: order.guest_count,
        roomQuantity: order.room_quantity,
        orderStatus: order.order_status,
        paymentStatus: order.payment_status,
        total,
        deposit: fullPayment ? 0 : (Number(order.deposit_amount) > 0 ? Number(order.deposit_amount) : deposit),
        balance: fullPayment ? Math.max(0, total - paidAmountNow) : balance,
        depositPercentage: depositPct,
        paymentProvider: (order as any).payment_provider ?? null,
        paidAmount: paidAmountNow,
        fullPayment,
        /** 付款方式分流（前台顯示 SoT） */
        paymentChannel,
        paymentMethod: paymentMethodRaw || null,
        depositPaid,
        atm: isAtmOrder && (order as any).atm_vacc_no
          ? {
            vaccNo: (order as any).atm_vacc_no,
            bankCode: (order as any).atm_vacc_bank_code ?? null,
            expireAt: (order as any).atm_expire_at ?? null,
            amount: Number(order.deposit_amount) > 0 ? Number(order.deposit_amount) : deposit,
          }
          : null,
        // 取消政策依「此訂單」實際付款制度判定，不得依活動當下設定判定
        cancellationPolicy: resolveCancellationPolicy({
          order_source: (order as any).order_source ?? "group_buy",
          payment_provider: (order as any).payment_provider ?? null,
          payment_method: (order as any).payment_method ?? null,
          paid_amount: paidAmountNow,
          final_price: Number((order as any).final_price ?? (order as any).total_price ?? 0),
        }).policy,

        paymentDeadline: deadline.toISOString(),
        paymentDeadlineText: formatTaipei(deadline),
      },
      campaign: campaign
        ? { title: campaign.title, slug: campaign.slug, contactNote: campaign.contact_note, kol: campaign.kol_display_name }
        : null,
      bank: await (async () => {
        if (!campaign?.id) return null;
        const { data } = await admin
          .from("group_buy_bank_accounts")
          .select("*")
          .eq("campaign_id", campaign.id)
          .order("is_default", { ascending: false })
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        return bankToInfo(data);
      })(),
      events: events ?? [],
      cancelRequest: cancelRequestedEvent
        ? { requestedAt: (cancelRequestedEvent as any).created_at, note: (cancelRequestedEvent as any).note }
        : null,

      // 只回傳結構化欄位，raw note（內部 metadata）不外流給前台
      emails: emailEvents.map((e: any) => {
        const note = String(e.note ?? "");
        const pick = (k: string) => note.match(new RegExp(`${k}:([^／/]+)`))?.[1]?.trim() ?? null;
        return {
          status: e.event_type === "email_sent" ? "sent" : "failed",
          recipientType: pick("recipient_type"),
          templateType: pick("template_type"),
          createdAt: e.created_at,
        };
      }),

      venue: acc
        ? {
          name: (acc as any).name ?? null,
          address: (intro as any)?.address || (acc as any).address || null,
          phone: (intro as any)?.phone || (acc as any).phone || null,
        }
        : null,
      // 入住前提醒（訂單成立後才顯示的補充資訊），非正式住宿規則。
      // 有快照時優先使用快照版本（保留下單當時提供給客人的內容）。
      preArrivalNotice: (order as any).group_buy_booking_notice_snapshot?.post_booking_notice
        ?? (intro as any)?.check_in_notice ?? null,
      // 常見問題：與團購活動頁完全同源（faqs 表 + campaign.faq_item_ids 指定順序）
      faqItems: faqItems,
      // 註：訂房須知快照（orders.group_buy_booking_notice_snapshot）仍完整保留於資料庫，
      // 供後台稽核／爭議舉證使用，僅不在旅客訂單查詢頁顯示。

      package: pkg
        ? {
          name: pkg.display_name,
          description: pkg.description,
          imageUrl: pkg.image_url,
          price: Number(pkg.group_buy_price) || 0,
        }
        : null,
      refund: {
        status: (order as any).refund_status ?? null,
        amount: Number((order as any).refunded_amount) || 0,
        refundedAt: (order as any).refunded_at ?? null,
      },
    });
  } catch (e) {
    console.error(`[${FN}] error`, e);
    // 對客一律回傳友善文案，原始 exception 只留在 server log
    return json({ error: "目前無法完成操作，請稍後再試或聯繫客服。" }, 500);
  }
});
