import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const accommodationId = url.searchParams.get('accommodation_id') ||
      (req.method === 'POST' ? (await req.json().catch(() => ({}))).accommodation_id : null);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    let accommodationName = '';
    let accommodationPhone = '';
    let accommodationEmail = '';
    let accommodationLineId = '';
    let accommodationImportantNotice = '';
    let accommodationServiceHours = '';
    if (accommodationId) {
      const { data: acc } = await supabase
        .from('accommodation_info')
        .select('name, phone, email, line_id, email_important_notice, email_service_hours')
        .eq('id', accommodationId)
        .single();
      accommodationName = acc?.name || '';
      accommodationPhone = acc?.phone || '';
      accommodationEmail = acc?.email || '';
      accommodationLineId = acc?.line_id || '';
      accommodationImportantNotice = (acc as any)?.email_important_notice || '';
      accommodationServiceHours = (acc as any)?.email_service_hours || '';
    }

    // Sample data
    const guestName = '王小明';
    const orderNumber = 'PREVIEW01';
    const roomName = '景觀雙人房';
    const checkInDate = '2026-07-15';
    const checkOutDate = '2026-07-17';
    const guestCount = 2;
    const mealPlanText = '一泊二食';
    const paymentMethod = '線上刷卡';
    const finalPrice = 12800;
    const paidAmount = 6400;
    const petCount = 1;
    const petPlanPrice = 500;
    const mealPlanDetails = [
      { date: '2026-07-15', count: 2, price: 1600 },
      { date: '2026-07-16', count: 2, price: 1600 },
    ];
    const mealPlanTotal = 3200;
    const outstanding = Math.max(0, finalPrice - paidAmount);

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Microsoft JhengHei', Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #f97316; background: linear-gradient(135deg, #f97316 0%, #fb923c 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; word-break: break-word; }
    .content { background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; }
    .price-highlight { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .total-price { font-size: 24px; color: #f97316; font-weight: bold; }
    .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; border-radius: 0 0 10px 10px; }
    .notice { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 28px;">訂房確認通知</h1>
      ${accommodationName ? `<p style="margin: 12px 0 0 0; font-size: 18px; font-weight: 600; opacity: 0.95;">${accommodationName}</p>` : ''}
      <p style="margin: 10px 0 0 0; opacity: 0.9;">感謝您的訂購！</p>
    </div>
    <div class="content">
      <p style="font-size: 16px; margin-bottom: 20px;">親愛的 ${guestName} 您好，</p>
      <p>我們已收到您的訂房申請，以下是您的訂單詳情：</p>
      <div style="margin: 30px 0;">
        <table style="width: 100%; border-collapse: collapse;">
          ${accommodationName ? `
          <tr style="border-bottom: 1px solid #f0f0f0;">
            <td style="color: #666; font-weight: 500; padding: 12px 0; width: 35%; white-space: nowrap;">住宿</td>
            <td style="color: #f97316; font-weight: 700; padding: 12px 0; text-align: right; word-break: break-word;">${accommodationName}</td>
          </tr>` : ''}
          <tr style="border-bottom: 1px solid #f0f0f0;"><td style="color: #666; padding: 12px 0; width: 35%;">訂單編號</td><td style="color: #333; font-weight: 600; padding: 12px 0; text-align: right;">${orderNumber}</td></tr>
          <tr style="border-bottom: 1px solid #f0f0f0;"><td style="color: #666; padding: 12px 0;">房型</td><td style="color: #333; font-weight: 600; padding: 12px 0; text-align: right;">${roomName}</td></tr>
          <tr style="border-bottom: 1px solid #f0f0f0;"><td style="color: #666; padding: 12px 0;">入住日期</td><td style="color: #333; font-weight: 600; padding: 12px 0; text-align: right;">${checkInDate}</td></tr>
          <tr style="border-bottom: 1px solid #f0f0f0;"><td style="color: #666; padding: 12px 0;">退房日期</td><td style="color: #333; font-weight: 600; padding: 12px 0; text-align: right;">${checkOutDate}</td></tr>
          <tr style="border-bottom: 1px solid #f0f0f0;"><td style="color: #666; padding: 12px 0;">入住人數</td><td style="color: #333; font-weight: 600; padding: 12px 0; text-align: right;">${guestCount} 人</td></tr>
          <tr style="border-bottom: 1px solid #f0f0f0;"><td style="color: #666; padding: 12px 0;">餐食方案</td><td style="color: #333; font-weight: 600; padding: 12px 0; text-align: right;">${mealPlanText}</td></tr>
          <tr style="border-bottom: 1px solid #f0f0f0;"><td style="color: #666; padding: 12px 0;">付款方式</td><td style="color: #333; font-weight: 600; padding: 12px 0; text-align: right;">${paymentMethod}</td></tr>
        </table>
      </div>
      <div style="margin: 30px 0; background: #f8f9fa; padding: 20px; border-radius: 8px;">
        <h3 style="margin: 0 0 15px 0; color: #333; font-size: 18px;">📦 加購方案</h3>
        <div style="border-bottom: 1px solid #e0e0e0; padding-bottom: 12px; margin-bottom: 12px;">
          <table style="width:100%"><tr><td>🐾 寵物方案 ×${petCount}</td><td style="text-align:right; font-weight:600;">NT$ ${petPlanPrice.toLocaleString()}</td></tr></table>
        </div>
        <div>
          <div style="color: #333; font-size: 16px; margin-bottom: 8px;">🍖 餐食方案</div>
          ${mealPlanDetails.map(d => `<div style="padding-left:20px;"><table style="width:100%"><tr><td style="color:#666;font-size:14px;">${d.date} - ${d.count} 人</td><td style="text-align:right;color:#666;font-size:14px;">NT$ ${d.price.toLocaleString()}</td></tr></table></div>`).join('')}
          <div style="border-top:1px solid #e0e0e0;padding-top:8px;margin-top:8px;"><table style="width:100%"><tr><td style="font-weight:600;">餐食方案小計</td><td style="text-align:right;font-weight:600;">NT$ ${mealPlanTotal.toLocaleString()}</td></tr></table></div>
        </div>
      </div>
      <div class="price-highlight">
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="font-size: 18px; font-weight: 600; padding-bottom: 15px;">總金額</td><td style="text-align: right; padding-bottom: 15px;"><span class="total-price">NT$ ${finalPrice.toLocaleString()}</span></td></tr>
          <tr><td style="font-size: 15px; color: #666; padding: 6px 0; border-top: 1px dashed #d0d0d0;">已付金額</td><td style="text-align: right; padding: 6px 0; border-top: 1px dashed #d0d0d0; color: #f97316; font-weight: 700; font-size: 16px;">NT$ ${paidAmount.toLocaleString()}</td></tr>
          
        </table>
      </div>
      <div class="notice">
        <strong style="color: #856404;">⚠️ 重要提醒</strong>
        <ul style="margin: 10px 0 0 0; padding-left: 20px; color: #856404;">
          <li>請於入住日前確認訂單狀態</li>
          <li>如需取消或變更訂單，請盡早與我們聯繫</li>
          <li>入住時請攜帶有效身份證件</li>
        </ul>
      </div>
      <div style="margin-top: 30px; padding: 25px; background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%); border-radius: 12px; border: 2px solid #f97316; text-align: center;">
        <p style="margin: 0 0 12px 0; font-size: 18px; font-weight: 700; color: #f97316;">📋 查詢訂單資訊</p>
        <p style="margin: 0 0 20px 0; color: #666; font-size: 14px;">您可以隨時透過以下連結查詢您的訂單狀態、付款記錄及住宿詳情</p>
        <a href="https://booking.lakeze.com/member/orders" style="display: inline-block; padding: 14px 40px; background: linear-gradient(135deg, #f97316 0%, #fb923c 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">🔍 立即查詢訂單</a>
      </div>
      ${(accommodationPhone || accommodationLineId || accommodationEmail) ? `
      <div style="margin-top: 30px; padding: 20px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #f97316;">
        <p style="margin: 0 0 15px 0; font-weight: 600; color: #333;">如有任何疑問，歡迎透過下列方式與${accommodationName ? ` ${accommodationName} ` : '我們'}聯繫：</p>
        <div style="color: #666; line-height: 1.8;">
          ${accommodationPhone ? `<p style="margin: 8px 0;">📞 聯絡電話：<a href="tel:${accommodationPhone.replace(/[^+\d]/g, '')}" style="color: #f97316; text-decoration: none;">${accommodationPhone}</a></p>` : ''}
          ${accommodationLineId ? `<p style="margin: 8px 0;">💬 LINE 官方帳號：<a href="https://line.me/R/ti/p/${accommodationLineId}" style="color: #f97316; text-decoration: none;">${accommodationLineId}</a></p>` : ''}
          ${accommodationEmail ? `<p style="margin: 8px 0;">📧 電子郵件：<a href="mailto:${accommodationEmail}" style="color: #f97316; text-decoration: none;">${accommodationEmail}</a></p>` : ''}
        </div>
      </div>` : `
      <div style="margin-top: 30px; padding: 16px; background: #fef3c7; border-radius: 8px; color: #92400e; font-size: 14px;">
        ⚠️ 此民宿尚未在 accommodation_info 設定 phone / email / line_id，正式信件不會出現聯絡區塊。
      </div>`}
      <p style="margin-top: 20px; font-size: 16px; font-weight: 500; color: #f97316;">期待您的光臨！</p>
    </div>
    <div class="footer">
      <p style="margin: 0; font-size: 14px;">此為系統自動發送的郵件，請勿直接回覆</p>
      <p style="margin: 10px 0 0 0; font-size: 12px; color: #999;">© 2026 人客多. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;

    return new Response(html, {
      headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    return new Response(`Preview error: ${(err as Error).message}`, {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "text/plain" },
    });
  }
});
