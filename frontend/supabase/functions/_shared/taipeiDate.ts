// 動態產生「今天日期 + 未來 14 天星期對照表」（Asia/Taipei）
// 供各 AI 管家 edge function 於每次請求時注入 system prompt，避免 LLM 自行推算星期。

const TZ = "Asia/Taipei";
const WEEKDAY = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

function taipeiParts(d: Date) {
  const fmt = new Intl.DateTimeFormat("zh-TW", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(d).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  // 用 UTC 中午對應的台北日期算 weekday index，避免時區偏移
  const idx = new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
  return {
    year,
    month,
    day,
    iso: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAY[idx],
    label: `${year}年${month}月${day}日（${WEEKDAY[idx]}）`,
  };
}

/** 台北時區的今天日期 YYYY-MM-DD */
export function taipeiToday(now: Date = new Date()): string {
  return taipeiParts(now).iso;
}

/** 動態日期區塊：今天日期＋未來 14 天星期對照表＋查表規則 */
export function buildDateBlock(now: Date = new Date()): string {
  const today = taipeiParts(now);
  const rows: string[] = [];
  for (let i = 0; i <= 14; i++) {
    const d = new Date(now.getTime() + i * 86400000);
    const p = taipeiParts(d);
    rows.push(`- ${p.iso}　${p.label}${i === 0 ? "　←今天" : ""}`);
  }
  return `\n\n## 今日日期與星期對照（系統即時產生，台北時間，最高可信度）
今天是 ${today.label}（${today.iso}）。

### 未來 14 天日期↔星期對照表
${rows.join("\n")}

### 日期規則（不可違反）
(a) 提到任何日期時，星期幾一律查上表，禁止自行推算或依記憶回答。
(b)「這週末」＝ 對照表中最近的週六與週日（一般為週六入住、週日退房）。
(c) 客人只講月日（如 8/8）一律視為今年（${today.year} 年）的日期。
(d) 超出對照表範圍的日期不要標註星期，只覆述日期本身。\n`;
}
