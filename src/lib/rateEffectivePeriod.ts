/**
 * 費率版本 → 實際採用的獎金發放期別。
 *
 * 全站結算口徑：以「資料月首日」為版本切點，取 effective_from <= 資料月首日 的最新版本。
 * 因此一個生效日只有在「該月首日之後才生效」時，會延到下一個資料月才被採用。
 * 發放期為資料月的次月 10 日。
 */
export function firstPayoutPeriodForEffectiveFrom(effectiveFrom: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(effectiveFrom);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]); // 1-12
  const day = Number(m[3]);

  // 生效日非該月 1 日 → 該月資料月已錯過切點，順延到下個資料月
  let dataYear = year;
  let dataMonth = month;
  if (day > 1) {
    dataMonth += 1;
    if (dataMonth > 12) {
      dataMonth = 1;
      dataYear += 1;
    }
  }

  // 發放期 = 資料月次月 10 日
  let payoutYear = dataYear;
  let payoutMonth = dataMonth + 1;
  if (payoutMonth > 12) {
    payoutMonth = 1;
    payoutYear += 1;
  }
  return `${payoutYear}-${String(payoutMonth).padStart(2, "0")}-10`;
}

/** 顯示用短格式，例如「10/10 期」 */
export function payoutPeriodLabel(effectiveFrom: string): string | null {
  const p = firstPayoutPeriodForEffectiveFrom(effectiveFrom);
  if (!p) return null;
  const [, mm] = p.split("-");
  return `${Number(mm)}/10 期`;
}
