// 團購「經 Server 驗證後建立正式訂單」共用內核（Phase G2）
//
// 唯一一套團購驗證／計價／建單規則，供以下兩條路徑共用：
//   A. 人工銀行匯款／ATM：group-buy-create-order（先建單後付款）
//   B. 信用卡 3DS：group-buy-complete-paid-order（付款成功後才建單）
//
// 禁止在任何一端重寫價格／orders payload／commission 邏輯，避免兩套團購訂單制度漂移。
// deno-lint-ignore-file no-explicit-any

import {
  GROUP_BUY_ORDER_SOURCE,
  nightDates,
  nights as calcNights,
  splitDeposit,
  verifyInventory,
} from "./groupBuy.ts";
import {
  type ChildAgeRules,
  type ChildEvaluation,
  evaluateChildSelection,
  resolveChildRules,
} from "./groupBuyChildRules.ts";
import { ROOM_SELECT_MESSAGES, selectRoomType } from "./groupBuyRoomSelect.ts";
import {
  GROUP_BUY_DAY_TYPE_LABEL,
  calculateGroupBuyStayPrice,
  enabledDateTypes,
  findDisabledTypeNight,
  findExcludedNight,
  type GroupBuyStayPrice,
} from "./groupBuyPricing.ts";
import { buildBookingNoticeSnapshot } from "./groupBuyBookingNoticeSnapshot.ts";
import { taipeiToday } from "./taipeiToday.ts";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface GroupBuyBookingInput {
  slug?: string;
  campaignId?: string;
  campaignPackageId: string;
  checkInDate: string;
  checkOutDate: string;
  adultCount?: number;
  childCount?: number;
  toddlerCount?: number;
  infantCount?: number;
  guestName: string;
  guestPhone: string;
  guestEmail: string;
  guestNote?: string;
}

export interface GroupBuyValidateOptions {
  /** 允許的付款系統；manual = 銀行匯款／ATM（先建單），tappay = 信用卡（付款成功後建單） */
  expectProvider: "manual" | "tappay";
  /** 重驗庫存時排除自己這張 draft 的 hold（避免自我雙重占用） */
  excludeDraftId?: string | null;
  /** 已知的房型（信用卡轉單時沿用 draft 當初指派的房型，不重新挑房） */
  forceRoomTypeId?: string | null;
  /** 是否重新驗證銷售期間／入住日不可早於今天（信用卡轉單時仍需驗庫存但不再擋銷售期間） */
  skipSaleWindow?: boolean;
}

export interface GroupBuyBookingPlan {
  campaign: any;
  pkg: any;
  roomTypeId: string;
  roomQuantity: number;
  dates: string[];
  nights: number;
  holidays: Set<string>;
  childRules: ChildAgeRules;
  childEval: ChildEvaluation;
  stay: GroupBuyStayPrice;
  baseTotal: number;
  childExtraTotal: number;
  total: number;
  deposit: number;
  balance: number;
  guestComposition: string;
  childDetailLines: string[];
  noteLines: string[];
  input: Required<Pick<GroupBuyBookingInput, "checkInDate" | "checkOutDate" | "guestName" | "guestPhone" | "guestEmail">> & {
    adultCount: number;
    childCount: number;
    toddlerCount: number;
    infantCount: number;
    guestCount: number;
    guestNote: string;
  };
  priceSnapshot: Record<string, unknown>;
}

export type GroupBuyValidateResult =
  | { ok: true; plan: GroupBuyBookingPlan }
  | { ok: false; error: string; status: number };

const twdInt = (v: number) => `NT$${Math.round(Number(v) || 0).toLocaleString("en-US")}`;

/** 團購庫存查詢（含未過期的信用卡付款保留）；一般訂房不使用此函式 */
export async function groupBuyInventory(
  admin: any,
  params: { roomTypeId: string; dates: string[]; accommodationId: string; excludeDraftId?: string | null },
) {
  const { data, error } = await admin.rpc("get_group_buy_adjusted_inventory_batch", {
    p_room_type_id: params.roomTypeId,
    p_dates: params.dates,
    p_accommodation_id: params.accommodationId,
    p_exclude_draft_id: params.excludeDraftId ?? null,
  });
  if (error) throw error;
  return (data ?? []) as any[];
}

