// TapPay getPrime wrapper with timeout + fallback signature support
// Some TapPay SDK builds/environments may not invoke the callback when using the (options, callback) signature.
// This helper:
// 1) Tries (options, callback)
// 2) Falls back to (callback)
// 3) Rejects on timeout so UI won't get stuck in "處理中".

export async function getTapPayPrime(
  appId: string,
  appKey: string,
  opts?: { timeoutMs?: number; fallbackAfterMs?: number }
): Promise<string> {
  const timeoutMs = opts?.timeoutMs ?? 15000;
  const fallbackAfterMs = opts?.fallbackAfterMs ?? 600;

  const tp = typeof window !== "undefined" ? window.TPDirect : undefined;
  if (!tp?.card?.getPrime) {
    throw new Error("TapPay SDK 尚未載入，請重新整理頁面後再試");
  }

  return await new Promise<string>((resolve, reject) => {
    let settled = false;
    let timeoutId: number | undefined;

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      fn();
    };

    const onResult = (result: any) => {
      // Defensive: some SDK variants may send undefined/null
      if (!result) {
        settle(() => reject(new Error("無法取得付款資訊（TapPay 回傳空結果）")));
        return;
      }

      if (result.status !== 0) {
        settle(() => reject(new Error(result.msg || `TapPay 授權失敗 (${result.status})`)));
        return;
      }

      const prime = result?.card?.prime;
      if (!prime || typeof prime !== "string") {
        settle(() => reject(new Error("無法取得 Prime（回傳格式不正確）")));
        return;
      }

      settle(() => resolve(prime));
    };

    timeoutId = window.setTimeout(() => {
      settle(() =>
        reject(new Error("取得付款授權逾時，請重試（若持續發生，請重新整理頁面）"))
      );
    }, timeoutMs);

    const safeCall = (fn: () => void, label: string) => {
      try {
        fn();
      } catch (e: any) {
        // If the SDK throws synchronously, fail fast.
        const msg = e?.message ? `${label} 呼叫失敗：${e.message}` : `${label} 呼叫失敗`;
        settle(() => reject(new Error(msg)));
      }
    };

    // 1) Try signature: getPrime(options, callback)
    safeCall(() => {
      (tp.card.getPrime as any)({ appId, appKey }, onResult);
    }, "getPrime(options, callback)");

    // 2) Fallback to signature: getPrime(callback)
    window.setTimeout(() => {
      if (settled) return;
      safeCall(() => {
        (tp.card.getPrime as any)(onResult);
      }, "getPrime(callback)");
    }, fallbackAfterMs);
  });
}
