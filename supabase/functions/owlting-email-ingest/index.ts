// SendGrid Inbound Parse webhook for OwlTing order notifications
// Receives multipart/form-data POST, persists raw payload, lightly parses subject.
// IMPORTANT: Always return 200 so SendGrid does not retry indefinitely.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { parseOwlNestForwardEmail } from "../_shared/owltingHtmlParser.ts";

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

  // Detect message type by keywords (order matters: "取消" trumps everything, then 修改/變更, then 成立/新訂單)
  if (/取消|cancel/i.test(subject)) out.message_type = "cancelled";
  else if (/修改|變更|更改|modif/i.test(subject)) out.message_type = "modified";
  else if (/訂單成立|成立通知|新訂單|新訂房|新的訂單|new\s*(order|booking)/i.test(subject)) out.message_type = "new_order";

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

      // Auto-notify owners on cancel/modify (fire-and-forget)
      if (
        stagingRow?.id &&
        resolvedAccId &&
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

      // Auto-issue fillup magic link for new_order (fire-and-forget)
      if (stagingRow?.id && resolvedAccId && fields.message_type === "new_order") {
        fetch(`${supabaseUrl}/functions/v1/owlting-fillup-issue`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ staging_id: stagingRow.id }),
        }).catch((e) => console.error("[owlting-email-ingest] fillup-issue trigger failed:", e));
      } else if (stagingRow?.id && !resolvedAccId && fields.message_type === "new_order") {
        console.warn("[owlting-email-ingest] new_order staged but accommodation_id unresolved; skip auto fillup-issue", {
          staging_id: stagingRow.id,
          accommodation_name: fields.accommodation_name,
        });
      }
    } catch (e) {
      console.error("[owlting-email-ingest] staging insert threw:", e);
    }
  }


  return new Response(JSON.stringify({ ok: true, id: inserted?.id ?? null }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
