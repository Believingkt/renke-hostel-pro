// SendGrid Inbound Parse webhook for OwlTing order notifications
// Receives multipart/form-data POST, persists raw payload, lightly parses subject.
// IMPORTANT: Always return 200 so SendGrid does not retry indefinitely.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { parseOwlNestForwardEmail } from "../_shared/owltingHtmlParser.ts";
import { autoCreatePendingOrder, cancelAutoPendingOrders, applyModificationToExistingOrder } from "../_shared/owltingAutoOrder.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Trusted sender domains (OwlTing / OwlNest family)
const TRUSTED_DOMAIN_SUFFIXES = [
  "owlting.com",
  "owlnest.com",
  "owlnest.com.tw",
  "owlting.com.tw",
];

interface ParsedSubject {
  message_type: "new_order" | "modified" | "cancelled" | "unknown";
  obe_number: string | null;
  accommodation_name: string | null;
}

function parseSubject(subject: string | null): ParsedSubject {
  const out: ParsedSubject = {
    message_type: "unknown",
    obe_number: null,
    accommodation_name: null,
  };
  if (!subject) return out;

  // Detect message type by keywords. 2026-07-19: 收緊比對，避免「等待付款通知」內文含「取消」政策被誤判。
  if (/取消通知|訂單已取消|已取消|cancel/i.test(subject)) out.message_type = "cancelled";
  else if (/修改通知|變更通知|訂單已修改|訂單已變更|modif/i.test(subject)) out.message_type = "modified";
  else if (/訂單成立|成立通知|新訂單|新訂房|新的訂單|新預定|新預訂|預定通知|預訂通知|等待付款|待付款通知|new\s*(order|booking)/i.test(subject)) out.message_type = "new_order";

  // Extract OBE number (typical format: OBE followed by digits/letters)
  const obeMatch = subject.match(/\b(OBE[\w-]+)\b/i);
  if (obeMatch) out.obe_number = obeMatch[1].toUpperCase();

  // Try to extract accommodation name from "來自 X 的" pattern
  const accMatch = subject.match(/來自\s*(.+?)\s*的/);
  if (accMatch) out.accommodation_name = accMatch[1].trim();

  return out;
}

function extractDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  // email could be "Name <foo@bar.com>" or "foo@bar.com"
  const m = email.match(/<([^>]+)>/);
  const addr = m ? m[1] : email;
  const at = addr.lastIndexOf("@");
  if (at < 0) return null;
  return addr.slice(at + 1).trim().toLowerCase();
}

function isTrustedDomain(domain: string | null): boolean {
  if (!domain) return false;
  return TRUSTED_DOMAIN_SUFFIXES.some(
    (s) => domain === s || domain.endsWith("." + s),
  );
}

type IngestOutcome =
  | "ignored_untrusted"
  | "parse_failed"
  | "noop_modification"
  | "order_updated"
  | "order_created"
  | "order_cancelled"
  | "apply_failed"
  | "staged";