/**
 * 驗證 + 定價（不寫入任何資料）。
 * 建立 draft、建立正式訂單前一律先跑這支，避免任何一端自行重算。
 */
export async function validateAndPriceGroupBuyBooking(
  admin: any,
  input: GroupBuyBookingInput,
  opts: GroupBuyValidateOptions,
): Promise<GroupBuyValidateResult> {
  const fail = (error: string, status = 400): GroupBuyValidateResult => ({ ok: false, error, status });

  const campaignPackageId = String(input.campaignPackageId ?? "").trim();
  const checkInDate = String(input.checkInDate ?? "").trim();
  const checkOutDate = String(input.checkOutDate ?? "").trim();
  const roomQuantity = 1; // 團購訂單一次固定 1 間
  const adultCount = Math.max(1, Math.min(30, Math.round(Number(input.adultCount ?? 2) || 2)));
  const childCount = Math.max(0, Math.min(30, Math.round(Number(input.childCount ?? 0) || 0)));
  const toddlerCount = Math.max(0, Math.min(30, Math.round(Number(input.toddlerCount ?? 0) || 0)));
  const infantCount = Math.max(0, Math.min(30, Math.round(Number(input.infantCount ?? 0) || 0)));
  const guestCount = adultCount + childCount + toddlerCount;
  const guestName = String(input.guestName ?? "").trim();
  const guestPhone = String(input.guestPhone ?? "").trim();
  const guestEmail = String(input.guestEmail ?? "").trim();
  const guestNote = String(input.guestNote ?? "").trim().slice(0, 500);

  if (!campaignPackageId) return fail("缺少活動或方案資訊");
  if (!DATE_RE.test(checkInDate) || !DATE_RE.test(checkOutDate)) return fail("日期格式錯誤");
  if (checkOutDate <= checkInDate) return fail("退房日必須晚於入住日");
  if (guestName.length < 1 || guestName.length > 50) return fail("請填寫訂房人姓名");
  if (!/^[0-9+\-() ]{8,20}$/.test(guestPhone)) return fail("請填寫正確的聯絡電話");
  if (!EMAIL_RE.test(guestEmail)) return fail("請填寫正確的 Email（用於接收訂單資訊）");

  // 1) 活動
  let query = admin.from("group_buy_campaigns").select("*");
  query = input.campaignId ? query.eq("id", input.campaignId) : query.eq("slug", String(input.slug ?? "").trim());
  const { data: campaign, error: cErr } = await query.maybeSingle();
  if (cErr) throw cErr;
  if (!campaign || campaign.status !== "active") return fail("團購活動不存在或已結束", 404);

  // 付款方式 gate（信用卡與 ATM／匯款各自獨立開關）
  if (opts.expectProvider === "tappay") {
    if (!campaign.enable_credit_card) return fail("此團購活動未開放信用卡付款");
  }

  const now = new Date();
  if (!opts.skipSaleWindow) {
    if (campaign.sale_start && new Date(campaign.sale_start) > now) return fail("團購尚未開賣");
    if (campaign.sale_end && new Date(campaign.sale_end) < now) return fail("團購已結束");
    if (checkInDate < taipeiToday(now)) return fail("入住日期不可早於今天。");
  }
  if (campaign.stay_start_date && checkInDate < campaign.stay_start_date) {
    return fail(`本團購可入住日自 ${campaign.stay_start_date} 起`);
  }
  if (campaign.stay_end_date && checkOutDate > campaign.stay_end_date) {
    return fail(`本團購可入住日至 ${campaign.stay_end_date} 止`);
  }

  // 2) 方案
  const { data: pkg, error: pErr } = await admin
    .from("group_buy_campaign_packages")
    .select("*")
    .eq("id", campaignPackageId)
    .eq("campaign_id", campaign.id)
    .maybeSingle();
  if (pErr) throw pErr;
  if (!pkg || !pkg.is_active) return fail("此方案已停售");
  if (pkg.max_quantity && roomQuantity > pkg.max_quantity) {
    return fail(`此方案單筆最多預訂 ${pkg.max_quantity} 間`);
  }

  // 2.5) 方案不適用日期
  const excludedDates: string[] = Array.isArray(pkg.excluded_dates)
    ? (pkg.excluded_dates as unknown[]).map((d) => String(d).slice(0, 10))
    : [];
  const hitExcluded = findExcludedNight(checkInDate, checkOutDate, excludedDates);
  if (hitExcluded) return fail(`此方案於 ${hitExcluded} 不適用，請調整住宿日期`);

  // 3) 候選房型
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
  if (candidateRoomTypeIds.length === 0) return fail("此方案尚未設定房型，請聯繫客服");

  const n = calcNights(checkInDate, checkOutDate);
  const dates = nightDates(checkInDate, n);

  // 4) 兒童規則
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
  if (childEval.blocked) return fail(childEval.blockReason ?? "入住人數不符合民宿規定");
  const capacityHeadcount = adultCount + childEval.capacityHeadcount;

  const pkgMaxGuests = pkg.max_guests == null ? null : Number(pkg.max_guests);
  if (pkgMaxGuests && pkgMaxGuests > 0 && capacityHeadcount > pkgMaxGuests) {
    return fail(`此方案最多入住 ${pkgMaxGuests} 人，請調整入住人數或選擇其他方案。`);
  }

  // 4.4) 日期類型可用性
  const { data: holidayRows } = await admin
    .from("public_holidays")
    .select("holiday_date")
    .eq("accommodation_id", campaign.accommodation_id)
    .in("holiday_date", dates);
  const holidays = new Set<string>(
    ((holidayRows as any[]) ?? []).map((r) => String(r.holiday_date).slice(0, 10)),
  );
  if (enabledDateTypes(pkg as any).length === 0) {
    return fail("此方案目前暫不開放預訂，請改選其他方案");
  }
  const hitDisabledType = findDisabledTypeNight(checkInDate, checkOutDate, pkg as any, holidays);
  if (hitDisabledType) {
    return fail(
      `此方案於${GROUP_BUY_DAY_TYPE_LABEL[hitDisabledType.type]}不適用（${hitDisabledType.date}），請調整住宿日期`,
    );
  }

  // 4.5) 房型指派（capacity + 庫存同時成立；庫存已含未過期的付款保留）
  const { data: rtRows } = await admin
    .from("room_types")
    .select("id, capacity")
    .in("id", candidateRoomTypeIds);
  const capacityMap = new Map<string, number>(
    ((rtRows as any[]) ?? []).map((r) => [String(r.id), Number(r.capacity ?? 0)]),
  );

  let roomTypeId: string | null = null;
  if (opts.forceRoomTypeId) {
    const rows = await groupBuyInventory(admin, {
      roomTypeId: opts.forceRoomTypeId,
      dates,
      accommodationId: campaign.accommodation_id,
      excludeDraftId: opts.excludeDraftId,
    });
    const check = verifyInventory(rows, roomQuantity, false);
    if (!check.ok) return fail(check.message ?? ROOM_SELECT_MESSAGES.inventory, 409);
    roomTypeId = opts.forceRoomTypeId;
  } else {
    const candidates = candidateRoomTypeIds.map((id) => ({ id, capacity: capacityMap.get(id) ?? 0 }));
    const selection = await selectRoomType(candidates, capacityHeadcount, async (rtId) => {
      const rows = await groupBuyInventory(admin, {
        roomTypeId: rtId,
        dates,
        accommodationId: campaign.accommodation_id,
        excludeDraftId: opts.excludeDraftId,
      });
      return verifyInventory(rows, roomQuantity, false).ok;
    });
    roomTypeId = selection.roomTypeId;
    if (!roomTypeId) {
      const failure = selection.failure ?? "inventory";
      return fail(ROOM_SELECT_MESSAGES[failure], failure === "capacity" ? 400 : 409);
    }
  }

  // 5) 價格（server 端重算）
  const stay = calculateGroupBuyStayPrice({ checkIn: checkInDate, checkOut: checkOutDate, pkg: pkg as any, holidays });
  const baseTotal = stay.baseAccommodationTotal;
  const childExtraTotal = Math.round(childEval.extraFeeTotal);
  const total = baseTotal + childExtraTotal;
  if (total <= 0) return fail("方案價格設定有誤，請聯繫客服");
  const { deposit, balance } = splitDeposit(total, campaign.deposit_percentage);

  // 6) 文案（notes / email 共用）
  const guestComposition = [
    `成人 ${adultCount}`,
    childCount > 0 ? `${childRules.tiers.child.label} ${childCount}` : null,
    toddlerCount > 0 ? `${childRules.tiers.toddler.label} ${toddlerCount}` : null,
    infantCount > 0 ? `${childRules.tiers.infant.label} ${infantCount}` : null,
  ].filter(Boolean).join("／");

  const childDetailLines = childEval.breakdown.flatMap((b) => {
    const head = `　${b.label} ${b.count} 位`;
    if (b.free) return [head, "　　免費"];
    const parts: string[] = [];
    if (b.base_count > 0 && b.fee_per_night > 0) {
      parts.push(
        `　　${twdInt(b.fee_per_night)} × ${b.base_count} 位 × ${b.nights} 晚 = ${
          twdInt(b.fee_per_night * b.base_count * b.nights)
        }`,
      );
    }
    if (b.over_count > 0) {
      parts.push(
        `　　超出人數加價 ${twdInt(b.over_limit_fee_per_night)} × ${b.over_count} 位 × ${b.nights} 晚 = ${
          twdInt(b.over_limit_fee_per_night * b.over_count * b.nights)
        }`,
      );
    }
    return [head, ...parts];
  });

  const noteLines = [
    `【團購】${campaign.title}`,
    campaign.kol_display_name ? `合作對象：${campaign.kol_display_name}` : null,
    `方案：${pkg.display_name} × ${roomQuantity} 間 × ${n} 晚`,
    `入住人數：${guestComposition}`,
    `住宿費：${
      stay.nightlyBreakdown.map((x) => `${x.date} ${GROUP_BUY_DAY_TYPE_LABEL[x.type]} ${x.price}`).join("／")
    }（小計 ${baseTotal} 元）`,
    childDetailLines.length > 0 ? "兒童加價：" : null,
    ...(childDetailLines.length > 0 ? childDetailLines : []),
    childDetailLines.length > 0 ? `兒童加價合計：${twdInt(childExtraTotal)}（房費 ${twdInt(baseTotal)}）` : null,
    `訂金 ${deposit} 元（${campaign.deposit_percentage}%）／尾款 ${balance} 元現場付清`,
    guestNote ? `旅客備註：${guestNote}` : null,
  ].filter(Boolean) as string[];

  const priceSnapshot: Record<string, unknown> = {
    version: 1,
    computed_at: new Date().toISOString(),
    campaign_package_id: pkg.id,
    package_name: pkg.display_name,
    nights: stay.nights,
    nightly_breakdown: stay.nightlyBreakdown,
    base_accommodation_total: baseTotal,
    child_extra_total: childExtraTotal,
    child_breakdown: childEval.breakdown,
    grand_total: total,
    deposit_percentage: campaign.deposit_percentage,
    deposit,
    balance,
    prices_at_booking: {
      group_buy_price: Number(pkg.group_buy_price) || 0,
      weekday_price: pkg.weekday_price ?? null,
      peak_price: pkg.peak_price ?? null,
      disabled_date_types: Array.isArray(pkg.disabled_date_types) ? pkg.disabled_date_types : [],
      holiday_price: pkg.holiday_price ?? null,
    },
  };

  return {
    ok: true,
    plan: {
      campaign,
      pkg,
      roomTypeId,
      roomQuantity,
      dates,
      nights: n,
      holidays,
      childRules,
      childEval,
      stay,
      baseTotal,
      childExtraTotal,
      total,
      deposit,
      balance,
      guestComposition,
      childDetailLines,
      noteLines,
      priceSnapshot,
      input: {
        checkInDate,
        checkOutDate,
        guestName,
        guestPhone,
        guestEmail,
        guestNote,
        adultCount,
        childCount,
        toddlerCount,
        infantCount,
        guestCount,
      },
    },
  };
}

