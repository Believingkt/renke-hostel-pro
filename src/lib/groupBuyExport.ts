// 團購銷售分析匯出：Excel / PDF / 列印
// 全部只吃 buildAnalyticsRows() 產出的同一份 resolved dataset，禁止重新計算分潤。

import type { GroupBuyAnalyticsRow, GroupBuyAnalyticsSummary } from "@/lib/groupBuyAnalytics";
import { ORDER_STATUS_TEXT, commissionCellText } from "@/lib/groupBuyAnalytics";
import { DEPOSIT_STATE_LABEL, REFUND_STATE_LABEL } from "@/lib/groupBuyPayment";

export interface ExportMeta {
  campaignTitle: string;
  kolName: string;
  salePeriod: string;
  stayPeriod: string;
  currentRate: number;
  filterLabel: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

export const todayStamp = () => {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
};

export const nowText = () => {
  const d = new Date();
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const safeFileName = (s: string) =>
  (s || "團購活動").replace(/[\\/:*?"<>|\n\r\t]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 60);

const ymd = (v: string | null | undefined) => (v ? String(v).slice(0, 10).replace(/-/g, "/") : "");

const download = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/* ------------------------------- Excel ------------------------------- */

export async function exportAnalyticsExcel(
  rows: GroupBuyAnalyticsRow[],
  summary: GroupBuyAnalyticsSummary,
  meta: ExportMeta,
) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  const money = '"NT$"#,##0';
  const titleFont = { bold: true, size: 14, name: "Arial" };
  const headFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } } as const;

  // ---- Sheet 1: 銷售摘要 ----
  const s1 = wb.addWorksheet("銷售摘要");
  s1.columns = [{ width: 24 }, { width: 34 }];
  s1.addRow(["團購銷售分析"]).font = titleFont;
  s1.addRow([]);
  const info: [string, string | number][] = [
    ["活動名稱", meta.campaignTitle],
    ["合作網紅", meta.kolName || "—"],
    ["活動販售期間", meta.salePeriod],
    ["可入住期間", meta.stayPeriod],
    ["匯出時間", nowText()],
    ["資料範圍", meta.filterLabel],
  ];
  info.forEach(([k, v]) => {
    const r = s1.addRow([k, v]);
    r.getCell(1).font = { bold: true };
  });
  s1.addRow([]);
  const secRow = s1.addRow(["銷售摘要"]);
  secRow.font = { bold: true, size: 12 };
  const stats: [string, number | string, string?][] = [
    ["有效訂單", summary.validOrders],
    ["待匯款", summary.pendingTransfer],
    ["待核對", summary.awaitingCheck],
    ["取消訂單", summary.cancelledOrders],
    ["有效訂單總額", summary.validRevenue, money],
    ["已收訂金", summary.collected, money],
    ["網紅分潤總額", summary.commissionTotal, money],
    ["符合分潤訂單數", summary.commissionOrders],
    ["目前新訂單分潤比例", Number(meta.currentRate) / 100, "0.0%"],
  ];
  stats.forEach(([k, v, fmt]) => {
    const r = s1.addRow([k, v]);
    r.getCell(1).font = { bold: true };
    if (fmt) r.getCell(2).numFmt = fmt;
    r.getCell(2).alignment = { horizontal: "right" };
  });

  // ---- Sheet 2: 訂單明細 ----
  const s2 = wb.addWorksheet("訂單明細");
  const headers = [
    "訂單編號",
    "下單日期",
    "旅客姓名",
    "電話",
    "入住日期",
    "退房日期",
    "方案",
    "訂單總額",
    "已收金額",
    "應付訂金",
    "訂單狀態",
    "付款狀態",
    "退款狀態",
    "已退款金額",
    "分潤狀態",
    "分潤比例",
    "分潤基準",
    "網紅分潤金額",
  ];
  s2.columns = headers.map((h, i) => ({
    header: h,
    key: `c${i}`,
    width: [16, 12, 14, 14, 12, 12, 22, 13, 13, 13, 12, 12, 14, 13, 20, 10, 13, 14][i],
  }));
  const head = s2.getRow(1);
  head.font = { bold: true };
  head.alignment = { vertical: "middle", horizontal: "center" };
  head.eachCell((c) => {
    c.fill = headFill as never;
  });
  s2.views = [{ state: "frozen", ySplit: 1 }];

  rows.forEach((r) => {
    const cell = commissionCellText(r);
    const statusText =
      r.state === "special_included"
        ? "特例退款・列入分潤"
        : r.state === "special_excluded"
          ? "特例退款・不列入分潤"
          : r.stateLabel;
    const row = s2.addRow([
      r.order.order_number,
      ymd(r.order.order_date),
      r.order.guest_name,
      r.order.guest_phone,
      ymd(r.order.check_in_date),
      ymd(r.order.check_out_date),
      r.packageName,
      Math.round(Number(r.order.final_price) || 0),
      Math.round(Number(r.order.paid_amount) || 0),
      Math.round(Number(r.order.deposit_amount) || 0),
      ORDER_STATUS_TEXT(r.order),
      DEPOSIT_STATE_LABEL[r.deposit],
      REFUND_STATE_LABEL[r.refund],
      Math.round(Number(r.order.refunded_amount) || 0),
      statusText,
      r.commissionRate != null && cell.rate !== "—" ? Number(r.commissionRate) / 100 : null,
      r.revenueBase,
      r.commissionAmount,
    ]);
    [8, 9, 10, 14, 17, 18].forEach((i) => {
      row.getCell(i).numFmt = money;
      row.getCell(i).alignment = { horizontal: "right" };
    });
    row.getCell(16).numFmt = "0.0%";
    row.getCell(16).alignment = { horizontal: "right" };
  });

  // 合計列
  const totalRow = s2.addRow([
    "合計",
    "", "", "", "", "", "",
    rows.reduce((s, r) => s + (Number(r.order.final_price) || 0), 0),
    rows.reduce((s, r) => s + (Number(r.order.paid_amount) || 0), 0),
    "", "", "", "", "", "", "", "",
    rows.reduce((s, r) => s + r.commissionAmount, 0),
  ]);
  totalRow.font = { bold: true };
  [8, 9, 18].forEach((i) => {
    totalRow.getCell(i).numFmt = money;
    totalRow.getCell(i).alignment = { horizontal: "right" };
  });

  s2.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };

