// TapPay getPrime wrapper with timeout support
// TapPay SDK's getPrime only accepts a callback function, not options object.
// The appId/appKey are already configured via setupSDK().

export async function getTapPayPrime(
  opts?: { timeoutMs?: number }
): Promise<string> {
  const timeoutMs = opts?.timeoutMs ?? 15000;

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

    try {
      // TapPay getPrime only accepts callback, appId/appKey are set in setupSDK
      tp.card.getPrime(onResult);
    } catch (e: any) {
      const msg = e?.message ? `getPrime 呼叫失敗：${e.message}` : "getPrime 呼叫失敗";
      settle(() => reject(new Error(msg)));
    }
  });
}
