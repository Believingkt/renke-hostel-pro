// 團購訂單查詢／回報匯款（公開端點，以「訂單編號 + 聯絡電話後四碼」驗證）
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { bankToInfo, formatTaipei, paymentDeadline, splitDeposit } from "../_shared/groupBuy.ts";

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
        "id, order_number, guest_name, guest_phone, guest_email, check_in_date, check_out_date, guest_count, room_quantity, total_price, final_price, deposit_amount, paid_amount, order_status, payment_status, order_source, order_date, notes, accommodation_id, package_id, room_type_id, refund_status, refunded_amount, refunded_at",
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

      return json({ success: true, reported: true });
    }

    // ── 民宿基本資料／入住須知／方案內容 ──
    const accommodationId = (order as any).accommodation_id ?? campaign?.accommodation_id ?? null;
    const [{ data: acc }, { data: intro }] = await Promise.all([
      accommodationId
        ? admin.from("accommodation_info").select("name, address, phone").eq("id", accommodationId).maybeSingle()
        : Promise.resolve({ data: null as any }),
      accommodationId
        ? admin
          .from("group_buy_venue_intros")
          .select("address, phone, check_in_notice")
          .eq("accommodation_id", accommodationId)
          .maybeSingle()
        : Promise.resolve({ data: null as any }),
    ]);

    let pkg: any = null;
    if (campaign?.id) {
      const { data: pkgs } = await admin
        .from("group_buy_campaign_packages")
        .select("display_name, description, image_url, group_buy_price, package_id, room_type_id, room_type_ids")
        .eq("campaign_id", campaign.id);
      const list = (pkgs ?? []) as any[];
      pkg = list.find((p) => p.package_id && p.package_id === (order as any).package_id)
        ?? list.find((p) =>
          p.room_type_id === (order as any).room_type_id ||
          (Array.isArray(p.room_type_ids) && p.room_type_ids.includes((order as any).room_type_id))
        )
        ?? (list.length === 1 ? list[0] : null);
    }

    const emailEvents = (events ?? []).filter((e: any) =>
      e.event_type === "email_sent" || e.event_type === "email_failed"
    );

    return json({
      order: {
        orderNumber: order.order_number,
        guestName: order.guest_name,
        checkInDate: order.check_in_date,
        checkOutDate: order.check_out_date,
        guestCount: order.guest_count,
        roomQuantity: order.room_quantity,
        orderStatus: order.order_status,
        paymentStatus: order.payment_status,
        total,
        deposit: Number(order.deposit_amount) > 0 ? Number(order.deposit_amount) : deposit,
        balance,
        depositPercentage: depositPct,
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
      emails: emailEvents.map((e: any) => ({
        status: e.event_type === "email_sent" ? "sent" : "failed",
        note: e.note,
        createdAt: e.created_at,
      })),
      venue: acc
        ? {
          name: (acc as any).name ?? null,
          address: (intro as any)?.address || (acc as any).address || null,
          phone: (intro as any)?.phone || (acc as any).phone || null,
        }
        : null,
      checkInNotice: (intro as any)?.check_in_notice ?? null,
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
    return json({ error: e instanceof Error ? e.message : "internal_error" }, 500);
  }
});
