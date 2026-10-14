// PMS API 金鑰管理頁的純函式（不產生、不雜湊金鑰；金鑰一律由 create-pms-api-key 伺服器端產生）。
export const READ_WRITE_CONFIRM_TOKEN = "READ_WRITE";

export interface PmsApiKeyRow {
  id: string;
  accommodation_id: string;
  name: string;
  key_prefix: string;
  is_active: boolean;
  is_read_only: boolean;
  last_used_at: string | null;
  created_at: string;
}

export function taipeiToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function canDeleteKey(key: Pick<PmsApiKeyRow, "is_active" | "name">, typedName: string): boolean {
  return !key.is_active && typedName.trim() === key.name;
}

export interface PerformanceSummary {
  bookedOrders: number;
  netRevenue: number;
  occupiedRoomNights: number;
  availableRoomNights: number;
  occupancyRate: number | null;
  checkIns: number;
}

export function summarizePerformance(json: unknown): PerformanceSummary | null {
  const s = (json as any)?.summary;
  if (!s?.booked || !s?.stay) return null;
  return {
    bookedOrders: Number(s.booked.orders ?? 0),
    netRevenue: Number(s.booked.net_revenue ?? 0),
    occupiedRoomNights: Number(s.stay.occupied_room_nights ?? 0),
    availableRoomNights: Number(s.stay.available_room_nights ?? 0),
    occupancyRate: s.stay.occupancy_rate ?? null,
    checkIns: Number(s.stay.check_ins ?? 0),
  };
}

export function formatRate(rate: number | null): string {
  return rate === null ? "—" : `${(rate * 100).toFixed(1)}%`;
}

export interface Snippet {
  id: string;
  label: string;
  code: string;
}

export function buildPmsSnippets(baseUrl: string, key: string, today: string): Snippet[] {
  const from30 = addDays(today, -29);
  const next30 = addDays(today, 29);
  return [
    {
      id: "today",
      label: "今日即時進單＋住宿（雙軸）與住房率",
      code: `curl -s '${baseUrl}/performance?from=${today}&to=${today}' \\\n  -H 'x-api-key: ${key}'`,
    },
    {
      id: "last30",
      label: "近 30 天每日進單軸／入住軸（daily 陣列可做趨勢分析）",
      code: `curl -s '${baseUrl}/performance?from=${from30}&to=${today}' \\\n  -H 'x-api-key: ${key}'`,
    },
    {
      id: "forward",
      label: "未來 30 天住房率（on-the-books）",
      code: `curl -s '${baseUrl}/performance?from=${today}&to=${next30}' \\\n  -H 'x-api-key: ${key}'`,
    },
    {
      id: "availability",
      label: "可售房量／房價",
      code: `curl -s '${baseUrl}/availability?from=${today}&to=${next30}' \\\n  -H 'x-api-key: ${key}'`,
    },
    {
      id: "fetch",
      label: "伺服器端 JavaScript（金鑰請放環境變數，勿放前端）",
      code: `const res = await fetch(\n  \`${baseUrl}/performance?from=${today}&to=${today}\`,\n  { headers: { "x-api-key": process.env.PMS_API_KEY } },\n);\nconst { summary, daily } = await res.json();\n// summary.booked：進單軸；summary.stay：入住軸（occupancy_rate＝住房率）`,
    },
  ];
}
