/**
 * OwlTing Order Push (Outbound OTA_HotelResNotifRQ)
 *
 * 推送訂單通知 (Commit / Modify / Cancel) 到 OwlTing endpoint。
 * 透過 VPS Relay 走固定 IP，符合 OwlTing IP 白名單需求。
 *
 * Request body (JSON):
 *   {
 *     accommodation_id: string,        // 必填，用來查 hotel_code / endpoint / 權限
 *     res_status: "Commit" | "Modify" | "Cancel",
 *     reservation: {
 *       unique_id: string,             // 訂單編號 (我方 ResID)
 *       create_datetime?: string,      // ISO，Commit 必填
 *       last_modify_datetime?: string, // ISO，Modify/Cancel 必填
 *       echo_token?: string,
 *       room_type_code: string,        // 對應 OwlTing numeric_code (RoomType)
 *       rate_plan_code: string,        // 對應 OwlTing numeric_code (RatePlan)
 *       number_of_units?: number,      // default 1
 *       check_in: string,              // YYYY-MM-DD
 *       check_out: string,             // YYYY-MM-DD
 *       guest_count?: number,          // default 1
 *       total_amount: number,
 *       currency?: string,             // default TWD
 *       guest: {
 *         given_name: string,
 *         surname: string,
 *         phone?: string,
 *         email?: string,
 *       },
 *     },
 *   }
 *
 * Endpoint URL 來源（依序）：
 *   1. OWLTING_ORDER_PUSH_URL secret（佔位用，奧丁丁正式 URL 拿到後填入）
 *   2. owlting_ari_endpoints.endpoint_url（沿用 ARI 同個接收端，若奧丁丁同 endpoint）
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { buildCorsHeaders } from "../_shared/cors.ts";
import {
  assertValidOutboundResNotifXml,
  type ResStatus,
} from "../_shared/owltingResValidator.ts";

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

/**
 * 與 owlting-ari-push 共用的 Relay forwarder（line 109-141 pattern）。
 * 走 VPS 固定 IP，符合 OwlTing IP 白名單。
 */
