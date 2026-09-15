// Unit tests for shared helpers used by create-paid-order
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizePhoneE164, mapTapPayErrorToUserMessage } from "../_shared/tappay.ts";

Deno.test("normalizePhoneE164: TW mobile 09xx → +886", () => {
  assertEquals(normalizePhoneE164("0912345678"), "+886912345678");
});

Deno.test("normalizePhoneE164: keeps existing +886", () => {
  assertEquals(normalizePhoneE164("+886912345678"), "+886912345678");
});

Deno.test("normalizePhoneE164: 886 prefix without +", () => {
  assertEquals(normalizePhoneE164("886912345678"), "+886912345678");
});

Deno.test("normalizePhoneE164: strips spaces and dashes", () => {
  assertEquals(normalizePhoneE164("0912-345 678"), "+886912345678");
});

Deno.test("mapTapPayErrorToUserMessage: status 3 (card info)", () => {
  const r = mapTapPayErrorToUserMessage(3, "card error");
  assertEquals(r.userMessage, "卡片資訊錯誤");
});

Deno.test("mapTapPayErrorToUserMessage: status 10 (insufficient)", () => {
  const r = mapTapPayErrorToUserMessage(10);
  assertEquals(r.userMessage, "授權失敗");
});

Deno.test("mapTapPayErrorToUserMessage: unknown status uses msg", () => {
  const r = mapTapPayErrorToUserMessage(9999, "some error");
  assertEquals(r.userMessage, "some error");
});
