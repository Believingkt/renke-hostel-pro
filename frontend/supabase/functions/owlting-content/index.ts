/**
 * OwlTing AR ID 內容端點 (Inbound)
 *
 * OwlTing 會以 SOAP/XML POST 呼叫此端點，要求查詢某 Hotel 的房型/方案/介紹資料。
 * 我們解析 OTA_HotelDescriptiveInfoRQ，驗證 WS-Security UsernameToken，
 * 回傳 OTA_HotelDescriptiveInfoRS。
 *
 * Endpoint URL（提供給 OwlTing）:
 *   https://<project-ref>.supabase.co/functions/v1/owlting-content
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, soapaction",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

/** Minimal regex-based extractor for OwlTing-style WS-Security headers and OTA messages. */
function extractTag(xml: string, tag: string): string | null {
  // capture both <tag>x</tag> and <ns:tag>x</ns:tag>
  const re = new RegExp(`<(?:[\\w-]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

function extractAttr(xml: string, tag: string, attr: string): string | null {
  const re = new RegExp(`<(?:[\\w-]+:)?${tag}\\b[^>]*\\b${attr}\\s*=\\s*"([^"]*)"`, "i");
  const m = xml.match(re);
  return m ? m[1] : null;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function buildSoapFault(code: string, message: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <soap:Fault>
      <faultcode>${xmlEscape(code)}</faultcode>
      <faultstring>${xmlEscape(message)}</faultstring>
    </soap:Fault>
  </soap:Body>
</soap:Envelope>`;
}

function buildErrorRS(rootElement: string, type: string, code: string, shortText: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <${rootElement} xmlns="http://www.opentravel.org/OTA/2003/05" Version="1.0" TimeStamp="${new Date().toISOString()}">
      <Errors>
        <Error Type="${xmlEscape(type)}" Code="${xmlEscape(code)}" ShortText="${xmlEscape(shortText)}"/>
      </Errors>
    </${rootElement}>
  </soap:Body>
</soap:Envelope>`;
}

async function logMessage(
  supabase: ReturnType<typeof createClient>,
  args: {
    accommodation_id: string | null;
    direction: "inbound" | "outbound";
    message_type: string | null;
    http_status: number;
    request_body?: string;
    response_body?: string;
    error_message?: string | null;
  }
) {
  try {
    await supabase.from("owlting_message_logs").insert({
      accommodation_id: args.accommodation_id,
      direction: args.direction,
      message_type: args.message_type,
      http_status: args.http_status,
      request_body: args.request_body?.slice(0, 50000) ?? null,
      response_body: args.response_body?.slice(0, 50000) ?? null,
      error_message: args.error_message ?? null,
    });
  } catch (e) {
    console.error("[owlting-content] log insert failed:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  if (req.method !== "POST") {
    return new Response(buildSoapFault("Client", "Only POST is supported"), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "text/xml; charset=utf-8" },
    });
  }

  let body = "";
  try {
    body = await req.text();
  } catch {
    return new Response(buildSoapFault("Client", "Cannot read request body"), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "text/xml; charset=utf-8" },
    });
  }

  // 1) WS-Security UsernameToken
  const username = extractTag(body, "Username");
  const password = extractTag(body, "Password");
  if (!username || !password) {
    const xml = buildSoapFault("Client", "Missing WS-Security UsernameToken");
    await logMessage(supabase, {
      accommodation_id: null,
      direction: "inbound",
      message_type: null,
      http_status: 401,
      request_body: body,
      response_body: xml,
      error_message: "Missing UsernameToken",
    });
    return new Response(xml, {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "text/xml; charset=utf-8" },
    });
  }

  // 2) Lookup credential by username, verify password hash
  const { data: cred, error: credErr } = await supabase
    .from("owlting_credentials")
    .select("*")
    .eq("username", username)
    .eq("is_active", true)
    .maybeSingle();

  if (credErr || !cred) {
    const xml = buildSoapFault("Client", "Invalid credentials");
    await logMessage(supabase, {
      accommodation_id: null,
      direction: "inbound",
      message_type: null,
      http_status: 401,
      request_body: body,
      response_body: xml,
      error_message: "Username not found",
    });
    return new Response(xml, {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "text/xml; charset=utf-8" },
    });
  }

  const passwordHash = await sha256Hex(password);
  if (passwordHash !== cred.password_hash) {
    const xml = buildSoapFault("Client", "Invalid credentials");
    await logMessage(supabase, {
      accommodation_id: cred.accommodation_id as string,
      direction: "inbound",
      message_type: null,
      http_status: 401,
      request_body: body,
      response_body: xml,
      error_message: "Password mismatch",
    });
    return new Response(xml, {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "text/xml; charset=utf-8" },
    });
  }

  const accommodationId = cred.accommodation_id as string;
  const hotelCode = cred.hotel_code as string;

  // 3) Identify message type
  const isDescriptiveInfo = /OTA_HotelDescriptiveInfoRQ/i.test(body);
  const isPing = /OTA_PingRQ/i.test(body);

  // Optional: validate HotelCode in payload matches credential
  const requestedHotelCode = extractAttr(body, "HotelDescriptiveInfo", "HotelCode") ||
                             extractAttr(body, "HotelRef", "HotelCode");
  if (requestedHotelCode && requestedHotelCode !== hotelCode) {
    const xml = buildErrorRS(
      "OTA_HotelDescriptiveInfoRS",
      "1",
      "402",
      `HotelCode mismatch: expected ${hotelCode}`
    );
    await logMessage(supabase, {
      accommodation_id: accommodationId,
      direction: "inbound",
      message_type: "OTA_HotelDescriptiveInfoRQ",
      http_status: 200,
      request_body: body,
      response_body: xml,
      error_message: "HotelCode mismatch",
    });
    return new Response(xml, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/xml; charset=utf-8" },
    });
  }

  if (isPing) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <OTA_PingRS xmlns="http://www.opentravel.org/OTA/2003/05" Version="1.0" TimeStamp="${new Date().toISOString()}">
      <Success/>
      <EchoData>pong</EchoData>
    </OTA_PingRS>
  </soap:Body>
