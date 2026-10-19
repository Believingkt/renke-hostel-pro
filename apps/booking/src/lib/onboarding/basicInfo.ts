/** 基本資料規則：與後端 wizard_basic_info_errors 相同（20261022090000），後端為最終把關 */
export interface BasicInfo { name: string; address: string; phone: string; description: string }

export const BASIC_RULES = {
  name: { min: 2, max: 50 },
  address: { min: 5, max: 200 },
  description: { min: 30, max: 3000 },
  phoneDigits: { min: 8, max: 15 },
};

const len = (s: string) => Array.from(s).length;

export function phoneError(raw: string): string | null {
  const v = raw.trim();
  if (!v) return "電話必填";
  const digits = v.split("#")[0].replace(/[^0-9]/g, "").length;
  if (!/^[0-9+() -]+(#[0-9]{1,6})?$/.test(v) || digits < BASIC_RULES.phoneDigits.min || digits > BASIC_RULES.phoneDigits.max) {
    return "電話格式不正確（例：02-2345-6789、0912-345-678、+886-2-2345-6789）";
  }
  return null;
}

/** 依欄位回傳錯誤訊息；沒有錯誤的欄位不出現 */
export function basicInfoErrors(b: BasicInfo): Partial<Record<keyof BasicInfo, string>> {
  const out: Partial<Record<keyof BasicInfo, string>> = {};
  const name = b.name.trim();
  const address = b.address.trim();
  const desc = b.description.trim();
  const { name: n, address: a, description: d } = BASIC_RULES;
  if (!name) out.name = "名稱必填";
  else if (len(name) < n.min || len(name) > n.max) out.name = `名稱需 ${n.min}～${n.max} 字`;
  if (!address) out.address = "地址必填";
  else if (len(address) < a.min || len(address) > a.max) out.address = `地址需 ${a.min}～${a.max} 字`;
  const p = phoneError(b.phone);
  if (p) out.phone = p;
  if (!desc) out.description = "介紹必填";
  else if (len(desc) < d.min) out.description = `介紹至少 ${d.min} 字（目前 ${len(desc)} 字）`;
  else if (len(desc) > d.max) out.description = `介紹最多 ${d.max} 字`;
  return out;
}
