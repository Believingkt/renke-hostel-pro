// 用法：deno run -A --no-lock docs/onboarding-3/localtest/resolve_check.ts
// 讀 wizard_tests.sql 匯出的 T 館專案（wz_templates.json），用前台同一支 resolveOrderPricingTemplateId 判斷下單時會對到哪個專案（不實際下單）
import { resolveOrderPricingTemplateId } from "../../../packages/shared/src/utils/orderPricingTemplate.ts";

const data = JSON.parse(await Deno.readTextFile(new URL("./wz_templates.json", import.meta.url)));
const auto = data.templates.find((t: { default_package_id: string }) => t.default_package_id === data.packageId);
const picked = resolveOrderPricingTemplateId({
  packageId: data.packageId,
  accommodationId: data.accommodationId,
  templates: data.templates,
  fallbackTemplateId: null,
});
const ok = !!auto && picked === auto.id && auto.room_type_id === data.primaryRoomTypeId;
console.log(`方案 ${data.packageId}`);
console.log(`自動建立的專案 ${auto?.id}（房型 ${auto?.room_type_id}）`);
console.log(`resolveOrderPricingTemplateId → ${picked}`);
console.log(`${ok ? "PASS" : "FAIL"}：下單會對到自動建立的專案，且專案房型 = 方案主房型`);
if (!ok) Deno.exit(1);
