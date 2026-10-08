// 旅客標籤一次性「規則清洗」：不呼叫 AI，對全部 traveler_profiles 跑過濾。
// POST /functions/v1/traveler-cleanup  body: { dry_run?: boolean }
//  - interest_tags：同義詞先「轉換」成白名單詞（如 寵物→寵物友善），非白名單才刪
//  - consumption.ai_keywords：移除作業用語/人名/純數字代碼/電話/email
//  - custom_needs：逐行剔除系統/備註行，保留人寫的需求句（不整筆刪除混合備註）
// 正式清洗（非 dry_run）會先把原值寫入 traveler_profiles_cleanup_backup（可還原）。
// 權限：service role 或 super_admin／admin；hotel_admin 一律 403。
// deno-lint-ignore-file no-explicit-any
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildNameSet, sanitizeInterestTags, sanitizeKeywords, sanitizeNeeds,
  mapInterest, needLines,
} from "../_shared/travelerTags.ts";

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
      if (!allowed) return json({ error: "Forbidden（僅限總部 super_admin／admin）" }, 403);
    }

    let body: any = {};
    try { body = await req.json(); } catch { /* 空 body */ }
    const dryRun = body?.dry_run === true;

    const all = await fetchAll(admin, "traveler_profiles", "id,display_name,interest_tags,custom_needs,consumption");
    const nameSet = buildNameSet(all.map((p: any) => p.display_name));

    const updates: Array<{
      id: string;
      interest_tags: string[]; custom_needs: string[]; consumption: any;
      old_interest: string[]; old_needs: string[]; old_keywords: string[];
    }> = [];
    let removedInterest = 0, removedNeeds = 0, removedKeywords = 0, convertedInterest = 0;
    const freqConverted = new Map<string, number>();
    const freqRemovedInterest = new Map<string, number>();
    const freqNeeds = new Map<string, number>();
    const freqKeywords = new Map<string, number>();
    const samples: any[] = [];
    const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

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

      // interest：區分「轉換」與「真的刪除」
      for (const t of oldInterest) {
        const term = String(t ?? "").trim();
        const m = mapInterest(term);
        if (m === null) {
          removedInterest++;
          if (dryRun) bump(freqRemovedInterest, term || "(空)");
        } else if (m !== term) {
          convertedInterest++;
          if (dryRun) bump(freqConverted, `${term}→${m}`);
        }
      }
      // needs：逐行剔除，統計被移除的「行」
      const keptSet = new Set(newNeeds);
      const removedLines = needLines(oldNeeds).filter((l) => !keptSet.has(l));
      removedNeeds += removedLines.length;
      if (dryRun) removedLines.forEach((l) => bump(freqNeeds, l));
      // keywords
      const keepKw = new Set(newKeywords);
      const removedKw = oldKeywords.filter((k) => !keepKw.has(k));
      removedKeywords += removedKw.length;
      if (dryRun) removedKw.forEach((k) => bump(freqKeywords, k));

      if (dryRun && samples.length < 5) {
        samples.push({
          id: p.id, display_name: p.display_name,
          before: { interest_tags: oldInterest, custom_needs: oldNeeds, ai_keywords: oldKeywords },
          after: { interest_tags: newInterest, custom_needs: newNeeds, ai_keywords: newKeywords },
        });
      }

      updates.push({
        id: p.id,
        interest_tags: newInterest, custom_needs: newNeeds,
        consumption: { ...(p.consumption ?? {}), ai_keywords: newKeywords },
        old_interest: oldInterest, old_needs: oldNeeds, old_keywords: oldKeywords,
      });
    }

    if (dryRun) {
      const top = (m: Map<string, number>) =>
        Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([term, count]) => ({ term, count }));
      return json({
        success: true, dry_run: true, scanned: all.length, to_update: updates.length,
        converted: { interest: convertedInterest },
        removed: { interest: removedInterest, needs: removedNeeds, keywords: removedKeywords },
        converted_terms: { interest_tags: top(freqConverted) },
        removed_terms: { interest_tags: top(freqRemovedInterest), custom_needs: top(freqNeeds), ai_keywords: top(freqKeywords) },
        samples,
      });
    }

    // === 正式清洗：先備份，再更新（備份失敗即中止，保證可還原）===
    const batchId = crypto.randomUUID();
    let backedUp = 0;
    for (let i = 0; i < updates.length; i += 500) {
      const chunk = updates.slice(i, i + 500).map((u) => ({
        batch_id: batchId, profile_id: u.id,
        interest_tags: u.old_interest, custom_needs: u.old_needs, ai_keywords: u.old_keywords,
      }));
      const { error } = await admin.from("traveler_profiles_cleanup_backup").insert(chunk);
      if (error) {
        return json({ error: `備份失敗，已中止清洗（未修改任何資料）：${error.message}`, batch_id: batchId }, 500);
      }
      backedUp += chunk.length;
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
      success: true, scanned: all.length, updated, backed_up: backedUp, batch_id: batchId,
      converted: { interest: convertedInterest },
      removed: { interest: removedInterest, needs: removedNeeds, keywords: removedKeywords },
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
