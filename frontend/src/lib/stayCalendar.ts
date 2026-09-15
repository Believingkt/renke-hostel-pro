/**
 * 「加入行事曆」共用邏輯。
 *
 * - Capacitor 原生（iOS）：使用 @ebarooni/capacitor-calendar 的 write-only 授權建立事件
 * - 網頁版：產生 .ics 檔下載
 *
 * 事件規則（固定）：
 *   標題 = 入住 {民宿名稱}
 *   開始 = 入住日 15:00（當地時間）
 *   結束 = 退房日 11:00（當地時間）
 *   地點 = 民宿地址
 *   備註 = 訂單編號 + 人客多訂單連結
 *   提醒 = 入住前一天 12:00（= 開始前 1620 分鐘）
 */

import { isNativeApp } from "@/lib/appMode";

export interface StayCalendarInput {
  orderNumber: string;
  accommodationName: string;
  /** 房型名稱（純顯示用，可省略） */
  roomTypeName?: string | null;
  /** yyyy-MM-dd */
  checkInDate: string;
  /** yyyy-MM-dd */
  checkOutDate: string;
  address?: string | null;
  /** 訂單連結；未提供時使用目前頁面網址 */
  orderUrl?: string | null;
}

/** 入住前一天 12:00 距離開始（入住日 15:00）為 27 小時 */
export const STAY_ALERT_MINUTES_BEFORE = 27 * 60;

const STORAGE_KEY = "stay_calendar_event_ids_v1";

function readStore(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function getSavedCalendarEventId(orderNumber: string): string | null {
  return readStore()[orderNumber] ?? null;
}

export function saveCalendarEventId(orderNumber: string, eventId: string): void {
  try {
    const store = readStore();
    store[orderNumber] = eventId;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

function atLocalTime(dateStr: string, hour: number): Date {
  const [y, m, d] = dateStr.split("-").map((v) => Number(v));
  return new Date(y, (m || 1) - 1, d || 1, hour, 0, 0, 0);
}

export interface StayCalendarEvent {
  title: string;
  start: Date;
  end: Date;
  location: string;
  notes: string;
}

export function buildStayEvent(input: StayCalendarInput): StayCalendarEvent {
  const url =
    input.orderUrl ||
    (typeof window !== "undefined" ? window.location.href : "https://booking.lakeze.com");
  const room = input.roomTypeName?.trim();
  const title = room
    ? room.includes(input.accommodationName)
      ? `入住 ${room}`
      : `入住 ${input.accommodationName}・${room}`
    : `入住 ${input.accommodationName}`.trim();
  return {
    title,
    start: atLocalTime(input.checkInDate, 15),
    end: atLocalTime(input.checkOutDate, 11),
    location: input.address || "",
    notes: `訂單編號：${input.orderNumber}\n人客多訂單連結：${url}`,
  };
}

/* ---------------- ICS（網頁版） ---------------- */

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** 產生本地時間格式（不帶 Z），配合 ICS 的 floating time，避免時區偏移 */
function icsLocal(d: Date): string {
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `T${pad(d.getHours())}${pad(d.getMinutes())}00`
  );
}

function icsEscape(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export function buildIcs(input: StayCalendarInput): string {
  const ev = buildStayEvent(input);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lakeze//Booking//ZH",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:stay-${input.orderNumber}@lakeze.com`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${icsLocal(ev.start)}`,
    `DTEND:${icsLocal(ev.end)}`,
    `SUMMARY:${icsEscape(ev.title)}`,
    `LOCATION:${icsEscape(ev.location)}`,
    `DESCRIPTION:${icsEscape(ev.notes)}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `TRIGGER:-PT${STAY_ALERT_MINUTES_BEFORE}M`,
    `DESCRIPTION:${icsEscape(ev.title)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function downloadIcs(input: StayCalendarInput): void {
  const blob = new Blob([buildIcs(input)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `stay-${input.orderNumber}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------------- 對外入口 ---------------- */

export type AddToCalendarResult =
  | { status: "created"; eventId?: string }
  | { status: "already" }
  | { status: "downloaded" }
  | { status: "denied" }
  | { status: "error"; message: string };

export async function addStayToCalendar(
  input: StayCalendarInput,
  options: { force?: boolean } = {},
): Promise<AddToCalendarResult> {
  if (!input.checkInDate || !input.checkOutDate) {
    return { status: "error", message: "缺少入住／退房日期" };
  }

  if (!isNativeApp()) {
    downloadIcs(input);
    return { status: "downloaded" };
  }

  if (!options.force && getSavedCalendarEventId(input.orderNumber)) {
    return { status: "already" };
  }

  try {
    const { CapacitorCalendar } = await import("@ebarooni/capacitor-calendar");
    const perm = await CapacitorCalendar.requestWriteOnlyCalendarAccess();
    if (perm.result !== "granted") return { status: "denied" };

    const ev = buildStayEvent(input);
    const res = await CapacitorCalendar.createEvent({
      title: ev.title,
      startDate: ev.start.getTime(),
      endDate: ev.end.getTime(),
      location: ev.location || undefined,
      description: ev.notes,
      alerts: [-STAY_ALERT_MINUTES_BEFORE],
    });
    const eventId = (res as { id?: string })?.id;
    if (eventId) saveCalendarEventId(input.orderNumber, eventId);
    return { status: "created", eventId };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "加入行事曆失敗" };
  }
}