/** 記錄本封信的處理結果（供後台看板統計 / 依 OBE 追查） */
async function recordOutcome(
  supabase: any,
  rawId: string | null | undefined,
  outcome: IngestOutcome,
  detail: Record<string, unknown> = {},
) {
  if (!rawId) return;
  try {
    await supabase
      .from("owlting_email_orders_raw")
      .update({
        ingest_outcome: outcome,
        ingest_outcome_detail: detail,
        ingest_outcome_at: new Date().toISOString(),
      })
      .eq("id", rawId);
  } catch (e) {
    console.error("[owlting-email-ingest] recordOutcome failed:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  let rawPayload: Record<string, unknown> = {};
  let fromEmail: string | null = null;
  let toEmail: string | null = null;
  let subject: string | null = null;
  let text: string | null = null;
  let html: string | null = null;
  let envelope: unknown = null;
  let charsets: unknown = null;
  let attachmentsMeta: Array<Record<string, unknown>> = [];
  let spamScore: number | null = null;
  let spamReport: string | null = null;
  let dkim: string | null = null;
  let spf: string | null = null;
  let senderIp: string | null = null;

  try {
    const ct = req.headers.get("content-type") || "";
    if (!ct.includes("multipart/form-data")) {
      // Capture anything that comes in, but skip parsing
      const bodyText = await req.text().catch(() => "");
      rawPayload = { _content_type: ct, _body: bodyText };
    } else {
      const form = await req.formData();
      for (const [key, value] of form.entries()) {
        if (value instanceof File) {
          attachmentsMeta.push({
            field: key,
            filename: value.name,
            type: value.type,
            size: value.size,
          });
          // Skip storing file bytes in rawPayload for now
        } else {
          rawPayload[key] = value;
        }
      }

      fromEmail = (rawPayload.from as string) ?? null;
      toEmail = (rawPayload.to as string) ?? null;
      subject = (rawPayload.subject as string) ?? null;
      text = (rawPayload.text as string) ?? null;
      html = (rawPayload.html as string) ?? null;

      const envRaw = rawPayload.envelope as string | undefined;
      if (envRaw) {
        try { envelope = JSON.parse(envRaw); } catch { envelope = envRaw; }
      }
      const chRaw = rawPayload.charsets as string | undefined;
      if (chRaw) {
        try { charsets = JSON.parse(chRaw); } catch { charsets = chRaw; }
      }

      const ssRaw = rawPayload.spam_score as string | undefined;
      if (ssRaw) {
        const n = parseFloat(ssRaw);
        if (!Number.isNaN(n)) spamScore = n;
      }
      spamReport = (rawPayload.spam_report as string) ?? null;
      dkim = (rawPayload.dkim as string) ?? null;
      spf = (rawPayload.SPF as string) ?? (rawPayload.spf as string) ?? null;
      senderIp = (rawPayload.sender_ip as string) ?? null;
    }
  } catch (e) {
    console.error("[owlting-email-ingest] parse error:", e);
    // Persist failure with whatever we have, return 200
    await supabase.from("owlting_email_parse_failures").insert({
      failure_reason: `multipart parse error: ${(e as Error).message}`,
      failure_stage: "envelope_check",
      raw_payload: rawPayload,
    });
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  // Determine envelope-from domain
  let envelopeFromDomain: string | null = null;
  if (envelope && typeof envelope === "object") {
    const envObj = envelope as Record<string, unknown>;
    const envFrom = envObj.from as string | undefined;
    envelopeFromDomain = extractDomain(envFrom);
  }
  if (!envelopeFromDomain) envelopeFromDomain = extractDomain(fromEmail);

  const trusted = isTrustedDomain(envelopeFromDomain);
  const parsed = parseSubject(subject);

  // Pre-parse body once so we can enrich raw row with accommodation_name / channel_source
  let bodyFields: ReturnType<typeof parseOwlNestForwardEmail> | null = null;
  if (trusted && (text || html)) {
    try {
      bodyFields = parseOwlNestForwardEmail({ subject, text_body: text, html_body: html });
    } catch (e) {
      console.error("[owlting-email-ingest] body parser threw:", e);
    }
  }

  // Determine status
  let status = "received";
  let notes: string | null = null;
  if (!trusted) {
    status = "ignored";
    notes = `Untrusted sender domain: ${envelopeFromDomain ?? "(none)"}`;
  } else if (parsed.message_type === "unknown" || !parsed.obe_number) {
    status = "failed";
    notes = "Could not parse subject (message_type / OBE number missing)";
  } else {
    status = "parsed";
  }

  // For cancelled / modified emails, the body usually lacks accommodation info.
  // Inherit accommodation_id / accommodation_name from the prior new_order with the same obe_number.
  let inheritedAccId: string | null = null;
  let inheritedAccName: string | null = null;
  if (
    status === "parsed" &&
    parsed.obe_number &&
    (parsed.message_type === "cancelled" || parsed.message_type === "modified")
  ) {
    const { data: prior } = await supabase
      .from("owlting_email_orders_raw")
      .select("accommodation_id, accommodation_name")
      .eq("obe_number", parsed.obe_number)
      .not("accommodation_id", "is", null)
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (prior) {
      inheritedAccId = (prior as any).accommodation_id ?? null;
      inheritedAccName = (prior as any).accommodation_name ?? null;
    }
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("owlting_email_orders_raw")
    .insert({
      from_email: fromEmail,
      from_domain: envelopeFromDomain,
      to_email: toEmail,
      subject,
      text_body: text,
      html_body: html,
      envelope: envelope ?? null,
      charsets: charsets ?? null,
      attachments: attachmentsMeta.length ? attachmentsMeta : null,
      spam_score: spamScore,
      spam_report: spamReport,
      dkim,
      spf,
      sender_ip: senderIp,
      raw_payload: rawPayload,
      message_type: parsed.message_type,
      obe_number: parsed.obe_number,
      accommodation_id: inheritedAccId,
      accommodation_name: bodyFields?.accommodation_name ?? parsed.accommodation_name ?? inheritedAccName,
      status,
      notes,
      processed_at: status === "parsed" ? null : new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertErr) {
    console.error("[owlting-email-ingest] insert raw error:", insertErr);
  }

  // Quarantine failures / ignored entries for visibility
  if (status === "failed" || status === "ignored") {
    await supabase.from("owlting_email_parse_failures").insert({
      raw_email_id: inserted?.id ?? null,
      from_email: fromEmail,
      subject,
      failure_reason: notes ?? "unknown",
      failure_stage: status === "ignored" ? "envelope_check" : "subject_parse",
      raw_payload: rawPayload,
    });
    await recordOutcome(
      supabase,
      inserted?.id,
      status === "ignored" ? "ignored_untrusted" : "parse_failed",
      { reason: notes, obe_number: parsed.obe_number, message_type: parsed.message_type },
    );
  }

  // Trigger-only parser (2026-05-29 policy: OwlTing email 不含 PII，僅當 trigger)
  // 只記 obe_number / message_type / accommodation_name / channel_source；訂單細節由後續 OBE API client 拉取。
  if (trusted && inserted?.id && bodyFields) {
    try {
      const fields = bodyFields;
      let stagingAccId: string | null =
        (parsed.message_type === "cancelled" || parsed.message_type === "modified")
          ? inheritedAccId
          : null;

      // For new_order, try to resolve accommodation_id by name (so auto fillup-issue can fire)
      if (!stagingAccId && fields.message_type === "new_order") {
        const accNameLookup = fields.accommodation_name ?? parsed.accommodation_name;
        if (accNameLookup) {
          const { data: accRow } = await supabase
            .from("accommodation_info")
            .select("id")
            .eq("name", accNameLookup)
            .maybeSingle();
          if (accRow?.id) stagingAccId = accRow.id as string;
        }
      }

      const { data: stagingRow, error: stageErr } = await supabase
        .from("owlting_email_parsed_staging")
        .insert({
          raw_email_id: inserted.id,
          parser_version: "trigger-only-v2",
          confidence: "low",
          review_status: "pending_review",
          message_type: fields.message_type,
          obe_number: fields.obe_number,
          accommodation_name: fields.accommodation_name ?? parsed.accommodation_name ?? inheritedAccName,
          accommodation_id: stagingAccId,
          channel_source: fields.channel_source,
          check_in_date: fields.check_in_date,
          check_out_date: fields.check_out_date,
          room_type_name: fields.room_type_name,
          project_name: fields.project_name,
          room_quantity: fields.room_quantity,
          guest_count: fields.guest_count,
          guest_name: fields.guest_name,
          adult_count: fields.adult_count,
          child_count: fields.child_count,
          nights: fields.nights,
          total_amount: fields.total_amount,
          remaining_amount: fields.remaining_amount,
          currency: fields.currency,
          payment_status: fields.payment_status,
          pii_masked: false,
          extracted_fields: fields.raw_matches,
          parse_warnings: fields.warnings.length ? fields.warnings : null,
        })
        .select("id, accommodation_id")
        .single();
      if (stageErr) console.error("[owlting-email-ingest] staging insert error:", stageErr);

      // DB trigger `resolve_owlting_staging_accommodation` may have populated accommodation_id;
      // prefer that resolved value over our local lookup.
      const resolvedAccId: string | null =
        (stagingRow as any)?.accommodation_id ?? stagingAccId;

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

      // 修改通知差異判定。
      // 例外分支：
      //  - 缺少 OBE → 無法對應既有訂單，記為失敗並隔離，絕不視為空修改。
      //  - 差異解析失敗（no_sections / unparsable）或僅部分欄位可比對（partial）
      //    → 不可判定為空修改，改以「與 DB 既有訂單逐欄比對」為準。
      const diffStatus = (fields.modification_diff_status ?? null) as string | null;
      const parserChanges = fields.modification_changes ?? [];
      const isModified = fields.message_type === "modified";
      // 僅在「完整可靠比對且無差異」時才認定空修改
      const isNoopModification =
        isModified && fields.is_noop_modification === true && diffStatus === "compared";
      const diffUnreliable =
        isModified && (diffStatus === null || diffStatus === "no_sections" || diffStatus === "unparsable" || diffStatus === "partial");
      const changeSummary = parserChanges
        .map((c) => `${c.label}：${c.before ?? "—"} → ${c.after ?? "—"}`)
        .join("；");

      // 例外分支 A：修改通知但缺少 OBE
      if (stagingRow?.id && isModified && !fields.obe_number) {
        await supabase.from("owlting_email_parsed_staging").update({
          review_status: "pending_review",
          modification_diff_status: diffStatus ?? "unparsable",
          modification_diff: parserChanges.length ? parserChanges : null,
          auto_create_error: "missing_obe_number",
          review_notes: "[需人工] 修改通知缺少 OBE 編號，無法對應既有訂單（不視為空修改）。",
        }).eq("id", stagingRow.id);
        await supabase.from("owlting_email_parse_failures").insert({
          raw_email_id: inserted.id,
          from_email: fromEmail,
          subject,
          failure_reason: "modified email without OBE number",
          failure_stage: "subject_parse",
          raw_payload: rawPayload,
        });
        await recordOutcome(supabase, inserted.id, "parse_failed", {
          reason: "missing_obe_number",
          message_type: "modified",
          diff_status: diffStatus,
        });
      }

      if (stagingRow?.id && isNoopModification) {
        console.log("[owlting-email-ingest] no-op modification, skip notify & order update", {
          obe: fields.obe_number,
        });
        await supabase.from("owlting_email_parsed_staging").update({
          review_status: "ignored",
          modification_diff: [],
          modification_diff_status: "compared",
          review_notes: "[空修改] 原始訂單與修改後內容完全一致，未通知業主、未建立或更新補單。",
        }).eq("id", stagingRow.id);
        await recordOutcome(supabase, inserted.id, "noop_modification", {
          obe_number: fields.obe_number,
          diff_status: diffStatus,
        });
      }

      if (stagingRow?.id && diffUnreliable) {
        console.warn("[owlting-email-ingest] modification diff unreliable, fallback to DB compare", {
          obe: fields.obe_number,
          diff_status: diffStatus,
        });
        await supabase.from("owlting_email_parsed_staging").update({
          modification_diff: parserChanges.length ? parserChanges : null,
          modification_diff_status: diffStatus ?? "unparsable",
        }).eq("id", stagingRow.id);
      }

      // 修改通知（有實質差異 or 差異無法可靠判定）：更新既有訂單，不重複建單造成佔位。
      if (
        stagingRow?.id &&
        isModified &&
        !isNoopModification &&
        fields.obe_number
      ) {
        const modRes = await applyModificationToExistingOrder(supabase, {
          staging_id: stagingRow.id,
          obe_number: fields.obe_number,
          accommodation_id: resolvedAccId,
          room_type_name: fields.room_type_name,
          room_quantity: fields.room_quantity,
          check_in_date: fields.check_in_date,
          check_out_date: fields.check_out_date,
          guest_count: fields.guest_count,
          total_amount: fields.total_amount,
          change_summary: changeSummary || null,
          parser_diff_status: diffStatus,
        });
        console.log("[owlting-email-ingest] modification apply result", modRes);

        // Self-push（人客多 → 奧丁丁 → 回信）絕不補單，避免重複佔位。
        const chSrcMod = (fields.channel_source ?? "").trim().toLowerCase();
        const isSelfPushMod = chSrcMod.includes("人客多") || chSrcMod.includes("lakeze");

        // 找不到既有訂單 → 退回自動建單（首次補單）
        if (!modRes.ok && modRes.skipped_reason === "order_not_found" && isSelfPushMod) {
          console.warn("[owlting-email-ingest] self-push modification: order not found, skip fallback create", {
            obe: fields.obe_number,
          });
          await supabase.from("owlting_email_parsed_staging").update({
            pii_status: "manual_review",
            review_notes: `[self-push] 修改通知找不到對應本站訂單，已略過補單（${fields.check_in_date}~${fields.check_out_date}, ${fields.total_amount}）`,
          }).eq("id", stagingRow.id);
          await recordOutcome(supabase, inserted.id, "noop_modification", {
            obe_number: fields.obe_number,
            reason: "self_push_no_local_order",
            diff_status: diffStatus,
          });
        } else if (!modRes.ok && modRes.skipped_reason === "order_not_found" && resolvedAccId) {

          const fallback = await autoCreatePendingOrder(supabase, {
            raw_email_id: inserted.id,
            staging_id: stagingRow.id,
            accommodation_id: resolvedAccId,
            obe_number: fields.obe_number,
            channel_source: fields.channel_source,
            room_type_name: fields.room_type_name,
            room_quantity: fields.room_quantity,
            check_in_date: fields.check_in_date,
            check_out_date: fields.check_out_date,
            guest_count: fields.guest_count,
            total_amount: fields.total_amount,
            guest_name: fields.guest_name,
            special_requests: fields.special_requests,
          });
          console.log("[owlting-email-ingest] modification fallback create", fallback);
          await recordOutcome(supabase, inserted.id, fallback.ok ? "order_created" : "apply_failed", {
            obe_number: fields.obe_number,
            via: "modification_fallback_create",
            diff_status: diffStatus,
            reason: fallback.ok ? null : (fallback.skipped_reason ?? fallback.error ?? "unknown"),
          });
        } else if (!modRes.ok) {
          await supabase.from("owlting_email_parsed_staging").update({
            auto_create_error: modRes.skipped_reason ?? modRes.error ?? "modification_apply_failed",
          }).eq("id", stagingRow.id);
          await recordOutcome(supabase, inserted.id, "apply_failed", {
            obe_number: fields.obe_number,
            reason: modRes.skipped_reason ?? modRes.error ?? "modification_apply_failed",
            diff_status: diffStatus,
          });
        } else if (modRes.skipped_reason === "no_material_change") {
          // 信件差異不可靠，但與 DB 逐欄比對後確實無變更
          await recordOutcome(supabase, inserted.id, "noop_modification", {
            obe_number: fields.obe_number,
            order_number: modRes.order_number,
            diff_status: diffStatus,
            verified_by: "db_compare",
          });
        } else {
          await recordOutcome(supabase, inserted.id, "order_updated", {
            obe_number: fields.obe_number,
            order_id: modRes.order_id,
            order_number: modRes.order_number,
            diff_status: diffStatus,
            diff: modRes.diff ?? [],
            updated_fields: modRes.updated_fields ?? [],
          });
        }
      }

      // Auto-notify owners on cancel/modify (fire-and-forget)
      if (
        stagingRow?.id &&
        resolvedAccId &&
        !isNoopModification &&
        (fields.message_type === "cancelled" || fields.message_type === "modified")
      ) {
        fetch(`${supabaseUrl}/functions/v1/owlting-change-notify`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ staging_id: stagingRow.id }),
        }).catch((e) => console.error("[owlting-email-ingest] change-notify trigger failed:", e));
      }

      // Self-push detection: PMS → OwlNest → email back to us.
      // These rows must NOT trigger our internal fillup notification.
      const chSrc = (fields.channel_source ?? "").trim().toLowerCase();
      const isSelfPush = chSrc.includes("人客多") || chSrc.includes("lakeze");

      if (stagingRow?.id && resolvedAccId && fields.message_type === "new_order" && !isSelfPush) {
        const isPaymentPending = /等待付款|待付款/.test(`${subject ?? ""} ${text ?? ""}`);

        // If a confirmed 成立通知 arrives after a prior payment-pending lock,
        // clear the 等待付款 marker so 48h cleanup no longer targets it.
        if (!isPaymentPending && fields.obe_number) {
          await supabase
            .from("orders")
            .update({ notes: null })
            .eq("owlting_reservation_id", fields.obe_number)
            .eq("is_pii_pending", true)
            .like("notes", "%[等待付款鎖房]%")
            .then(async () => {
              // We only want to strip the marker prefix, not wipe notes. Do it via RPC-safe read/write.
            }).catch(() => {});
          // Safer: read → replace → write
          const { data: pendings } = await supabase
            .from("orders")
            .select("id, notes")
            .eq("owlting_reservation_id", fields.obe_number)
            .eq("is_pii_pending", true)
            .like("notes", "%[等待付款鎖房]%");
          for (const p of pendings ?? []) {
            const newNotes = String(p.notes ?? "").replace(/\[等待付款鎖房\]\s*/g, "").replace(/，來源: 等待付款通知（48h 內未成立將自動釋放）/g, "");
            await supabase.from("orders").update({ notes: newNotes }).eq("id", p.id);
          }
        }

        // NEW: auto-create PII-pending order to lock inventory immediately.
        const autoRes = await autoCreatePendingOrder(supabase, {
          raw_email_id: inserted.id,
          staging_id: stagingRow.id,
          accommodation_id: resolvedAccId,
          obe_number: fields.obe_number,
          channel_source: fields.channel_source,
          room_type_name: fields.room_type_name,
          room_quantity: fields.room_quantity,
          check_in_date: fields.check_in_date,
          check_out_date: fields.check_out_date,
          guest_count: fields.guest_count,
          total_amount: fields.total_amount,
          is_payment_pending: isPaymentPending,
          guest_name: fields.guest_name,
          special_requests: fields.special_requests,
          remaining_amount: fields.remaining_amount,
        });
        if (!autoRes.ok) {
          console.warn("[owlting-email-ingest] auto-create pending skipped:", autoRes);
          await supabase.from("owlting_email_parsed_staging").update({
            auto_create_error: autoRes.skipped_reason ?? autoRes.error ?? "unknown",
          }).eq("id", stagingRow.id);
          await recordOutcome(supabase, inserted.id, "apply_failed", {
            obe_number: fields.obe_number,
            reason: autoRes.skipped_reason ?? autoRes.error ?? "unknown",
            via: "auto_create_pending",
          });
        } else {
          console.log("[owlting-email-ingest] auto-created pending order", { ...autoRes, is_payment_pending: isPaymentPending });
          await recordOutcome(supabase, inserted.id, "order_created", {
            obe_number: fields.obe_number,
            order_id: (autoRes as any).order_id ?? null,
            order_number: (autoRes as any).order_number ?? null,
            is_payment_pending: isPaymentPending,
          });
        }

        // Still issue fillup magic link so owner can backfill PII.
        fetch(`${supabaseUrl}/functions/v1/owlting-fillup-issue`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ staging_id: stagingRow.id }),
        }).catch((e) => console.error("[owlting-email-ingest] fillup-issue trigger failed:", e));
      } else if (stagingRow?.id && resolvedAccId && isSelfPush) {
        // Self-push: auto-link to existing PMS order, mark staging self_pushed.
        // No internal fillup email is sent.
        console.log("[owlting-email-ingest] self-push detected, auto-linking (no fillup notify)", {
          staging_id: stagingRow.id,
          channel_source: fields.channel_source,
        });
        fetch(`${supabaseUrl}/functions/v1/owlting-selfpush-link`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ staging_id: stagingRow.id }),
        }).catch((e) => console.error("[owlting-email-ingest] selfpush-link trigger failed:", e));
      } else if (stagingRow?.id && !resolvedAccId && fields.message_type === "new_order") {
        console.warn("[owlting-email-ingest] new_order staged but accommodation_id unresolved; skip auto fillup-issue", {
          staging_id: stagingRow.id,
          accommodation_name: fields.accommodation_name,
        });
      }

      // NEW: cancelled email → auto-cancel any PMS orders linked to this OBE.
      if (stagingRow?.id && fields.message_type === "cancelled" && fields.obe_number) {
        const cancelled = await cancelAutoPendingOrders(supabase, fields.obe_number);
        if (cancelled.length > 0) {
          console.log("[owlting-email-ingest] auto-cancelled orders for OBE", fields.obe_number, cancelled);
          await supabase.from("owlting_email_parsed_staging").update({
            review_notes: `[auto-cancel] OwlTing 取消通知已同步取消 PMS 訂單 ${cancelled.length} 筆`,
          }).eq("id", stagingRow.id);
        }
        await recordOutcome(supabase, inserted.id, "order_cancelled", {
          obe_number: fields.obe_number,
          cancelled_count: cancelled.length,
        });
      }
    } catch (e) {
      console.error("[owlting-email-ingest] staging insert threw:", e);
      await recordOutcome(supabase, inserted.id, "apply_failed", {
        reason: (e as Error).message,
        stage: "staging_pipeline",
        obe_number: parsed.obe_number,
      });
    }
  }

  // 尚未被上面任一分支標記結果的信件（例如成功入庫但無自動動作）→ staged
  if (inserted?.id) {
    const { data: outcomeRow } = await supabase
      .from("owlting_email_orders_raw")
      .select("ingest_outcome")
      .eq("id", inserted.id)
      .maybeSingle();
    if (!(outcomeRow as any)?.ingest_outcome) {
      await recordOutcome(supabase, inserted.id, "staged", {
        obe_number: parsed.obe_number,
        message_type: parsed.message_type,
      });
    }
  }


  return new Response(JSON.stringify({ ok: true, id: inserted?.id ?? null }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
