// 訂單確認信：完整複製會員端「訂單詳情頁」(src/pages/MemberOrderDetail.tsx) 的內容與版面。
// 所有資料一律由 DB 取得（server truth），避免與頁面顯示不一致。

const ORANGE = "#ff6a00";
const TZ = "Asia/Taipei";

const STATUS_LABELS: Record<string, string> = {
  pending: "待確認",
  confirmed: "已確認",
  on_hold: "保留中",
  checked_in: "入住中",
  checked_out: "已完成",
  cancelled: "已取消",
};

const BANK_NAMES: Record<string, string> = { "822": "中國信託商業銀行" };

export const esc = (s: unknown): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const nf = (n: number) => Math.round(n).toLocaleString("en-US");

/** 以台北時區解析純日期字串為 Date（避免時區位移） */
const parseDate = (v: string) => new Date(`${String(v).slice(0, 10)}T00:00:00+08:00`);

const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("zh-TW", { timeZone: TZ, ...opts }).format(d);

const dateCN = (d: Date) => fmt(d, { year: "numeric", month: "long", day: "numeric" });
const dateShortCN = (d: Date) => fmt(d, { month: "long", day: "numeric", weekday: "short" });
const dateLongCN = (d: Date) => fmt(d, { year: "numeric", month: "long", day: "numeric", weekday: "long" });
const dateTimeCN = (d: Date) =>
  `${fmt(d, { year: "numeric", month: "long", day: "numeric" })} ${fmt(d, { hour: "2-digit", minute: "2-digit", hour12: false })}`;

const daysBetween = (a: Date, b: Date) =>
  Math.round((a.getTime() - b.getTime()) / 86400000);

export const maskEmail = (email?: string | null) => {
  if (!email) return "";
  const [name, domain] = email.split("@");
  if (!domain) return email;
  return `${name.slice(0, 2)}***@${domain}`;
};

const maskPhone = (phone?: string | null) => {
  if (!phone) return "";
  const digits = String(phone).replace(/\s/g, "");
  if (digits.length < 6) return digits;
  return `${digits.slice(0, 4)}****${digits.slice(-2)}`;
};

const htmlToLines = (html?: string | null): string[] => {
  if (!html) return [];
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
};

/** 只取出客人自己填寫的特殊需求（與前台一致） */
const extractGuestNotes = (notes?: string | null): string => {
  if (!notes) return "";
  return notes
    .split("\n")
    .map((line) => {
      let s = line.trim();
      if (!s) return "";
      s = s.replace(/^\[訂金制\][\s\S]*?入住現場付清\s*/, "").trim();
      s = s.replace(/^\[TapPay[^\]]*\]\s*/, "").trim();
      if (/^\[[^\]]+\]/.test(s)) return "";
      return s;
    })
    .filter(Boolean)
    .join("\n");
};

const getAtmTransferAmount = (order: any): number => {
  const fromNotes = Number(order?.notes?.match(/訂金\s*NT\$\s*([\d,]+)/)?.[1]?.replace(/,/g, ""));
  if (fromNotes > 0) return fromNotes;
  return Math.max(0, Number(order?.final_price || 0) - Number(order?.paid_amount || 0));
};

const isAtmExpired = (order: any): boolean => {
  if (!order?.atm_vacc_no || !order?.atm_expire_at) return false;
  if (order.payment_status === "paid" || order.payment_status === "deposit_paid") return false;
  return new Date(order.atm_expire_at).getTime() <= Date.now();
};

// ---------- 小型 HTML 元件（email-safe：table + inline style） ----------

const card = (inner: string) =>
  `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e6e6e6;border-radius:14px;background:#fff;margin:0 0 12px 0;">
     <tr><td style="padding:0;">${inner}</td></tr>
   </table>`;

const block = (inner: string, extra = "") =>
  `<div style="padding:14px 16px;${extra}">${inner}</div>`;

const divider = `<div style="height:1px;background:#eee;"></div>`;

const row = (label: string, value: string, strong = false) =>
  `<table width="100%" cellpadding="0" cellspacing="0"><tr>
     <td style="font-size:14px;color:#555;padding:3px 0;">${label}</td>
     <td align="right" style="font-size:14px;padding:3px 0;${strong ? "font-weight:700;" : ""}">${value}</td>
   </tr></table>`;

