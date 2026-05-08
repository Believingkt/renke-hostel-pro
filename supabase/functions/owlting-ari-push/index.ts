/**
 * OwlTing ARI Push (Outbound)
 *
 * 由後台/排程觸發。讀取指定民宿在指定日期區間的 inventory 與 price，
 * 組成 OTA_HotelInvCountNotifRQ + OTA_HotelRateAmountNotifRQ，
 * POST 到 OwlTing 端 ARI 接收 endpoint。
 *
 * Request body (JSON):
 *   {
 *     accommodation_id: string,
 *     date_from: "YYYY-MM-DD",
 *     date_to:   "YYYY-MM-DD",
 *     room_type_ids?: string[]   // 可選，預設全部
 *   }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { buildCorsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function xmlEscape(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildWsSecurityHeader(username: string | null, password: string | null): string {
  if (!username) return "";
  return `<soap:Header>
    <wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
      <wsse:UsernameToken>
        <wsse:Username>${xmlEscape(username)}</wsse:Username>
        <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">${xmlEscape(password || "")}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soap:Header>`;
}

function buildInvCountNotif(
  hotelCode: string,
  username: string | null,
  password: string | null,
  rows: Array<{ room_type_id: string; date: string; available: number }>
): string {
  const inventories = rows
    .map(
      (r) => `      <Inventory>
        <StatusApplicationControl Start="${xmlEscape(r.date)}" End="${xmlEscape(r.date)}" InvTypeCode="${xmlEscape(r.room_type_id)}"/>
        <InvCounts>
          <InvCount CountType="2" Count="${xmlEscape(r.available)}"/>
        </InvCounts>
      </Inventory>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  ${buildWsSecurityHeader(username, password)}
  <soap:Body>
    <OTA_HotelInvCountNotifRQ xmlns="http://www.opentravel.org/OTA/2003/05" Version="1.0" TimeStamp="${new Date().toISOString()}">
      <Inventories HotelCode="${xmlEscape(hotelCode)}">
${inventories}
      </Inventories>
    </OTA_HotelInvCountNotifRQ>
  </soap:Body>
</soap:Envelope>`;
}

function buildRateAmountNotif(
  hotelCode: string,
  username: string | null,
  password: string | null,
  rows: Array<{ room_type_id: string; date: string; price: number }>
): string {
  const rates = rows
    .map(
      (r) => `      <RateAmountMessage>
        <StatusApplicationControl Start="${xmlEscape(r.date)}" End="${xmlEscape(r.date)}" InvTypeCode="${xmlEscape(r.room_type_id)}" RatePlanCode="STANDARD"/>
        <Rates>
          <Rate>
            <BaseByGuestAmts>
              <BaseByGuestAmt AmountAfterTax="${xmlEscape(r.price)}" CurrencyCode="TWD"/>
            </BaseByGuestAmts>
          </Rate>
        </Rates>
      </RateAmountMessage>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  ${buildWsSecurityHeader(username, password)}
  <soap:Body>
    <OTA_HotelRateAmountNotifRQ xmlns="http://www.opentravel.org/OTA/2003/05" Version="1.0" TimeStamp="${new Date().toISOString()}">
      <RateAmountMessages HotelCode="${xmlEscape(hotelCode)}">
${rates}
      </RateAmountMessages>
    </OTA_HotelRateAmountNotifRQ>
  </soap:Body>
</soap:Envelope>`;
}

/**
 * Forward a SOAP request through the VPS static-IP relay (固定 IP，OwlTing 白名單用)。
 * Relay 規格：POST {proxy}/relay
 *   Headers: X-Relay-Token, X-Target-Url, 以及以 X-Forward-Header-* 前綴帶過去的目標 headers
 *   Body: 原始 request body (relay 會 passthrough)
 * 若 STATIC_IP_PROXY_URL 未設，回退直連 (測試/dev 用)。
 */
