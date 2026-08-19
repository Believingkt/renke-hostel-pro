// 團購頁下訂：驗證活動 / 方案 / 真實庫存 → 建立訂單 → 建立佣金列 → 寄出「訂房＋匯款資訊」信
// 公開端點（匿名可呼叫），所有價格與庫存一律由 server 端重算，不信任前端傳入金額。

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  GROUP_BUY_ORDER_SOURCE,
  bankToInfo,
  buildEmailOrder,
  formatTaipei,
  nightDates,
  nights as calcNights,
  paymentDeadline,
  splitDeposit,
  verifyInventory,
} from "../_shared/groupBuy.ts";
import { evaluateChildSelection, resolveChildRules } from "./childRules.ts";
import { ROOM_SELECT_MESSAGES, selectRoomType } from "./groupBuyRoomSelect.ts";
import {
  GROUP_BUY_DAY_TYPE_LABEL,
  calculateGroupBuyStayPrice,
  findExcludedNight,
} from "./groupBuyPricing.ts";
import { renderBookingWithBankInfo, sendGroupBuyEmail } from "../_shared/groupBuyEmail.ts";

const FN = "group-buy-create-order";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 簡易 IP 節流：每分鐘 10 次
const ipMap = new Map<string, { n: number; reset: number }>();
function rateOk(ip: string) {
  const now = Date.now();
  const rec = ipMap.get(ip);
  if (!rec || now > rec.reset) {
    ipMap.set(ip, { n: 1, reset: now + 60_000 });
    return true;
  }
  if (rec.n >= 10) return false;
  rec.n++;
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateOk(ip)) return json({ error: "請求過於頻繁，請稍後再試" }, 429);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const slug = String(body.slug ?? "").trim();
    const campaignPackageId = String(body.campaignPackageId ?? "").trim();
    const checkInDate = String(body.checkInDate ?? "").trim();
    const checkOutDate = String(body.checkOutDate ?? "").trim();
    // 團購訂單一次固定 1 間，忽略前端傳入的 roomQuantity
    const roomQuantity = 1;
    const adultCount = Math.max(1, Math.min(30, Math.round(Number(body.adultCount ?? 2) || 2)));
    const childCount = Math.max(0, Math.min(30, Math.round(Number(body.childCount ?? 0) || 0)));
    const toddlerCount = Math.max(0, Math.min(30, Math.round(Number(body.toddlerCount ?? 0) || 0)));
    const infantCount = Math.max(0, Math.min(30, Math.round(Number(body.infantCount ?? 0) || 0)));
    // guest_count = 成人＋兒童＋幼兒（不含嬰兒）
    const guestCount = adultCount + childCount + toddlerCount;
    const guestName = String(body.guestName ?? "").trim();
    const guestPhone = String(body.guestPhone ?? "").trim();
    const guestEmail = String(body.guestEmail ?? "").trim();
    const guestNote = String(body.guestNote ?? "").trim().slice(0, 500);

    if (!slug || !campaignPackageId) return json({ error: "缺少活動或方案資訊" }, 400);
    if (!DATE_RE.test(checkInDate) || !DATE_RE.test(checkOutDate)) return json({ error: "日期格式錯誤" }, 400);
    if (checkOutDate <= checkInDate) return json({ error: "退房日必須晚於入住日" }, 400);
    if (guestName.length < 1 || guestName.length > 50) return json({ error: "請填寫訂房人姓名" }, 400);
    if (!/^[0-9+\-() ]{8,20}$/.test(guestPhone)) return json({ error: "請填寫正確的聯絡電話" }, 400);
    if (!EMAIL_RE.test(guestEmail)) return json({ error: "請填寫正確的 Email（用於接收匯款資訊）" }, 400);

    // 1) 活動
    const { data: campaign, error: cErr } = await admin
      .from("group_buy_campaigns")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!campaign || campaign.status !== "active") return json({ error: "團購活動不存在或已結束" }, 404);

    const now = new Date();
    if (campaign.sale_start && new Date(campaign.sale_start) > now) return json({ error: "團購尚未開賣" }, 400);
    if (campaign.sale_end && new Date(campaign.sale_end) < now) return json({ error: "團購已結束" }, 400);
    if (campaign.stay_start_date && checkInDate < campaign.stay_start_date) {
      return json({ error: `本團購可入住日自 ${campaign.stay_start_date} 起` }, 400);
    }
    if (campaign.stay_end_date && checkOutDate > campaign.stay_end_date) {
      return json({ error: `本團購可入住日至 ${campaign.stay_end_date} 止` }, 400);
    }

    // 2) 方案
    const { data: pkg, error: pErr } = await admin
      .from("group_buy_campaign_packages")
      .select("*")
      .eq("id", campaignPackageId)
      .eq("campaign_id", campaign.id)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!pkg || !pkg.is_active) return json({ error: "此方案已停售" }, 400);
    if (pkg.max_quantity && roomQuantity > pkg.max_quantity) {
      return json({ error: `此方案單筆最多預訂 ${pkg.max_quantity} 間` }, 400);
    }

    // 2.5) 方案不適用日期（退房日不算住宿夜；server 端一律重驗）
    const excludedDates: string[] = Array.isArray(pkg.excluded_dates)
      ? (pkg.excluded_dates as unknown[]).map((d) => String(d).slice(0, 10))
      : [];
    const hitExcluded = findExcludedNight(checkInDate, checkOutDate, excludedDates);
    if (hitExcluded) {
      return json({ error: `此方案於 ${hitExcluded} 不適用，請調整住宿日期` }, 400);
    }

    // 3) 房型（庫存判定必須要有房型；支援複選房型清單）
    const candidateRoomTypeIds: string[] = Array.isArray(pkg.room_type_ids) && pkg.room_type_ids.length > 0
      ? (pkg.room_type_ids as string[])
      : pkg.room_type_id
        ? [pkg.room_type_id as string]
        : [];
    if (candidateRoomTypeIds.length === 0 && pkg.package_id) {
      const { data: accPkg } = await admin
        .from("accommodation_packages")
        .select("id, room_type_id")
        .eq("id", pkg.package_id)
        .maybeSingle();
      const fallback = (accPkg as any)?.room_type_id ?? null;
      if (fallback) candidateRoomTypeIds.push(fallback);
    }
    if (candidateRoomTypeIds.length === 0) return json({ error: "此方案尚未設定房型，請聯繫客服" }, 400);

    const n = calcNights(checkInDate, checkOutDate);
    const dates = nightDates(checkInDate, n);

    // 4) 兒童規則（沿用民宿 child_age_rules，方案覆寫優先）
    const [{ data: accInfoRow }, { data: accPkgRow }] = await Promise.all([
      admin.from("accommodation_info").select("child_age_rules").eq("id", campaign.accommodation_id).maybeSingle(),
      pkg.package_id
        ? admin.from("accommodation_packages").select("child_age_rules_override").eq("id", pkg.package_id).maybeSingle()
        : Promise.resolve({ data: null } as any),
    ]);
    const childRules = resolveChildRules(
      (accInfoRow as any)?.child_age_rules,
      (accPkgRow as any)?.child_age_rules_override ?? null,
    );
    const childEval = evaluateChildSelection(
      childRules,
      { infants: infantCount, toddlers: toddlerCount, children: childCount },
      n,
      adultCount,
    );
    if (childEval.blocked) {
      return json({ error: childEval.blockReason ?? "入住人數不符合民宿規定" }, 400);
    }
    const capacityHeadcount = adultCount + childEval.capacityHeadcount;

    // 4.5) 候選房型：capacity 與庫存必須「同時」成立才可指派
    const { data: rtRows } = await admin
      .from("room_types")
      .select("id, capacity")
      .in("id", candidateRoomTypeIds);
    const capacityMap = new Map<string, number>(
      ((rtRows as any[]) ?? []).map((r) => [String(r.id), Number(r.capacity ?? 0)]),
    );
    const candidates = candidateRoomTypeIds.map((id) => ({ id, capacity: capacityMap.get(id) ?? 0 }));

    const selection = await selectRoomType(candidates, capacityHeadcount, async (rtId) => {
      const { data: invBefore, error: invErr } = await admin.rpc("get_adjusted_room_inventory_batch", {
        p_room_type_id: rtId,
        p_dates: dates,
        p_accommodation_id: campaign.accommodation_id,
      });
      if (invErr) throw invErr;
      return verifyInventory(invBefore as any[], roomQuantity, false).ok;
    });
    const roomTypeId = selection.roomTypeId;
    if (!roomTypeId) {
      const failure = selection.failure ?? "inventory";
      return json({ error: ROOM_SELECT_MESSAGES[failure] }, failure === "capacity" ? 400 : 409);
    }

    // 5) 價格（server 端重算：團購價 × 晚數 × 1 間 ＋ 兒童加價）
    const unit = Math.round(Number(pkg.group_buy_price) || 0);
    const baseTotal = unit * n * roomQuantity;
    const childExtraTotal = Math.round(childEval.extraFeeTotal);
    const total = baseTotal + childExtraTotal;
    if (total <= 0) return json({ error: "方案價格設定有誤，請聯繫客服" }, 400);
    const { deposit, balance } = splitDeposit(total, campaign.deposit_percentage);

    // 6) 建單（order_number 由 DB trigger 產生）
    const guestComposition = [
      `成人 ${adultCount}`,
      childCount > 0 ? `${childRules.tiers.child.label} ${childCount}` : null,
      toddlerCount > 0 ? `${childRules.tiers.toddler.label} ${toddlerCount}` : null,
      infantCount > 0 ? `${childRules.tiers.infant.label} ${infantCount}` : null,
    ].filter(Boolean).join("／");
    const noteLines = [
      `【團購】${campaign.title}`,
      campaign.kol_display_name ? `合作對象：${campaign.kol_display_name}` : null,
      `方案：${pkg.display_name} × ${roomQuantity} 間 × ${n} 晚`,
      `入住人數：${guestComposition}`,
      childExtraTotal > 0 ? `兒童加價：${childExtraTotal} 元（房費 ${baseTotal} 元）` : null,
      `訂金 ${deposit} 元（${campaign.deposit_percentage}%）／尾款 ${balance} 元現場付清`,
      guestNote ? `旅客備註：${guestNote}` : null,
    ].filter(Boolean);


    const { data: order, error: oErr } = await admin
      .from("orders")
      .insert({
        order_number: "",
        accommodation_id: campaign.accommodation_id,
        room_type_id: roomTypeId,
        package_id: pkg.package_id ?? null,
        room_quantity: roomQuantity,
        check_in_date: checkInDate,
        check_out_date: checkOutDate,
        guest_count: guestCount,
        adult_count: adultCount,
        child_count: childCount,
        toddler_count: toddlerCount,
        infant_count: infantCount,
        guest_name: guestName,
        guest_phone: guestPhone,
        guest_email: guestEmail,
        total_price: total,
        discount_amount: 0,
        final_price: total,
        deposit_amount: deposit,
        discount_code: campaign.discount_code ?? null,
        order_status: "pending",
        payment_status: "unpaid",
        deposit_payment_method: "bank_transfer",
        order_source: GROUP_BUY_ORDER_SOURCE,
        // 以活動 slug 作為「通路代號」，讓後台來源標籤可顯示各團購活動名稱
        ota_channel: campaign.slug ?? null,

        notes: noteLines.join("\n"),
      })
      .select("*")
      .single();
    if (oErr) {
      console.error(`[${FN}] insert order failed`, oErr);
      const msg = String(oErr.message ?? "");
      if (/庫存|inventory|預訂|booked/i.test(msg)) return json({ error: `預訂失敗：${msg}` }, 409);
      return json({ error: "訂單建立失敗，請稍後再試" }, 500);
    }

    // 6.5) 稽核：訂單建立事件
    await admin.from("group_buy_payment_events").insert({
      campaign_id: campaign.id,
      order_id: order.id,
      event_type: "order_created",
      amount: deposit,
      actor_label: order.guest_name ?? "guest",
      note: `旅客於團購頁建立訂單（${roomQuantity} 間 / ${checkInDate} → ${checkOutDate}）`,
    });

    // 7) 下訂後複驗（並發超賣防護）
    const { data: invAfter } = await admin.rpc("get_adjusted_room_inventory_batch", {
      p_room_type_id: roomTypeId,
      p_dates: dates,
      p_accommodation_id: campaign.accommodation_id,
    });
    const post = verifyInventory(invAfter as any[], roomQuantity, true);
    if (!post.ok) {
      await admin
        .from("orders")
        .update({ order_status: "cancelled", notes: `${order.notes}\n【系統】並發超賣自動取消：${post.message}` })
        .eq("id", order.id);
      await admin.from("group_buy_payment_events").insert({
        campaign_id: campaign.id,
        order_id: order.id,
        event_type: "cancelled",
        actor_label: "system",
        note: `並發超賣自動取消：${post.message}`,
      });
      return json({ error: `預訂失敗：${post.message}，請改選其他日期` }, 409);
    }

    // 8) 團購專屬佣金列（不進既有團隊分潤）
    const rate = Number(campaign.commission_rate) || 0;
    await admin.from("group_buy_commissions").insert({
      campaign_id: campaign.id,
      order_id: order.id,
      kol_profile_id: campaign.kol_profile_id ?? null,
      revenue_base: total,
      commission_rate: rate,
      commission_amount: Math.round((total * rate) / 100),
      status: "pending",
    });

    // 9) 匯款帳戶 + 通知信
    const { data: bankRow } = await admin
      .from("group_buy_bank_accounts")
      .select("*")
      .eq("campaign_id", campaign.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const { data: acc } = await admin
      .from("accommodation_info")
      .select("name")
      .eq("id", campaign.accommodation_id)
      .maybeSingle();

    const origin = new URL(req.url).searchParams.get("origin") ||
      (typeof body.origin === "string" ? body.origin : null);
    const emailOrder = buildEmailOrder({
      order,
      campaign,
      accommodationName: (acc as any)?.name ?? null,
      packageName: pkg.display_name,
      frontendOrigin: origin,
    });
    const mailResult = await sendGroupBuyEmail(
      guestEmail,
      renderBookingWithBankInfo(emailOrder, bankToInfo(bankRow)),
    );
    if (!mailResult.ok) console.warn(`[${FN}] email skipped: ${mailResult.reason}`);

    // 9.5) 稽核：通知信寄送結果（供訂單確認頁顯示「已寄出／失敗」）
    await admin.from("group_buy_payment_events").insert({
      campaign_id: campaign.id,
      order_id: order.id,
      event_type: mailResult.ok ? "email_sent" : "email_failed",
      actor_label: "system",
      note: mailResult.ok
        ? `訂房通知＋匯款資訊信已寄至 ${guestEmail}`
        : `訂房通知信寄送失敗：${mailResult.reason ?? "unknown"}`,
    });

    const deadline = paymentDeadline(order.created_at ?? order.order_date ?? new Date().toISOString(), campaign.payment_deadline_hours);

    return json({
      success: true,
      orderNumber: order.order_number,
      total,
      deposit,
      balance,
      depositPercentage: campaign.deposit_percentage,
      paymentDeadline: deadline.toISOString(),
      paymentDeadlineText: formatTaipei(deadline),
      bank: bankToInfo(bankRow),
      emailSent: mailResult.ok,
    });
  } catch (e) {
    console.error(`[${FN}] error`, e);
    return json({ error: e instanceof Error ? e.message : "internal_error" }, 500);
  }
});