export interface CreateGroupBuyOrderOptions {
  /** 付款系統與方式（manual / atm 先建單；tappay 信用卡於付款成功後才建單） */
  paymentProvider: string;
  paymentMethod: string;
  /** 信用卡付款成功後建單：直接落地已收款狀態 */
  paid?: { amount: number; recTradeId?: string | null; authCode?: string | null } | null;
  /** 對應的付款草稿（僅信用卡） */
  draftId?: string | null;
  /** 建單後複驗庫存時排除自己的 hold */
  excludeDraftId?: string | null;
  extraNoteLines?: string[];
}

export type CreateGroupBuyOrderResult =
  | { ok: true; order: any }
  | { ok: false; error: string; status: number; oversold?: boolean };

/**
 * orders payload 建構（匯款／ATM 與信用卡原子轉單共用同一份，避免兩套訂單欄位漂移）。
 */
export function buildGroupBuyOrderInsert(plan: GroupBuyBookingPlan, opts: CreateGroupBuyOrderOptions) {
  const campaign = plan.campaign;
  const pkg = plan.pkg;
  const paidAmount = Math.max(0, Math.round(Number(opts.paid?.amount) || 0));
  const paymentStatus = paidAmount <= 0 ? "unpaid" : paidAmount >= plan.total ? "paid" : "deposit_paid";
  const noteLines = [...plan.noteLines, ...(opts.extraNoteLines ?? [])];

  return {
    order_number: "",
    accommodation_id: campaign.accommodation_id,
    room_type_id: plan.roomTypeId,
    package_id: pkg.package_id ?? null,
    room_quantity: plan.roomQuantity,
    check_in_date: plan.input.checkInDate,
    check_out_date: plan.input.checkOutDate,
    guest_count: plan.input.guestCount,
    adult_count: plan.input.adultCount,
    child_count: plan.input.childCount,
    toddler_count: plan.input.toddlerCount,
    infant_count: plan.input.infantCount,
    guest_name: plan.input.guestName,
    guest_phone: plan.input.guestPhone,
    guest_email: plan.input.guestEmail,
    total_price: plan.total,
    discount_amount: 0,
    final_price: plan.total,
    deposit_amount: plan.deposit,
    discount_code: campaign.discount_code ?? null,
    order_status: paidAmount > 0 ? "confirmed" : "pending",
    confirmed_at: paidAmount > 0 ? new Date().toISOString() : null,
    payment_status: paymentStatus,
    paid_amount: paidAmount,
    payment_provider: opts.paymentProvider,
    payment_method: opts.paymentMethod,
    deposit_payment_method: opts.paymentMethod,
    order_source: GROUP_BUY_ORDER_SOURCE,
    ota_channel: campaign.slug ?? null,
    notes: noteLines.join("\n"),
  };
}

