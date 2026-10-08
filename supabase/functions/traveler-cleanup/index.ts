// 旅客標籤一次性「規則清洗」：不呼叫 AI，對全部 traveler_profiles 跑過濾。
// POST /functions/v1/traveler-cleanup  body: { dry_run?: boolean }
//  - interest_tags：只保留白名單內
//  - consumption.ai_keywords：移除作業用語/人名/純數字代碼/電話/email
//  - custom_needs：只刪雜訊項目，真正的客製化需求保留（不整欄清空）
// deno-lint-ignore-file no-explicit-any
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildNameSet, sanitizeInterestTags, sanitizeKeywords, sanitizeNeeds } from "../_shared/travelerTags.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function fetchAll(admin: any, table: string, columns: string) {
  const out: any[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await admin.from(table).select(columns).range(from, from + size - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < size) break;
  }
  return out;
}

const sameArr = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (bearer !== serviceKey) {
      if (!authHeader) return json({ error: "Unauthorized" }, 401);
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      });
      const { data: userData } = await userClient.auth.getUser();
      if (!userData?.user) return json({ error: "Unauthorized" }, 401);
      const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userData.user.id);
      const allowed = (roles ?? []).some((r: any) => ["super_admin", "admin"].includes(r.role));
      if (!allowed) return json({ error: "Forbidden" }, 403);
    }

    let body: any = {};
    try { body = await req.json(); } catch { /* 空 body */ }
    const dryRun = body?.dry_run === true;

    const all = await fetchAll(admin, "traveler_profiles", "id,display_name,interest_tags,custom_needs,consumption");
    const nameSet = buildNameSet(all.map((p: any) => p.display_name));

    const updates: Array<{ id: string; interest_tags: string[]; custom_needs: string[]; consumption: any }> = [];
    let removedInterest = 0, removedNeeds = 0, removedKeywords = 0;
    const freqInterest = new Map<string, number>();
    const freqNeeds = new Map<string, number>();
    const freqKeywords = new Map<string, number>();
    const samples: any[] = [];
    const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
    const diff = (oldArr: string[], newArr: string[]) => {
      const keep = new Set(newArr);
      return oldArr.filter((x) => !keep.has(x));
    };

    for (const p of all) {
      const oldInterest: string[] = Array.isArray(p.interest_tags) ? p.interest_tags : [];
      const oldNeeds: string[] = Array.isArray(p.custom_needs) ? p.custom_needs : [];
      const oldKeywords: string[] = Array.isArray(p.consumption?.ai_keywords) ? p.consumption.ai_keywords : [];

      const newInterest = sanitizeInterestTags(oldInterest);
      const newNeeds = sanitizeNeeds(oldNeeds, nameSet);
      const newKeywords = sanitizeKeywords(oldKeywords, nameSet);

      const changed =
        !sameArr(oldInterest, newInterest) ||
        !sameArr(oldNeeds, newNeeds) ||
        !sameArr(oldKeywords, newKeywords);
      if (!changed) continue;

      removedInterest += Math.max(0, oldInterest.length - newInterest.length);
      removedNeeds += Math.max(0, oldNeeds.length - newNeeds.length);
      removedKeywords += Math.max(0, oldKeywords.length - newKeywords.length);

      if (dryRun) {
        diff(oldInterest, newInterest).forEach((x) => bump(freqInterest, x));
        diff(oldNeeds, newNeeds).forEach((x) => bump(freqNeeds, x));
        diff(oldKeywords, newKeywords).forEach((x) => bump(freqKeywords, x));
        if (samples.length < 5) {
          samples.push({
            id: p.id,
            display_name: p.display_name,
            before: { interest_tags: oldInterest, custom_needs: oldNeeds, ai_keywords: oldKeywords },
            after: { interest_tags: newInterest, custom_needs: newNeeds, ai_keywords: newKeywords },
          });
        }
      }

      updates.push({
        id: p.id,
        interest_tags: newInterest,
        custom_needs: newNeeds,
        consumption: { ...(p.consumption ?? {}), ai_keywords: newKeywords },
      });
    }

    if (dryRun) {
      const top = (m: Map<string, number>) =>
        Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([term, count]) => ({ term, count }));
      return json({
        success: true, dry_run: true, scanned: all.length,
        to_update: updates.length, removed: { interest: removedInterest, needs: removedNeeds, keywords: removedKeywords },
        removed_terms: { interest_tags: top(freqInterest), custom_needs: top(freqNeeds), ai_keywords: top(freqKeywords) },
        samples,
      });
    }

    let updated = 0;
    for (let i = 0; i < updates.length; i += 50) {
      const chunk = updates.slice(i, i + 50);
      const res = await Promise.all(chunk.map((u) =>
        admin.from("traveler_profiles")
          .update({ interest_tags: u.interest_tags, custom_needs: u.custom_needs, consumption: u.consumption })
          .eq("id", u.id)
      ));
      updated += res.filter((r: any) => !r.error).length;
      const firstErr = res.find((r: any) => r.error);
      if (firstErr) console.warn("[traveler-cleanup] update error", (firstErr as any).error?.message);
    }

    return json({
      success: true, scanned: all.length, updated,
      removed: { interest: removedInterest, needs: removedNeeds, keywords: removedKeywords },
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
