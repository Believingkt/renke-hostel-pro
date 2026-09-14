// 對外 API 通用流量限制（記憶體視窗計數，per API key）
// 實作沿用 kol-api/index.ts 既有作法（固定視窗 Map 計數 + X-RateLimit-* 標頭），
// 抽成共用模組供 accommodation-api 使用。kol-api 本批不改動，日後另行收斂。

export interface RateLimitConfig {
  /** 視窗內允許的最大次數 */
  max: number;
  /** 視窗長度（毫秒） */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

export const HOUR_MS = 60 * 60 * 1000;

/** accommodation-api 預設額度：GET 查詢每小時 300 次，寫入方法每小時 60 次 */
export const ACCOMMODATION_API_READ_LIMIT: RateLimitConfig = { max: 300, windowMs: HOUR_MS };
export const ACCOMMODATION_API_WRITE_LIMIT: RateLimitConfig = { max: 60, windowMs: HOUR_MS };

const buckets = new Map<string, { count: number; resetAt: number }>();

/**
 * 消耗一次額度。bucketKey 建議用「識別碼 + 用途」組成，例如 `${keyHash}:read`。
 */
export function consumeRateLimit(
  bucketKey: string,
  config: RateLimitConfig,
  now: number = Date.now(),
): RateLimitResult {
  const existing = buckets.get(bucketKey);

  if (!existing || now > existing.resetAt) {
    const resetAt = now + config.windowMs;
    buckets.set(bucketKey, { count: 1, resetAt });
    return { allowed: true, limit: config.max, remaining: config.max - 1, resetAt };
  }

  if (existing.count >= config.max) {
    return { allowed: false, limit: config.max, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count++;
  return {
    allowed: true,
    limit: config.max,
    remaining: config.max - existing.count,
    resetAt: existing.resetAt,
  };
}

/** 產生標準 X-RateLimit-* 回應標頭（格式與 kol-api 一致） */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": result.limit.toString(),
    "X-RateLimit-Remaining": result.remaining.toString(),
    "X-RateLimit-Reset": new Date(result.resetAt).toISOString(),
  };
}

/** 測試輔助：清空所有計數 */
export function __resetRateLimitBuckets() {
  buckets.clear();
}