/** group_buy_commissions payload 建構（同上，兩條路徑共用） */
export function buildGroupBuyCommissionInsert(plan: GroupBuyBookingPlan, opts: CreateGroupBuyOrderOptions) {
  const campaign = plan.campaign;
  const rate = Number(campaign.commission_rate) || 0;
  return {
    campaign_id: campaign.id,
    kol_profile_id: campaign.kol_profile_id ?? null,
    revenue_base: plan.total,
    commission_rate: rate,
    commission_amount: Math.round((plan.total * rate) / 100),
    status: "pending",
    price_snapshot: {
      ...plan.priceSnapshot,
      payment_provider: opts.paymentProvider,
      campaign_payment_method: campaign.payment_method ?? "manual_bank_transfer",
      payment_type: opts.paid ? "credit_card" : opts.paymentMethod,
      payment_draft_id: opts.draftId ?? null,
      rec_trade_id: opts.paid?.recTradeId ?? null,
    },
  };
}

/**
 * 建立正式團購訂單（orders + 須知快照 + 稽核 + 下訂後複驗 + group_buy_commissions）。
 * 匯款／ATM 專用（先建單後付款）。信用卡改走 convertGroupBuyDraftToOrderAtomic。
 */
export async function createGroupBuyOrderCore(
  admin: any,
  plan: GroupBuyBookingPlan,
  opts: CreateGroupBuyOrderOptions,
): Promise<CreateGroupBuyOrderResult> {
  const campaign = plan.campaign;

  const { data: order, error: oErr } = await admin
    .from("orders")
    .insert(buildGroupBuyOrderInsert(plan, opts))
    .select("*")
    .single();

  if (oErr) {
    console.error("[createGroupBuyOrderCore] insert order failed", oErr);
    const msg = String(oErr.message ?? "");
    if (/庫存|inventory|預訂|booked/i.test(msg)) {
      return { ok: false, error: "此日期房況已變動，請重新選擇日期或改選其他方案", status: 409, oversold: true };
    }
    return { ok: false, error: "訂單建立失敗，請稍後再試", status: 500 };
  }


  // 訂房須知快照（immutable，僅此處寫入一次；失敗不影響訂單成立）
  try {
    const noticeSnapshot = await buildBookingNoticeSnapshot(admin, {
      accommodationId: campaign.accommodation_id ?? null,
      campaignId: campaign.id ?? null,
      visibleKeys: (campaign as any).booking_notice_keys ?? null,
    });
    await admin.from("orders").update({ group_buy_booking_notice_snapshot: noticeSnapshot }).eq("id", order.id);
  } catch (snapErr) {
    console.error("[createGroupBuyOrderCore] booking_notice_snapshot_failed", {
      order_id: order.id,
      reason: snapErr instanceof Error ? snapErr.message : String(snapErr),
    });
    try {
      await admin.from("group_buy_payment_events").insert({
        campaign_id: campaign.id,
        order_id: order.id,
        event_type: "booking_notice_snapshot_failed",
        actor_label: "系統",
        note: `訂房須知快照建立失敗：${snapErr instanceof Error ? snapErr.message : String(snapErr)}`.slice(0, 500),
      });
    } catch (evErr) {
      console.error("[createGroupBuyOrderCore] snapshot audit insert failed", evErr);
    }
  }

  // 稽核：訂單建立事件
  await admin.from("group_buy_payment_events").insert({
    campaign_id: campaign.id,
    order_id: order.id,
    event_type: "order_created",
    amount: plan.deposit,
    actor_label: order.guest_name ?? "guest",
    note: `${
      opts.paymentProvider === "tappay" ? "信用卡付款成功後建立訂單" : "旅客於團購頁建立訂單"
    }（${plan.roomQuantity} 間 / ${plan.input.checkInDate} → ${plan.input.checkOutDate}）${
      opts.draftId ? `／draft:${opts.draftId}` : ""
    }`,
  });

  // 下訂後複驗（並發超賣防護）
  const invAfter = await groupBuyInventory(admin, {
    roomTypeId: plan.roomTypeId,
    dates: plan.dates,
    accommodationId: campaign.accommodation_id,
    excludeDraftId: opts.excludeDraftId,
  });
  const post = verifyInventory(invAfter, plan.roomQuantity, true);
  if (!post.ok) {
    await admin
      .from("orders")
      .update({
        order_status: "cancelled",
        cancelled_at: new Date().toISOString(),
        notes: `${order.notes}\n【系統】並發超賣自動取消：${post.message}`,
      })
      .eq("id", order.id);
    await admin.from("group_buy_payment_events").insert({
      campaign_id: campaign.id,
      order_id: order.id,
      event_type: "cancelled",
      actor_label: "system",
      note: `並發超賣自動取消：${post.message}`,
    });
    return { ok: false, error: `預訂失敗：${post.message}，請改選其他日期`, status: 409, oversold: true };
  }

  // 團購專屬佣金列（不進既有團隊分潤）
  const rate = Number(campaign.commission_rate) || 0;
  await admin.from("group_buy_commissions").insert({
    campaign_id: campaign.id,
    order_id: order.id,
    kol_profile_id: campaign.kol_profile_id ?? null,
    revenue_base: plan.total,
    commission_rate: rate,
    commission_amount: Math.round((plan.total * rate) / 100),
    status: "pending",
    price_snapshot: {
      ...plan.priceSnapshot,
      payment_provider: opts.paymentProvider,
      campaign_payment_method: campaign.payment_method ?? "manual_bank_transfer",
      payment_type: opts.paid ? "credit_card" : opts.paymentMethod,
      payment_draft_id: opts.draftId ?? null,
      rec_trade_id: opts.paid?.recTradeId ?? null,
    },
  });

  return { ok: true, order };
}