  const buf = await wb.xlsx.writeBuffer();
  download(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `團購銷售分析_${safeFileName(meta.campaignTitle)}_${todayStamp()}.xlsx`,
  );
}

/* -------------------------------- PDF -------------------------------- */

const PDF_ROWS_PER_PAGE = 16;

function pdfPageHtml(
  meta: ExportMeta,
  summary: GroupBuyAnalyticsSummary,
  chunk: GroupBuyAnalyticsRow[],
  pageIndex: number,
  pageCount: number,
  withHeader: boolean,
) {
  const money = (n: number) => `NT$${Math.round(n || 0).toLocaleString("en-US")}`;
  const headBlock = withHeader
    ? `
    <div style="border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:10px">
      <div style="font-size:20px;font-weight:700">團購銷售分析</div>
      <div style="font-size:13px;margin-top:4px">${meta.campaignTitle}</div>
      <div style="font-size:11px;color:#555;margin-top:2px">
        合作網紅：${meta.kolName || "—"}　販售期間：${meta.salePeriod}　可入住期間：${meta.stayPeriod}
      </div>
      <div style="font-size:11px;color:#555">產生日期：${nowText()}　資料範圍：${meta.filterLabel}</div>
    </div>
    <div style="display:flex;gap:10px;margin-bottom:10px">
      ${[
        ["有效訂單", `${summary.validOrders} 筆`],
        ["已收訂金", money(summary.collected)],
        ["有效訂單總額", money(summary.validRevenue)],
        ["網紅分潤總額", money(summary.commissionTotal)],
        ["符合分潤訂單", `${summary.commissionOrders} 筆`],
      ]
        .map(
          ([k, v]) =>
            `<div style="flex:1;border:1px solid #ddd;border-radius:6px;padding:6px 8px">
               <div style="font-size:10px;color:#666">${k}</div>
               <div style="font-size:14px;font-weight:700;margin-top:2px">${v}</div>
             </div>`,
        )
        .join("")}
    </div>`
    : "";

  const body = chunk
    .map((r) => {
      const c = commissionCellText(r);
      return `<tr>
        <td>${r.order.order_number}</td>
        <td>${ymd(r.order.check_in_date)}</td>
        <td>${r.packageName}</td>
        <td style="text-align:right">${money(Number(r.order.final_price) || 0)}</td>
        <td style="text-align:right">${c.rate}</td>
        <td style="text-align:right">${c.amount}</td>
        <td>${r.stateLabel}</td>
      </tr>`;
    })
    .join("");

  return `
  <div style="width:1080px;min-height:740px;padding:28px 32px;box-sizing:border-box;background:#fff;
              font-family:'Noto Sans TC','PingFang TC','Microsoft JhengHei',system-ui,sans-serif;color:#111;
              display:flex;flex-direction:column">
    ${headBlock}
    <div style="font-size:13px;font-weight:700;margin-bottom:6px">分潤明細</div>
    <table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead>
        <tr style="background:#f3f4f6">
          ${["訂單編號", "入住日期", "方案", "訂單總額", "分潤比例", "分潤金額", "分潤狀態"]
            .map(
              (h, i) =>
                `<th style="border:1px solid #ddd;padding:5px 6px;text-align:${i >= 3 && i <= 5 ? "right" : "left"}">${h}</th>`,
            )
            .join("")}
        </tr>
      </thead>
      <tbody>
        ${body || `<tr><td colspan="7" style="border:1px solid #ddd;padding:14px;text-align:center;color:#666">無資料</td></tr>`}
      </tbody>
    </table>
    <div style="margin-top:auto;padding-top:10px;font-size:10px;color:#666;display:flex;justify-content:space-between">
      <span>${meta.campaignTitle}・團購銷售分析</span>
      <span>第 ${pageIndex + 1} / ${pageCount} 頁</span>
    </div>
  </div>`.replace(
    /<td>/g,
    '<td style="border:1px solid #eee;padding:5px 6px">',
  );
}

