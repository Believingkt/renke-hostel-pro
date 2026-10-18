// 用法：deno run -A --import-map=import_map.json run.ts <functions 目錄>
// 依序以 5 種身分呼叫 remarketing-send／preview／copy，印出 HTTP 狀態與是否讀到旅客資料
import { calls } from "./fake_supabase.ts";

const fnDir = Deno.args[0];
Deno.env.set("SUPABASE_URL", "http://local.test");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-key-local");
Deno.env.set("SUPABASE_ANON_KEY", "anon-key-local");
Deno.env.set("LLM_MODE", "gateway");
Deno.env.set("LOVABLE_API_KEY", "fake-llm-key");
Deno.env.set("RESEND_API_KEY", "fake-resend-key");

globalThis.fetch = (async (input: string | URL | Request) => {
  const url = String(input instanceof Request ? input.url : input);
  calls.push(`fetch:${new URL(url).host}`);
  if (url.includes("resend.com")) return new Response(JSON.stringify({ id: "email-1" }), { status: 200 });
  const content = JSON.stringify({ subject: "想念你", body: "歡迎回來", cta_text: "立即查看" });
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
}) as typeof fetch;

const handlers: Record<string, (r: Request) => Promise<Response>> = {};
let current = "";
(Deno as any).serve = (h: any) => { handlers[current] = h; return {} as any; };
for (const f of ["remarketing-send", "remarketing-preview", "remarketing-copy"]) {
  current = f;
  await import(`${fnDir}/${f}/index.ts`);
}

const bodies: Record<string, unknown> = {
  "remarketing-send": { campaign_id: "camp-1", mode: "test", test_emails: ["qa@lakeze.com"] },
  "remarketing-preview": { segment: { rules: [] } },
  "remarketing-copy": { segment_summary: "全部旅客" },
};
const personas: [string, string, number][] = [
  ["u-owner-single", "單館業主（hotel_admin+owner，A 館）", 403],
  ["u-internal-multi", "內部多館 hotel_admin（A/B/C）", 403],
  ["u-hotel-scoped-admin", "附加：館別 admin（accommodation_id=A）", 403],
  ["u-super", "super_admin", 200],
  ["u-team-admin", "團隊 admin（accommodation_id 為空）", 200],
];

let pass = 0, total = 0;
for (const fn of Object.keys(bodies)) {
  for (const [uid, label, expect] of personas) {
    calls.length = 0;
    const res = await handlers[fn](new Request(`http://local.test/${fn}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${uid}`, "Content-Type": "application/json" },
      body: JSON.stringify(bodies[fn]),
    }));
    const j = await res.json();
    const touched = calls.filter((c) => !c.endsWith(":user_roles"));
    const ok = res.status === expect && (expect !== 403 || touched.length === 0);
    total++; if (ok) pass++;
    console.log(`${ok ? "PASS" : "FAIL"} | ${fn} | ${label} | 預期 ${expect} 實際 ${res.status} | ${JSON.stringify(j).slice(0, 90)} | 後續存取: ${touched.join(",") || "無"}`);
  }
}
console.log(`\n結果：${pass}/${total} 通過`);