async function fetchViaRelay(
  targetUrl: string,
  options: { method: string; headers: Record<string, string>; body: string }
): Promise<Response> {
  const proxyUrl = Deno.env.get("STATIC_IP_PROXY_URL");
  const proxyToken = Deno.env.get("STATIC_IP_PROXY_TOKEN");

  if (!proxyUrl) {
    console.warn("[OwlTing OrderPush] STATIC_IP_PROXY_URL not set, using direct connection");
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

  console.log(`[OwlTing OrderPush] ${options.method} via ${proxyUrl} → ${targetUrl}`);
  return fetch(`${proxyUrl}/relay`, {
    method: "POST",
    headers: relayHeaders,
    body: options.body,
  });
}

function hotelReservationAttrs(resStatus: ResStatus, ts: string, createDt?: string, modifyDt?: string): string {
  if (resStatus === "Commit") {
    return `CreateDateTime="${xmlEscape(createDt ?? ts)}" ResStatus="Commit"`;
  }
  return `LastModifyDateTime="${xmlEscape(modifyDt ?? ts)}" ResStatus="${resStatus}"`;
}

interface ReservationPayload {
  unique_id: string;
  create_datetime?: string;
  last_modify_datetime?: string;
  echo_token?: string;
  room_type_code: string;
  rate_plan_code: string;
  number_of_units?: number;
  check_in: string;
  check_out: string;
  guest_count?: number;
  total_amount: number;
  currency?: string;
  guest: { given_name: string; surname: string; phone?: string; email?: string };
}

function buildResNotifXml(
  resStatus: ResStatus,
  hotelCode: string,
  username: string | null,
  password: string | null,
  r: ReservationPayload,
): string {
  const ts = new Date().toISOString();
  const echo = r.echo_token ?? `order-push-${Date.now()}`;
  const units = r.number_of_units ?? 1;
  const guests = r.guest_count ?? 1;
  const currency = r.currency ?? "TWD";
  const reservAttrs = hotelReservationAttrs(resStatus, ts, r.create_datetime, r.last_modify_datetime);

  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  ${buildWsSecurityHeader(username, password)}
  <soap:Body>
    <OTA_HotelResNotifRQ xmlns="http://www.opentravel.org/OTA/2003/05" Version="1.0" TimeStamp="${ts}" EchoToken="${xmlEscape(echo)}" ResStatus="${resStatus}">
      <POS>
        <Source>
          <RequestorID Type="22" ID="LAKEZE"/>
          <BookingChannel Type="7" Primary="true">
            <CompanyName Code="LAKEZE">人客多</CompanyName>
          </BookingChannel>
        </Source>
      </POS>
      <HotelReservations>
        <HotelReservation ${reservAttrs}>
          <UniqueID Type="14" ID="${xmlEscape(r.unique_id)}"/>
          <RoomStays>
            <RoomStay>
              <RoomTypes>
                <RoomType RoomTypeCode="${xmlEscape(r.room_type_code)}" NumberOfUnits="${units}"/>
              </RoomTypes>
              <RatePlans>
                <RatePlan RatePlanCode="${xmlEscape(r.rate_plan_code)}"/>
              </RatePlans>
              <RoomRates>
                <RoomRate RoomTypeCode="${xmlEscape(r.room_type_code)}" RatePlanCode="${xmlEscape(r.rate_plan_code)}" NumberOfUnits="${units}">
                  <Rates>
                    <Rate EffectiveDate="${xmlEscape(r.check_in)}" ExpireDate="${xmlEscape(r.check_out)}">
                      <Base AmountAfterTax="${xmlEscape(r.total_amount)}" CurrencyCode="${xmlEscape(currency)}"/>
                    </Rate>
                  </Rates>
                </RoomRate>
              </RoomRates>
              <GuestCounts>
                <GuestCount AgeQualifyingCode="10" Count="${guests}"/>
              </GuestCounts>
              <TimeSpan Start="${xmlEscape(r.check_in)}" End="${xmlEscape(r.check_out)}"/>
              <Total AmountAfterTax="${xmlEscape(r.total_amount)}" CurrencyCode="${xmlEscape(currency)}"/>
              <BasicPropertyInfo HotelCode="${xmlEscape(hotelCode)}"/>
              <ResGuestRPHs>
                <ResGuestRPH RPH="1"/>
              </ResGuestRPHs>
            </RoomStay>
          </RoomStays>
          <ResGuests>
            <ResGuest ResGuestRPH="1" PrimaryIndicator="true">
              <Profiles>
                <ProfileInfo>
                  <Profile ProfileType="1">
                    <Customer>
                      <PersonName>
                        <GivenName>${xmlEscape(r.guest.given_name)}</GivenName>
                        <Surname>${xmlEscape(r.guest.surname)}</Surname>
                      </PersonName>
                      ${r.guest.phone ? `<Telephone PhoneTechType="1" PhoneNumber="${xmlEscape(r.guest.phone)}"/>` : ""}
                      ${r.guest.email ? `<Email>${xmlEscape(r.guest.email)}</Email>` : ""}
                    </Customer>
                  </Profile>
                </ProfileInfo>
              </Profiles>
            </ResGuest>
          </ResGuests>
          <ResGlobalInfo>
            <HotelReservationIDs>
              <HotelReservationID ResID_Type="14" ResID_Value="${xmlEscape(r.unique_id)}" ResID_Source="LAKEZE"/>
            </HotelReservationIDs>
            <Total AmountAfterTax="${xmlEscape(r.total_amount)}" CurrencyCode="${xmlEscape(currency)}"/>
            <Profiles>
              <ProfileInfo>
                <Profile ProfileType="1">
                  <Customer>
                    <PersonName>
                      <GivenName>${xmlEscape(r.guest.given_name)}</GivenName>
                      <Surname>${xmlEscape(r.guest.surname)}</Surname>
                    </PersonName>
                    ${r.guest.phone ? `<Telephone PhoneTechType="1" PhoneNumber="${xmlEscape(r.guest.phone)}"/>` : ""}
                    ${r.guest.email ? `<Email>${xmlEscape(r.guest.email)}</Email>` : ""}
                  </Customer>
                </Profile>
              </ProfileInfo>
            </Profiles>
          </ResGlobalInfo>
        </HotelReservation>
      </HotelReservations>
    </OTA_HotelResNotifRQ>
  </soap:Body>
</soap:Envelope>`;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Auth
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
    res_status?: ResStatus;
    reservation?: ReservationPayload;
  };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { accommodation_id, res_status, reservation } = payload;
  if (!accommodation_id || !res_status || !reservation) {
    return new Response(
      JSON.stringify({ error: "accommodation_id, res_status, reservation are required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  if (!["Commit", "Modify", "Cancel"].includes(res_status)) {
    return new Response(JSON.stringify({ error: "res_status must be Commit|Modify|Cancel" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Permission check
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

  const hotelCode = credRes.data.hotel_code as string;
  // Endpoint resolution: prefer secret OWLTING_ORDER_PUSH_URL (placeholder), fallback to ARI endpoint row.
  const endpoint =
    Deno.env.get("OWLTING_ORDER_PUSH_URL") ||
    (endpointRes.data?.endpoint_url as string | undefined);
  if (!endpoint) {
    return new Response(
      JSON.stringify({
        error:
          "OwlTing order-push endpoint not configured. Set OWLTING_ORDER_PUSH_URL secret or owlting_ari_endpoints.endpoint_url.",
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  const remoteUser = (endpointRes.data?.remote_username as string | undefined) || null;
  const remotePass = (endpointRes.data?.remote_password as string | undefined) || null;

  // Build + validate XML
  const xml = buildResNotifXml(res_status, hotelCode, remoteUser, remotePass, reservation);
  try {
    assertValidOutboundResNotifXml(xml);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("owlting_message_logs").insert({
      accommodation_id,
      direction: "outbound",
      message_type: "OTA_HotelResNotifRQ",
      http_status: null,
      request_body: xml.slice(0, 50000),
      response_body: "",
      error_message: `validator rejected: ${msg}`,
    });
    return new Response(JSON.stringify({ error: "Invalid outbound XML", detail: msg }), {
      status: 422,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Dispatch via VPS relay
  let status = 0;
  let respText = "";
  let err: string | null = null;
  const startedAt = Date.now();
  try {
    const r = await fetchViaRelay(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": '"OTA_HotelResNotifRQ"',
      },
      body: xml,
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
    message_type: `OTA_HotelResNotifRQ:${res_status}`,
    http_status: status || null,
    request_body: xml.slice(0, 50000),
    response_body: respText.slice(0, 50000),
    error_message: err,
  });

  return new Response(
    JSON.stringify({
      success: !err && status >= 200 && status < 300,
      res_status,
      endpoint,
      http_status: status,
      elapsed_ms,
      error: err,
      response_preview: respText.slice(0, 500),
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