</soap:Envelope>`;
    await logMessage(supabase, {
      accommodation_id: accommodationId,
      direction: "inbound",
      message_type: "OTA_PingRQ",
      http_status: 200,
      request_body: body,
      response_body: xml,
    });
    return new Response(xml, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/xml; charset=utf-8" },
    });
  }

  if (!isDescriptiveInfo) {
    const xml = buildSoapFault("Client", "Unsupported message. Expected OTA_HotelDescriptiveInfoRQ or OTA_PingRQ");
    await logMessage(supabase, {
      accommodation_id: accommodationId,
      direction: "inbound",
      message_type: "unknown",
      http_status: 400,
      request_body: body,
      response_body: xml,
    });
    return new Response(xml, {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "text/xml; charset=utf-8" },
    });
  }

  // 4) Build OTA_HotelDescriptiveInfoRS — load accommodation content
  const [{ data: info }, { data: rooms }] = await Promise.all([
    supabase
      .from("accommodation_info")
      .select("name, description, address, country, region_1, region_2, phone, email, check_in_notice")
      .eq("id", accommodationId)
      .maybeSingle(),
    supabase
      .from("room_types")
      .select("id, name, description, capacity, base_price, room_count")
      .eq("accommodation_id", accommodationId)
      .order("display_order", { ascending: true }),
  ]);

  const guestRooms = (rooms || [])
    .map((r: any) => {
      const price = r.base_price ?? 0;
      return `      <GuestRoom Code="${xmlEscape(r.id)}" MaxOccupancy="${xmlEscape(r.capacity ?? 2)}" Quantity="${xmlEscape(r.room_count ?? 1)}">
        <TypeRoom RoomTypeName="${xmlEscape(r.name)}" StandardOccupancy="${xmlEscape(r.capacity ?? 2)}"/>
        <DescriptiveText>${xmlEscape(r.description || r.name)}</DescriptiveText>
        <Amenities/>
        <RatePlan RatePlanCode="STANDARD" CurrencyCode="TWD" Amount="${xmlEscape(price)}"/>
      </GuestRoom>`;
    })
    .join("\n");

  const responseXml = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <OTA_HotelDescriptiveInfoRS xmlns="http://www.opentravel.org/OTA/2003/05" Version="1.0" TimeStamp="${new Date().toISOString()}">
      <Success/>
      <HotelDescriptiveContents HotelCode="${xmlEscape(hotelCode)}">
        <HotelDescriptiveContent HotelName="${xmlEscape(info?.name || "")}" LanguageCode="zh-TW">
          <HotelInfo>
            <Descriptions>
              <Description>${xmlEscape(info?.description || "")}</Description>
            </Descriptions>
          </HotelInfo>
          <FacilityInfo>
            <GuestRooms>
${guestRooms}
            </GuestRooms>
          </FacilityInfo>
          <ContactInfos>
            <ContactInfo>
              <Addresses>
                <Address>
                  <AddressLine>${xmlEscape(info?.address || "")}</AddressLine>
                  <CityName>${xmlEscape(info?.region_2 || info?.region_1 || "")}</CityName>
                  <CountryName>${xmlEscape(info?.country || "")}</CountryName>
                </Address>
              </Addresses>
              <Phones>
                <Phone PhoneNumber="${xmlEscape(info?.phone || "")}"/>
              </Phones>
              <Emails>
                <Email>${xmlEscape(info?.email || "")}</Email>
              </Emails>
            </ContactInfo>
          </ContactInfos>
          <Policies>
            <Policy>
              <PolicyInfo>${xmlEscape(info?.check_in_notice || "")}</PolicyInfo>
            </Policy>
          </Policies>
        </HotelDescriptiveContent>
      </HotelDescriptiveContents>
    </OTA_HotelDescriptiveInfoRS>
  </soap:Body>
</soap:Envelope>`;

  await logMessage(supabase, {
    accommodation_id: accommodationId,
    direction: "inbound",
    message_type: "OTA_HotelDescriptiveInfoRQ",
    http_status: 200,
    request_body: body,
    response_body: responseXml,
  });

  return new Response(responseXml, {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "text/xml; charset=utf-8" },
  });
});