async function fetchViaRelay(
  targetUrl: string,
  options: { method: string; headers: Record<string, string>; body: string }
): Promise<Response> {
  // 共用 AI Butler 的 Relay
  const proxyUrl = Deno.env.get("STATIC_IP_PROXY_URL");
  const proxyToken = Deno.env.get("STATIC_IP_PROXY_TOKEN");

  if (!proxyUrl) {
    console.warn("[OwlTing Relay] STATIC_IP_PROXY_URL not set, using direct connection");
    return fetch(targetUrl, { method: options.method, headers: options.headers, body: options.body });
  }

  const relayHeaders: Record<string, string> = {
    "X-Target-Url": targetUrl,
    "X-Target-Method": options.method,
    "Content-Type": "application/octet-stream",
  };
  if (proxyToken) relayHeaders["X-Relay-Token"] = proxyToken;
  for (const [key, value] of Object.entries(options.headers)) {
    relayHeaders[`X-Forward-Header-${key}`] = value;
  }

  console.log(`[OwlTing Relay] ${options.method} via ${proxyUrl} → ${targetUrl}`);
  return fetch(`${proxyUrl}/relay`, {
    method: "POST",
    headers: relayHeaders,
    body: options.body,
  });
}

function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  const start = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Auth: require a valid Supabase JWT (admin caller)
  const authHeader = req.headers.get("Authorization") || "";
  const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes, error: userErr } = await supabaseUser.auth.getUser();
  if (userErr || !userRes.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: {
    accommodation_id?: string;
    date_from?: string;
    date_to?: string;
    room_type_ids?: string[];
    mode?: "push" | "ping";
  };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { accommodation_id, date_from, date_to, room_type_ids, mode } = payload;
  if (!accommodation_id) {
    return new Response(JSON.stringify({ error: "accommodation_id is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const isPing = mode === "ping";
  if (!isPing) {
    if (!date_from || !date_to) {
      return new Response(
        JSON.stringify({ error: "date_from, date_to are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date_from) || !/^\d{4}-\d{2}-\d{2}$/.test(date_to)) {
      return new Response(JSON.stringify({ error: "Dates must be YYYY-MM-DD" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Verify caller has admin/hotel_admin on this accommodation
  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userRes.user.id)
    .eq("accommodation_id", accommodation_id)
    .in("role", ["super_admin", "hotel_admin"]);
  if (!roleRows || roleRows.length === 0) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Load credentials & endpoint
  const [credRes, endpointRes] = await Promise.all([
    supabase.from("owlting_credentials").select("hotel_code").eq("accommodation_id", accommodation_id).maybeSingle(),
    supabase.from("owlting_ari_endpoints").select("*").eq("accommodation_id", accommodation_id).maybeSingle(),
  ]);

  if (!credRes.data) {
    return new Response(JSON.stringify({ error: "OwlTing credentials not configured" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!endpointRes.data || !endpointRes.data.is_active || !endpointRes.data.endpoint_url) {
    return new Response(JSON.stringify({ error: "OwlTing ARI endpoint not configured/active" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const hotelCode = credRes.data.hotel_code as string;
  const endpoint = endpointRes.data.endpoint_url as string;
  const remoteUser = (endpointRes.data.remote_username as string) || null;
  const remotePass = (endpointRes.data.remote_password as string) || null;

  // Ping mode: just POST OTA_PingRQ to the OwlTing endpoint and report status
  if (isPing) {
    const pingXml = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  ${buildWsSecurityHeader(remoteUser, remotePass)}
  <soap:Body>
    <OTA_PingRQ xmlns="http://www.opentravel.org/OTA/2003/05" Version="1.0" TimeStamp="${new Date().toISOString()}">
      <EchoData>lakeze-channel-test</EchoData>
    </OTA_PingRQ>
  </soap:Body>
</soap:Envelope>`;

    let status = 0;
    let respText = "";
    let err: string | null = null;
    const startedAt = Date.now();
    try {
      const r = await fetchViaRelay(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          "SOAPAction": '"OTA_PingRQ"',
        },
        body: pingXml,
      });
      status = r.status;
      respText = await r.text();
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }
    const elapsed_ms = Date.now() - startedAt;

    await supabase.from("owlting_message_logs").insert({
      accommodation_id,
      direction: "outbound",
      message_type: "OTA_PingRQ",
      http_status: status || null,
      request_body: pingXml.slice(0, 50000),
      response_body: respText.slice(0, 50000),
      error_message: err,
    });

    return new Response(
      JSON.stringify({
        success: !err && status >= 200 && status < 300,
        endpoint,
        http_status: status,
        elapsed_ms,
        error: err,
        response_preview: respText.slice(0, 500),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Load room types
  let roomQuery = supabase
    .from("room_types")
    .select("id, name, room_count, base_price, numeric_code")
    .eq("accommodation_id", accommodation_id);
  if (room_type_ids && room_type_ids.length > 0) {
    roomQuery = roomQuery.in("id", room_type_ids);
  }
  const { data: roomTypes } = await roomQuery;

  if (!roomTypes || roomTypes.length === 0) {
    return new Response(JSON.stringify({ error: "No room types found" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const dates = eachDate(date_from, date_to);
  const roomIds = roomTypes.map((r: any) => r.id);

  // Per-day overrides from room_inventory_pricing
  const { data: overrides } = await supabase
    .from("room_inventory_pricing")
    .select("room_type_id, date, available_rooms, price, is_available")
    .in("room_type_id", roomIds)
    .gte("date", date_from)
    .lte("date", date_to);

  const overrideMap = new Map<string, { available?: number; price?: number; is_available?: boolean }>();
  for (const o of overrides || []) {
    overrideMap.set(`${o.room_type_id}|${o.date}`, {
      available: o.available_rooms ?? undefined,
      price: o.price ?? undefined,
      is_available: o.is_available ?? undefined,
    });
  }

  // NOTE: room_type_id field carries the OUTBOUND CODE for OwlTing — we send numeric_code (e.g. "1001")
  const invRows: Array<{ room_type_id: string; date: string; available: number }> = [];
  const rateRows: Array<{ room_type_id: string; date: string; price: number }> = [];

  for (const rt of roomTypes as any[]) {
    const defaultAvail = rt.room_count ?? 0;
    const defaultPrice = rt.base_price ?? 0;
    const code = String(rt.numeric_code);
    for (const d of dates) {
      const ov = overrideMap.get(`${rt.id}|${d}`);
      const avail = ov?.is_available === false ? 0 : (ov?.available ?? defaultAvail);
      invRows.push({ room_type_id: code, date: d, available: avail });
      rateRows.push({ room_type_id: code, date: d, price: ov?.price ?? defaultPrice });
    }
  }

  const invXml = buildInvCountNotif(hotelCode, remoteUser, remotePass, invRows);
  const rateXml = buildRateAmountNotif(hotelCode, remoteUser, remotePass, rateRows);

  async function postSoap(xml: string, action: string, messageType: string) {
    const headers: Record<string, string> = {
      "Content-Type": "text/xml; charset=utf-8",
      "SOAPAction": `"${action}"`,
    };
    let status = 0;
    let respText = "";
    let err: string | null = null;
    try {
      const r = await fetchViaRelay(endpoint, { method: "POST", headers, body: xml });
      status = r.status;
      respText = await r.text();
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }
    await supabase.from("owlting_message_logs").insert({
      accommodation_id,
      direction: "outbound",
      message_type: messageType,
      http_status: status || null,
      request_body: xml.slice(0, 50000),
      response_body: respText.slice(0, 50000),
      error_message: err,
    });
    return { status, respText, err };
  }

  const invResult = await postSoap(invXml, "OTA_HotelInvCountNotifRQ", "OTA_HotelInvCountNotifRQ");
  const rateResult = await postSoap(rateXml, "OTA_HotelRateAmountNotifRQ", "OTA_HotelRateAmountNotifRQ");

  await supabase
    .from("owlting_ari_endpoints")
    .update({ last_pushed_at: new Date().toISOString() })
    .eq("accommodation_id", accommodation_id);

  return new Response(
    JSON.stringify({
      success: invResult.status >= 200 && invResult.status < 300 && rateResult.status >= 200 && rateResult.status < 300,
      inventory: { http_status: invResult.status, error: invResult.err, rows: invRows.length },
      rates: { http_status: rateResult.status, error: rateResult.err, rows: rateRows.length },
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
