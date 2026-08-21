// 團購方案複製命名：確保多次複製不會產生「（複製）（複製）」這種難辨識名稱。

const COPY_SUFFIX = /（複製(?:\s*(\d+))?）\s*$/;

/** 去掉既有的「（複製）／（複製 N）」尾綴，取回原始名稱 */
export function baseCopyName(name: string): string {
  return String(name ?? "").replace(COPY_SUFFIX, "").trim();
}

/**
 * 依現有名稱清單產生下一個副本名稱：
 *   原方案 → 原方案（複製） → 原方案（複製 2） → 原方案（複製 3）...
 */
export function nextCopyName(sourceName: string, existingNames: string[]): string {
  const base = baseCopyName(sourceName) || String(sourceName ?? "").trim();
  const taken = new Set(existingNames.map((n) => String(n ?? "").trim()));
  const first = `${base}（複製）`;
  if (!taken.has(first)) return first;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}（複製 ${i}）`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}（複製 ${Date.now()}）`;
}