const sectionTitle = (t: string) =>
  `<p style="margin:0 0 10px 0;font-size:16px;font-weight:700;color:#222;">${esc(t)}</p>`;

// ---------- 主要組裝 ----------

export interface BuiltEmail {
  subject: string;
  html: string;
  to: string;
  guestName: string;
  orderNumber: string;
  accommodationName: string;
}

export interface DateChangeNotice {
  oldCheckIn: string;
  oldCheckOut: string;
  reason?: string | null;
  operator?: string | null;
}

export async function buildOrderConfirmationEmail(
  supabase: any,
  orderNumber: string,
  opts: { siteUrl?: string; dateChange?: DateChangeNotice | null } = {},
): Promise<BuiltEmail | { error: string }> {
  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, order_number, order_status, payment_status, check_in_date, check_out_date, guest_name, guest_phone, guest_email, guest_count, total_price, discount_amount, final_price, paid_amount, deposit_required_amount, notes, atm_vacc_no, atm_vacc_bank_code, atm_expire_at, accommodation_id, room_type_id, package_id, room_types(name)",
    )
    .eq("order_number", orderNumber)
    .maybeSingle();

  if (!order) return { error: "order_not_found" };
  if (!order.guest_email) return { error: "no_email" };

  const [
    { data: acc },
    { data: settings },
    { data: accPhotos },
    { data: pkg },
    { data: facilitiesRows },
  ] = await Promise.all([
    supabase
      .from("accommodation_info")
      .select("id, name, address, phone, email, short_url_alias")
      .eq("id", order.accommodation_id)
      .maybeSingle(),
    supabase
      .from("booking_settings")
      .select(
        "check_in_time, check_out_time, cancellation_policy, check_in_section_title, check_in_section_subtitle, other_notes",
      )
      .eq("accommodation_id", order.accommodation_id)
      .maybeSingle(),
    supabase
      .from("accommodation_photos")
      .select("photo_url, display_order")
      .eq("accommodation_id", order.accommodation_id)
      .order("display_order", { ascending: true })
      .limit(1),
    order.package_id
      ? supabase
          .from("accommodation_packages")
          .select("name, subtitle, room_allocation, includes")
          .eq("id", order.package_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("accommodation_facilities")
      .select("facility_name, is_available")
      .eq("accommodation_id", order.accommodation_id)
      .is("room_scope", null)
      .order("category", { ascending: true }),
  ]);

  const accName = acc?.name || "";
  const accPhone = acc?.phone || "";
  const accEmail = acc?.email || "";
  const accAddress = acc?.address || "";
  const accPhoto = accPhotos?.[0]?.photo_url || "";
  const facilities = (facilitiesRows || [])
    .filter((f: any) => f.is_available !== false)
    .map((f: any) => f.facility_name)
    .filter(Boolean);
  const includes = Array.isArray(pkg?.includes)
    ? (pkg.includes as any[]).filter((i) => i?.text)
    : [];

  const checkIn = parseDate(order.check_in_date);
  const checkOut = parseDate(order.check_out_date);
  const nights = Math.max(1, daysBetween(checkOut, checkIn));

  const totalPrice = Number(order.total_price || 0);
  const discount = Number(order.discount_amount || 0);
  const finalPrice = Number(order.final_price || 0);
  const paid = Number(order.paid_amount || 0);
  const depositRequired = Number(order.deposit_required_amount || 0);
  const balance = Math.max(finalPrice - paid, 0);
  const points = Math.round(finalPrice * 0.04);

  const cancelled = order.order_status === "cancelled";
  const statusLabel = STATUS_LABELS[order.order_status] || order.order_status;

  const atmAmount = getAtmTransferAmount(order);
  const atmExpired = isAtmExpired(order);
  const atmExpire = order.atm_expire_at ? new Date(order.atm_expire_at) : null;
  const depositPct = order.notes?.match(/的\s*(\d+)%/)?.[1];

  const siteUrl = opts.siteUrl || "https://booking.lakeze.com";
  const orderUrl = `${siteUrl}/member/orders/${encodeURIComponent(order.order_number)}?accId=${order.accommodation_id}`;

  // 1. 訂單摘要
  const payAmount =
    order.payment_status === "paid"
      ? finalPrice
      : order.atm_vacc_no
        ? atmAmount
        : depositRequired || finalPrice;
  const payTitle =
    order.payment_status === "paid"
      ? "已付款"
      : order.atm_vacc_no
        ? atmExpired
          ? "訂金已逾期未付"
          : "待匯款訂金"
        : "已授權稍後付款";
  const payDesc =
    order.payment_status === "paid"
      ? "款項已收訖，入住當日請出示訂單編號辦理報到。"
      : order.atm_vacc_no
        ? atmExpire
          ? atmExpired
            ? `繳費期限（${dateTimeCN(atmExpire)}）已過，虛擬帳號已失效，請聯絡客服或重新訂房。`
            : `請於 ${dateTimeCN(atmExpire)} 前完成 ATM 轉帳，逾期訂單將自動取消。`
          : "請於期限內完成 ATM 轉帳，逾期訂單將自動取消。"
        : `系統將於 ${fmt(checkIn, { month: "long", day: "numeric" })}（住宿當地時間）向您綁定的信用卡收取房費，請確認卡片額度充足。`;

  const freeCancelDeadline = new Date(checkIn.getTime() - 14 * 86400000);
  const freeCancelNow = daysBetween(checkIn, new Date()) >= 14;

  const summary = `
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border:1px solid #ffedd5;border-radius:14px;margin:0 0 12px 0;">
    <tr><td style="padding:18px 16px;">
      <h1 style="margin:0;font-size:22px;font-weight:800;color:${cancelled ? "#ef4444" : ORANGE};">${esc(statusLabel)}</h1>
      ${
        !cancelled
          ? `<p style="margin:6px 0 0 0;font-size:14px;color:#666;line-height:1.6;">您已準備就緒！我們已寄發您的訂單確認函至 ${esc(maskEmail(order.guest_email))}。</p>`
          : ""
      }
      <p style="margin:10px 0 0 0;font-size:13px;color:#666;">訂單編號 <span style="font-weight:700;color:#222;">${esc(order.order_number)}</span></p>
      ${
        !cancelled
          ? `
      <div style="border-top:1px solid #ffedd5;margin-top:14px;padding-top:12px;">
        <p style="margin:0;font-size:15px;font-weight:700;color:#222;">
          ${esc(payTitle)}
          <span style="font-size:19px;font-weight:800;color:${atmExpired ? "#ef4444" : ORANGE};">NT$ ${nf(payAmount)}</span>
        </p>
        <p style="margin:6px 0 0 0;font-size:14px;color:#666;line-height:1.6;">${esc(payDesc)}</p>
      </div>
      <div style="border-top:1px solid #ffedd5;margin-top:14px;padding-top:12px;">
        <p style="margin:0;font-size:15px;font-weight:700;color:#222;">${freeCancelNow ? "現在可以免費取消" : "取消將依政策收取費用"}</p>
        <p style="margin:6px 0 0 0;font-size:14px;color:#666;line-height:1.6;">於 ${dateCN(freeCancelDeadline)} 23:59 前（住宿當地時間）可免費取消。此後，將依取消政策收取費用。</p>
      </div>`
          : ""
      }
    </td></tr>
  </table>`;

  // 2. 住宿卡（日期 / 房間搭配 / 尊榮禮遇 / 費用明細 / 取消政策）
  const policyLines = htmlToLines(settings?.cancellation_policy);
  const stayCard = card(`
    <div style="padding:12px 16px;background:#fff7ed;border-bottom:1px solid #eee;text-align:center;">
      <p style="margin:0;font-size:17px;font-weight:800;letter-spacing:1px;color:${ORANGE};">${esc(accName)}</p>
    </div>
    ${block(`
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:top;">
          <p style="margin:0;font-size:12px;color:#888;">入住</p>
          <p style="margin:3px 0 0 0;font-size:15px;font-weight:700;">${dateShortCN(checkIn)}</p>
        </td>
        <td align="center" style="font-size:12px;color:#888;width:70px;">— ${nights} 晚 —</td>
        <td align="right" style="vertical-align:top;">
          <p style="margin:0;font-size:12px;color:#888;">退房</p>
          <p style="margin:3px 0 0 0;font-size:15px;font-weight:700;">${dateShortCN(checkOut)}</p>
        </td>
      </tr></table>`)}
    ${divider}
    ${block(`
      <p style="margin:0;font-size:10px;font-weight:700;letter-spacing:2px;color:#aaa;">ROOM ALLOCATION</p>
      <p style="margin:5px 0 0 0;font-size:14px;font-weight:700;">${esc(
        pkg?.room_allocation
          ? `房間搭配：${pkg.room_allocation}`
          : pkg?.name || order.room_types?.name || "住宿房型",
      )}</p>
      <p style="margin:5px 0 0 0;font-size:12px;color:#888;">${order.guest_count || 1} 位大人</p>`)}
    ${
      includes.length
        ? divider +
          block(
            `<p style="margin:0 0 8px 0;font-size:14px;font-weight:700;">${esc(pkg?.subtitle || "尊榮禮遇")}</p>` +
              includes
                .map((inc: any) => {
                  const no = inc.available === "no";
                  const optional = inc.available === "optional";
                  const mark = no ? "✕" : optional ? "＋" : "✓";
                  const color = no ? "#ef4444" : optional ? "#b45309" : ORANGE;
                  return `<p style="margin:0 0 5px 0;font-size:13px;line-height:1.6;color:${no ? "#999" : "#333"};${no ? "text-decoration:line-through;" : ""}">
                    <span style="color:${color};font-weight:700;">${mark}</span> ${esc(inc.text)}${inc.price_note ? `<span style="color:#999;">（${esc(inc.price_note)}）</span>` : ""}</p>`;
                })
                .join(""),
            "background:#fafafa;",
          )
        : ""
    }
    ${divider}
    ${block(
      `<p style="margin:0 0 8px 0;font-size:10px;font-weight:700;letter-spacing:2px;color:#aaa;">PRICE BREAKDOWN</p>` +
        row(`房費（${nights} 晚）`, `NT$ ${nf(totalPrice)}`, true) +
        (discount > 0 ? row("折扣", `<span style="color:#ef4444;">-NT$ ${nf(discount)}</span>`) : "") +
        (paid > 0 ? row("已付款", `NT$ ${nf(paid)}`) : "") +
        (balance > 0 ? row("現場應付尾款", `NT$ ${nf(balance)}`) : ""),
    )}
    ${divider}
    ${block(
      `<table width="100%" cellpadding="0" cellspacing="0"><tr>
         <td style="font-size:14px;color:#666;">總金額</td>
         <td align="right" style="font-size:19px;font-weight:800;color:${ORANGE};">NT$ ${nf(finalPrice)}</td>
       </tr></table>`,
      "background:#fafafa;",
    )}
    ${
      policyLines.length
        ? divider +
          block(
            `<p style="margin:0 0 6px 0;font-size:14px;font-weight:600;">取消政策</p>` +
              policyLines
                .map((l) => `<p style="margin:0 0 4px 0;font-size:12px;color:#777;line-height:1.7;">${esc(l)}</p>`)
                .join(""),
          )
        : ""
    }`);

  // 3. ATM 虛擬帳號卡片
  const atmCard = order.atm_vacc_no
    ? card(
        block(`
        <p style="margin:0 0 10px 0;font-size:15px;font-weight:700;">ATM 虛擬帳號</p>
        ${
          atmExpire
            ? `<div style="border:1px solid #ffd0a8;background:#fff6ee;border-radius:10px;padding:10px 12px;margin-bottom:10px;">
                 <p style="margin:0;font-size:13px;font-weight:600;">${atmExpired ? "繳費期限已到期" : "繳費期限"}</p>
                 <p style="margin:4px 0 0 0;font-size:15px;font-weight:800;color:${atmExpired ? "#ef4444" : ORANGE};">${dateTimeCN(atmExpire)}</p>
                 <p style="margin:4px 0 0 0;font-size:12px;color:${ORANGE};">逾期未繳款訂單將自動取消。</p>
               </div>`
            : ""
        }
        <p style="margin:0 0 8px 0;font-size:12px;color:#888;">請於繳費期限前以 ATM、網路銀行或臨櫃匯款。</p>
        ${row(`銀行代碼${BANK_NAMES[order.atm_vacc_bank_code || ""] ? `（${BANK_NAMES[order.atm_vacc_bank_code]}）` : ""}`, `<span style="font-weight:700;">${esc(order.atm_vacc_bank_code || "—")}</span>`)}
        ${row("虛擬帳號", `<span style="font-weight:700;letter-spacing:1px;">${esc(order.atm_vacc_no)}</span>`)}
        ${row(`轉帳金額${depositPct ? `（訂金 ${depositPct}%）` : ""}`, `<span style="font-weight:800;color:${ORANGE};">NT$ ${nf(atmAmount)}</span>`)}
        <p style="margin:10px 0 0 0;font-size:12px;color:#888;">系統收到入帳通知後將自動更新訂單狀態，無需另行通知。</p>`),
      )
    : "";

  // 4. 住宿詳情
  const otherNoteLines = htmlToLines(settings?.other_notes);
  const guestNotes = extractGuestNotes(order.notes);
  const stayDetail = card(
    block(`
      ${sectionTitle("住宿詳情")}
      ${
        accPhoto
          ? `<img src="${esc(accPhoto)}" alt="${esc(accName)}" width="100%" style="max-width:552px;border-radius:10px;display:block;margin:0 0 12px 0;" />`
          : ""
      }
      <p style="margin:0;font-size:15px;font-weight:700;">${esc(accName)}</p>
      ${accPhone ? `<p style="margin:6px 0 0 0;font-size:13px;color:#666;">電話：${esc(accPhone)}</p>` : ""}
      ${accEmail ? `<p style="margin:3px 0 0 0;font-size:13px;color:#666;">Email：${esc(accEmail)}</p>` : ""}

      <p style="margin:14px 0 0 0;font-size:14px;font-weight:600;">${dateLongCN(checkIn)} — ${fmt(checkOut, { month: "long", day: "numeric", weekday: "long" })}｜${nights} 晚</p>
      ${settings?.check_in_time ? `<p style="margin:4px 0 0 0;font-size:13px;color:#666;">入住：${esc(settings.check_in_time)} 後</p>` : ""}
      ${settings?.check_out_time ? `<p style="margin:2px 0 0 0;font-size:13px;color:#666;">退房：${esc(settings.check_out_time)} 前</p>` : ""}

      ${
        accAddress
          ? `<p style="margin:14px 0 0 0;font-size:14px;font-weight:600;">地點</p>
             <p style="margin:3px 0 0 0;font-size:13px;color:#666;">${esc(accAddress)}
               <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(accAddress)}" style="color:${ORANGE};">查看地圖</a>
             </p>`
          : ""
      }
      ${
        facilities.length
          ? `<p style="margin:14px 0 0 0;font-size:14px;font-weight:600;">住宿設施</p>
             <p style="margin:3px 0 0 0;font-size:13px;color:#666;line-height:1.8;">${esc(facilities.join("｜"))}</p>`
          : ""
      }

      <p style="margin:14px 0 0 0;font-size:14px;font-weight:600;">${esc(settings?.check_in_section_title || "如何辦理入住")}</p>
      <div style="margin:3px 0 0 0;font-size:13px;color:#666;line-height:1.8;">
        ${settings?.check_in_section_subtitle ? `<p style="margin:0;">${esc(settings.check_in_section_subtitle)}</p>` : ""}
        ${settings?.check_in_time ? `<p style="margin:0;">入住時間：${esc(settings.check_in_time)} 後</p>` : ""}
        ${settings?.check_out_time ? `<p style="margin:0;">退房時間：${esc(settings.check_out_time)} 前</p>` : ""}
        ${otherNoteLines.map((l) => `<p style="margin:0;">${esc(l)}</p>`).join("")}
        ${accPhone ? `<p style="margin:0;">抵達前請先致電住宿 ${esc(accPhone)} 聯繫辦理入住。</p>` : ""}
      </div>

      ${
        guestNotes
          ? `<p style="margin:14px 0 0 0;font-size:14px;font-weight:600;">您的特殊需求</p>
             <p style="margin:3px 0 0 0;font-size:13px;color:#666;line-height:1.8;white-space:pre-line;">${esc(guestNotes)}</p>`
          : ""
      }`),
  );

  // 5. 旅客資訊 + 紅利
  const guestCard = card(
    block(`
      ${sectionTitle("旅客資訊")}
      ${row("姓名", esc(order.guest_name))}
      ${row("電話", esc(maskPhone(order.guest_phone)))}
      ${order.guest_email ? row("Email", esc(maskEmail(order.guest_email))) : ""}`),
  );

  const pointsCard = !cancelled
    ? card(
        block(`
      ${sectionTitle("紅利")}
      <p style="margin:0;font-size:14px;color:${ORANGE};">本筆訂單可獲得 ${nf(points)} 點紅利</p>`),
      )
    : "";

  // 0. 改期通知橫幅（僅在改期重寄時顯示）
  const dc = opts.dateChange;
  const changeBanner = dc
    ? `
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border:2px solid #ef4444;border-radius:14px;margin:0 0 12px 0;">
    <tr><td style="padding:16px;">
      <p style="margin:0;font-size:17px;font-weight:800;color:#b91c1c;">🔄 您的入住日期已更改</p>
      <p style="margin:8px 0 0 0;font-size:14px;color:#7f1d1d;line-height:1.7;">本封為更新後的訂單確認函，請以下列新日期為準：</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;background:#fff;border-radius:10px;">
        <tr>
          <td style="padding:10px 12px;font-size:13px;color:#888;">原訂日期</td>
          <td align="right" style="padding:10px 12px;font-size:14px;color:#888;text-decoration:line-through;">${esc(dc.oldCheckIn)} → ${esc(dc.oldCheckOut)}</td>
        </tr>
        <tr>
          <td style="padding:10px 12px;font-size:13px;color:#b91c1c;font-weight:700;border-top:1px solid #fee2e2;">更改後日期</td>
          <td align="right" style="padding:10px 12px;font-size:15px;font-weight:800;color:#b91c1c;border-top:1px solid #fee2e2;">${esc(order.check_in_date)} → ${esc(order.check_out_date)}</td>
        </tr>
      </table>
      ${dc.reason ? `<p style="margin:10px 0 0 0;font-size:13px;color:#7f1d1d;">更改原因：${esc(dc.reason)}</p>` : ""}
      <p style="margin:10px 0 0 0;font-size:13px;color:#7f1d1d;">如有任何疑問，請儘速與住宿聯繫。</p>
    </td></tr>
  </table>`
    : "";

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f5f5f5;">
  <div style="display:none;max-height:0;overflow:hidden;">訂單 ${esc(order.order_number)}｜${esc(accName)}｜${dateShortCN(checkIn)} 起 ${nights} 晚</div>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:16px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;font-family:'Microsoft JhengHei','PingFang TC',Arial,sans-serif;color:#222;">
        <tr><td style="padding:0 12px;">
          <p style="margin:0 0 12px 0;text-align:center;font-size:13px;color:#888;">訂單編號 ${esc(order.order_number)}</p>
          ${changeBanner}
          ${summary}
          ${stayCard}
          ${atmCard}
          ${stayDetail}
          ${guestCard}
          ${pointsCard}
          <p style="text-align:center;margin:18px 0;">
            <a href="${esc(orderUrl)}" style="display:inline-block;background:${ORANGE};color:#fff;text-decoration:none;padding:12px 26px;border-radius:999px;font-size:14px;font-weight:700;">查看線上訂單詳情</a>
          </p>
          <p style="text-align:center;font-size:12px;color:#999;line-height:1.8;margin:0 0 24px 0;">
            此信件由系統自動發送，請勿直接回覆。<br/>
            如需協助請聯絡 ${esc(accName)}${accPhone ? `：${esc(accPhone)}` : ""}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return {
    subject: `${accName ? `【${accName}】` : ""}${dc ? "【入住日期已更改】" : ""}訂房確認通知 - 訂單編號 ${order.order_number}`,
    html,
    to: order.guest_email,
    guestName: order.guest_name,
    orderNumber: order.order_number,
    accommodationName: accName,
  };
}