export async function exportAnalyticsPdf(
  rows: GroupBuyAnalyticsRow[],
  summary: GroupBuyAnalyticsSummary,
  meta: ExportMeta,
) {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);

  const chunks: GroupBuyAnalyticsRow[][] = [];
  for (let i = 0; i < rows.length; i += PDF_ROWS_PER_PAGE) {
    chunks.push(rows.slice(i, i + PDF_ROWS_PER_PAGE));
  }
  if (chunks.length === 0) chunks.push([]);

  const holder = document.createElement("div");
  holder.style.cssText = "position:fixed;left:-10000px;top:0;z-index:-1;";
  document.body.appendChild(holder);

  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();

  try {
    for (let i = 0; i < chunks.length; i++) {
      holder.innerHTML = pdfPageHtml(meta, summary, chunks[i], i, chunks.length, i === 0);
      const canvas = await html2canvas(holder.firstElementChild as HTMLElement, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
      });
      const img = canvas.toDataURL("image/jpeg", 0.92);
      const ratio = Math.min(pw / (canvas.width / 4), ph / (canvas.height / 4));
      const w = (canvas.width / 4) * ratio;
      const h = (canvas.height / 4) * ratio;
      if (i > 0) pdf.addPage();
      pdf.addImage(img, "JPEG", (pw - w) / 2, (ph - h) / 2, w, h);
    }
    pdf.save(`團購銷售分析_${safeFileName(meta.campaignTitle)}_${todayStamp()}.pdf`);
  } finally {
    holder.remove();
  }
}

/* ------------------------------- 列印 ------------------------------- */

export function printAnalytics() {
  document.body.classList.add("gb-printing");
  const cleanup = () => {
    document.body.classList.remove("gb-printing");
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
  setTimeout(cleanup, 3000);
}
