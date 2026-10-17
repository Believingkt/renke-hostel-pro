import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { extractDate, extractGuests, extractStay, normalizeCnNumerals } from "./roomCards.ts";

const TODAY = "2026-06-15";
const s = (t: string) => extractStay(t, TODAY);

Deno.test("12/1 到 12/3", () => assertEquals(s("12/1 到 12/3"), { checkIn: "2026-12-01", checkOut: "2026-12-03", nights: 2, guests: null }));
Deno.test("12/1-12/3", () => assertEquals(s("12/1-12/3")?.checkOut, "2026-12-03"));
Deno.test("12/1～12/3", () => assertEquals(s("12/1～12/3")?.nights, 2));
Deno.test("12月1日到3日", () => assertEquals(s("12月1日到3日"), { checkIn: "2026-12-01", checkOut: "2026-12-03", nights: 2, guests: null }));
Deno.test("12/1 住兩晚", () => assertEquals(s("12/1 住兩晚"), { checkIn: "2026-12-01", checkOut: "2026-12-03", nights: 2, guests: null }));
Deno.test("12/1 入住 12/3 退房", () => assertEquals(s("12/1 入住 12/3 退房")?.checkOut, "2026-12-03"));
Deno.test("12月1日入住、3日退房", () => assertEquals(s("12月1日入住、3日退房")?.checkOut, "2026-12-03"));
Deno.test("中文月日：十二月一日到三日", () => assertEquals(s("十二月一日到三日")?.checkOut, "2026-12-03"));
Deno.test("跨年：12/30 到 1/2", () => assertEquals(s("12/30 到 1/2"), { checkIn: "2026-12-30", checkOut: "2027-01-02", nights: 3, guests: null }));

Deno.test("人數：四個人", () => assertEquals(s("12/1 到 12/3 四個人有空房嗎")?.guests, 4));
Deno.test("人數：4人", () => assertEquals(extractGuests("4人"), 4));
Deno.test("人數：4位", () => assertEquals(extractGuests("我們4位"), 4));
Deno.test("人數：兩大一小", () => assertEquals(s("12月1日入住 3日退房 兩大一小")?.guests, 3));
Deno.test("人數：2大2小", () => assertEquals(extractGuests("2大2小"), 4));
Deno.test("人數：四人房不算人數", () => assertEquals(extractGuests("你們四人房多少錢"), null));
Deno.test("人數：日期後的大床不算", () => assertEquals(extractGuests("12/24 大床房"), null));
Deno.test("人數：沒提 → null", () => assertEquals(s("12/24 還有房嗎")?.guests, null));

Deno.test("只給一個日期 → 住 1 晚", () => assertEquals(s("12/24 還有房嗎"), { checkIn: "2026-12-24", checkOut: "2026-12-25", nights: 1, guests: null }));
Deno.test("日期已過 → 推到明年", () => assertEquals(s("3/5 到 3/7")?.checkIn, "2027-03-05"));
Deno.test("日期已過（區間）退房也在明年", () => assertEquals(s("3/5 到 3/7")?.checkOut, "2027-03-07"));
Deno.test("無日期 → null", () => assertEquals(s("可以帶狗嗎"), null));

Deno.test("extractDate 保留原行為", () => {
  assertEquals(extractDate("7/12", TODAY), "2026-07-12");
  assertEquals(extractDate("2026-07-12", TODAY), "2026-07-12");
  assertEquals(extractDate("沒有日期", TODAY), null);
});
Deno.test("normalizeCnNumerals", () => {
  assertEquals(normalizeCnNumerals("十二月二十一日 兩晚 十人"), "12月21日 2晚 10人");
});
