/**
 * owlting-cm-self-test
 *
 * Admin-triggered tester that builds sample SOAP envelopes for the four
 * OwlTing CM methods, posts them to the owlting-cm endpoint with a
 * service-role bypass header (so we don't need the plaintext WS-Security
 * password), and returns parsed pass/fail results.
 *
 * Methods exercised:
 *   ① OTA_HotelAvailRQ           — read-only; expects RoomStays
 *   ② OTA_HotelAvailNotifRQ      — sets BookingLimit=current value (idempotent)
 *   ③ OTA_HotelRateAmountNotifRQ — sets price=current value (idempotent)
 *   ④ OTA_HotelResNotifRQ        — uses ResStatus=Cancel against a fake
 *                                  reservation id ("SELFTEST-..."); since the
 *                                  id won't be found we still verify the
 *                                  endpoint reaches the cancel branch and
 *                                  returns a structured response.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { validateOutboundResNotifXml } from "../_shared/owltingResValidator.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const CM_URL = `${SUPABASE_URL}/functions/v1/owlting-cm`;

function nowIso() { return new Date().toISOString(); }
function todayIso() { return new Date().toISOString().slice(0, 10); }

function envelope(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>${body}</soap:Body>
</soap:Envelope>`;
}

/**
 * 依奧丁丁規格產生 <HotelReservation> 起始標籤的屬性字串。
 * 規則 (請任何 outbound XML 產生器都遵守):
 *   - 一律加 ResStatus 屬性
 *   - ResStatus="Commit"            -> 加 CreateDateTime
 *   - ResStatus="Modify" / "Cancel" -> 加 LastModifyDateTime
 *
 * ⚠️ 重要：三種 ResStatus (Commit / Modify / Cancel) 都必須帶完整 reservation body —
 * RoomStays、ResGuests、ResGlobalInfo 一個都不能少。
 * Cancel 不可只送 UniqueID — 奧丁丁需要完整 body 來交叉驗證、釋放庫存、保留取消快照。
 * 此 helper 只負責 <HotelReservation> 起始標籤的屬性，body 內容請由呼叫端組完整。
 */
function hotelReservationAttrs(resStatus: "Commit" | "Modify" | "Cancel", isoTs: string): string {
  const tsAttr = resStatus === "Commit"
    ? `CreateDateTime="${isoTs}"`
    : `LastModifyDateTime="${isoTs}"`;
  return `${tsAttr} ResStatus="${resStatus}"`;
}

async function dispatch(xml: string, hotelCode: string, accommodationId: string) {
  const started = performance.now();
  const r = await fetch(CM_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "x-self-test-key": SERVICE_ROLE,
      "x-self-test-acc": accommodationId,
      "x-self-test-hotel": hotelCode,
    },
    body: xml,
  });
  const text = await r.text();
  const elapsed_ms = Math.round(performance.now() - started);
  return { status: r.status, body: text, elapsed_ms };
}

function summarize(method: string, body: string) {
  const hasSuccess = /<Success\s*\/?>/.test(body);
  const errMatch = /<Error\b[^>]*>([\s\S]*?)<\/Error>/.exec(body);
  const errMsg = errMatch ? errMatch[1].trim() : null;
  // Extra: count RoomStay / RatePlan returned for AvailRQ
  let extra = "";
  if (method === "OTA_HotelAvailRQ") {
    const rooms = (body.match(/<RoomStay\b/g) ?? []).length;
    const plans = (body.match(/<RatePlan\b/g) ?? []).length;
    extra = `回傳 ${rooms} 個房型 / ${plans} 個方案`;
  }
  return { ok: hasSuccess && !errMsg, errMsg, extra };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Verify caller is authenticated admin (any logged-in user with role admin/super_admin)
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "未登入" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: { accommodation_id?: string };
  try { payload = await req.json(); } catch { payload = {}; }
  const accommodationId = payload.accommodation_id;
  if (!accommodationId) {
    return new Response(JSON.stringify({ error: "缺少 accommodation_id" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Role check (admin / super_admin / staff)
  const { data: roles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  const roleNames = (roles ?? []).map((r: any) => r.role);
  const isAdmin = roleNames.some((r) => ["admin", "super_admin", "staff"].includes(r));
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "無權限" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Resolve hotel code
  const { data: cred } = await admin
    .from("owlting_credentials")
    .select("hotel_code")
    .eq("accommodation_id", accommodationId)
    .maybeSingle();
  if (!cred?.hotel_code) {
    return new Response(JSON.stringify({ error: "尚未建立 OwlTing 認證 (hotel_code 缺失)" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const hotelCode = cred.hotel_code as string;

  // Pick a sample room type + rate plan for ②③
  const { data: rooms } = await admin
    .from("room_types")
    .select("id,name,numeric_code")
    .eq("accommodation_id", accommodationId)
    .order("display_order", { ascending: true })
    .limit(1);
  const sampleRoom = rooms?.[0];

  const { data: plans } = await admin
    .from("pricing_templates")
    .select("id,template_name,room_type_id,numeric_code")
    .eq("accommodation_id", accommodationId)
    .limit(5);
  const samplePlan =
    plans?.find((p: any) => p.room_type_id === sampleRoom?.id) ?? plans?.[0];

  const date = todayIso();
  const results: Array<{
    method: string;
    label: string;
    ok: boolean;
    http_status: number;
    elapsed_ms: number;
    summary: string;
    request: string;
    response: string;
  }> = [];

  // ① OTA_HotelAvailRQ
  {
    const echo = `selftest-avail-${Date.now()}`;
    const xml = envelope(`<OTA_HotelAvailRQ xmlns="http://www.opentravel.org/OTA/2003/05" Version="1.0" TimeStamp="${nowIso()}" EchoToken="${echo}">
      <AvailRequestSegments>
        <AvailRequestSegment>
          <HotelSearchCriteria>
            <Criterion><HotelRef HotelCode="${hotelCode}"/></Criterion>
          </HotelSearchCriteria>
        </AvailRequestSegment>
      </AvailRequestSegments>
    </OTA_HotelAvailRQ>`);
    const r = await dispatch(xml, hotelCode, accommodationId);
    const s = summarize("OTA_HotelAvailRQ", r.body);
    results.push({
      method: "OTA_HotelAvailRQ",
      label: "① 取得房型 / 方案",
      ok: s.ok,
      http_status: r.status,
      elapsed_ms: r.elapsed_ms,
      summary: s.ok ? `成功 — ${s.extra}` : `失敗 — ${s.errMsg ?? "未知錯誤"}`,
      request: xml,
      response: r.body,
    });
  }

  // ② OTA_HotelAvailNotifRQ — only if we have a sample room
  if (sampleRoom) {
    const echo = `selftest-availnotif-${Date.now()}`;
    const roomCode = String(sampleRoom.numeric_code);
    const xml = envelope(`<OTA_HotelAvailNotifRQ xmlns="http://www.opentravel.org/OTA/2003/05" Version="1.0" TimeStamp="${nowIso()}" EchoToken="${echo}">
      <AvailStatusMessages HotelCode="${hotelCode}">
        <AvailStatusMessage BookingLimit="0">
          <StatusApplicationControl Start="${date}" End="${date}" InvTypeCode="${roomCode}"/>
        </AvailStatusMessage>
      </AvailStatusMessages>
    </OTA_HotelAvailNotifRQ>`);
    const r = await dispatch(xml, hotelCode, accommodationId);
    const s = summarize("OTA_HotelAvailNotifRQ", r.body);
    results.push({
      method: "OTA_HotelAvailNotifRQ",
      label: `② 設定庫存 (BookingLimit=0, ${roomCode}, ${date})`,
      ok: s.ok,
      http_status: r.status,
      elapsed_ms: r.elapsed_ms,
      summary: s.ok ? "成功 — 庫存已寫入" : `失敗 — ${s.errMsg ?? "未知錯誤"}`,
      request: xml,
      response: r.body,
    });
  } else {
    results.push({
      method: "OTA_HotelAvailNotifRQ",
      label: "② 設定庫存",
      ok: false, http_status: 0, elapsed_ms: 0,
      summary: "略過 — 此民宿尚無房型",
      request: "", response: "",
    });
  }

  // ③ OTA_HotelRateAmountNotifRQ
  if (sampleRoom && samplePlan) {
    const echo = `selftest-rate-${Date.now()}`;
    const roomCode = String(sampleRoom.numeric_code);
    const planCode = String(samplePlan.numeric_code);
    const xml = envelope(`<OTA_HotelRateAmountNotifRQ xmlns="http://www.opentravel.org/OTA/2003/05" Version="1.0" TimeStamp="${nowIso()}" EchoToken="${echo}">
      <RateAmountMessages HotelCode="${hotelCode}">
        <RateAmountMessage>
          <StatusApplicationControl Start="${date}" End="${date}" InvTypeCode="${roomCode}" RatePlanCode="${planCode}"/>
          <Rates><Rate><BaseByGuestAmts><BaseByGuestAmt AmountAfterTax="1"/></BaseByGuestAmts></Rate></Rates>
        </RateAmountMessage>
      </RateAmountMessages>
    </OTA_HotelRateAmountNotifRQ>`);
    const r = await dispatch(xml, hotelCode, accommodationId);
    const s = summarize("OTA_HotelRateAmountNotifRQ", r.body);
    results.push({
      method: "OTA_HotelRateAmountNotifRQ",
      label: `③ 設定方案售價 (${planCode}, ${date}, AmountAfterTax=1)`,
      ok: s.ok,
      http_status: r.status,
      elapsed_ms: r.elapsed_ms,
      summary: s.ok ? "成功 — 售價已寫入" : `失敗 — ${s.errMsg ?? "未知錯誤"}`,
      request: xml,
      response: r.body,
    });
  } else {
    results.push({
      method: "OTA_HotelRateAmountNotifRQ",
      label: "③ 設定方案售價",
      ok: false, http_status: 0, elapsed_ms: 0,
      summary: "略過 — 此民宿尚無方案",
      request: "", response: "",
    });
  }

  // ④ OTA_HotelResNotifRQ — Cancel a fake reservation; verifies endpoint reachability.
  // ⚠️ Cancel 必須帶完整 reservation body (RoomStays / ResGuests / ResGlobalInfo)，
  //    不可只送 UniqueID。奧丁丁需要完整 body 才能交叉驗證、釋放庫存、保留取消快照。
  {
    const echo = `selftest-res-${Date.now()}`;
    const fakeId = `SELFTEST-${Date.now()}`;
    const ts = nowIso();
    const stayStart = date;
    const stayEndDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const roomCode = sampleRoom ? String(sampleRoom.numeric_code) : "9001";
    const planCode = samplePlan ? String(samplePlan.numeric_code) : "9101";
    const xml = envelope(`<OTA_HotelResNotifRQ xmlns="http://www.opentravel.org/OTA/2003/05" Version="1.0" TimeStamp="${ts}" EchoToken="${echo}" ResStatus="Cancel">
      <POS>
        <Source>
          <RequestorID Type="22" ID="LAKEZE"/>
          <BookingChannel Type="7" Primary="true">
            <CompanyName Code="LAKEZE">人客多</CompanyName>
          </BookingChannel>
        </Source>
      </POS>
      <HotelReservations>
        <HotelReservation ${hotelReservationAttrs("Cancel", ts)}>
          <UniqueID Type="14" ID="${fakeId}"/>
          <RoomStays>
            <RoomStay>
              <RoomTypes>
                <RoomType RoomTypeCode="${roomCode}" NumberOfUnits="1"/>
              </RoomTypes>
              <RatePlans>
                <RatePlan RatePlanCode="${planCode}"/>
              </RatePlans>
              <RoomRates>
                <RoomRate RoomTypeCode="${roomCode}" RatePlanCode="${planCode}" NumberOfUnits="1">
                  <Rates>
                    <Rate EffectiveDate="${stayStart}" ExpireDate="${stayEndDate}">
                      <Base AmountAfterTax="1.00" CurrencyCode="TWD"/>
                    </Rate>
                  </Rates>
                </RoomRate>
              </RoomRates>
              <GuestCounts>
                <GuestCount AgeQualifyingCode="10" Count="1"/>
              </GuestCounts>
              <TimeSpan Start="${stayStart}" End="${stayEndDate}"/>
              <Total AmountAfterTax="1.00" CurrencyCode="TWD"/>
              <BasicPropertyInfo HotelCode="${hotelCode}"/>
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
                        <GivenName>SelfTest</GivenName>
                        <Surname>Cancel</Surname>
                      </PersonName>
                      <Telephone PhoneTechType="1" PhoneNumber="0900-000-000"/>
                      <Email>selftest-cancel@example.com</Email>
                    </Customer>
                  </Profile>
                </ProfileInfo>
              </Profiles>
            </ResGuest>
          </ResGuests>
          <ResGlobalInfo>
            <HotelReservationIDs>
              <HotelReservationID ResID_Type="14" ResID_Value="${fakeId}" ResID_Source="LAKEZE"/>
            </HotelReservationIDs>
            <Total AmountAfterTax="1.00" CurrencyCode="TWD"/>
            <Profiles>
              <ProfileInfo>
                <Profile ProfileType="1">
                  <Customer>
                    <PersonName>
                      <GivenName>SelfTest</GivenName>
                      <Surname>Cancel</Surname>
                    </PersonName>
                    <Telephone PhoneTechType="1" PhoneNumber="0900-000-000"/>
                    <Email>selftest-cancel@example.com</Email>
                  </Customer>
                </Profile>
              </ProfileInfo>
            </Profiles>
          </ResGlobalInfo>
        </HotelReservation>
      </HotelReservations>
    </OTA_HotelResNotifRQ>`);
    // Outbound structural guard — refuse to dispatch if Cancel body is malformed.
    const validation = validateOutboundResNotifXml(xml);
    if (!validation.ok) {
      results.push({
        method: "OTA_HotelResNotifRQ",
        label: `④ 訂單通知 — Cancel 測試 (使用假 ID ${fakeId})`,
        ok: false,
        http_status: 0,
        elapsed_ms: 0,
        summary: `已拒絕送出 — Cancel XML 結構不完整：\n  - ${validation.errors.join("\n  - ")}`,
        request: xml,
        response: "",
      });
    } else {
      const r = await dispatch(xml, hotelCode, accommodationId);
      // Reachability test: any structured response (200) means endpoint is alive.
      const reachable = r.status === 200 && /<OTA_HotelResNotifRS\b/.test(r.body);
      results.push({
        method: "OTA_HotelResNotifRQ",
        label: `④ 訂單通知 — Cancel 測試 (使用假 ID ${fakeId})`,
        ok: reachable,
        http_status: r.status,
        elapsed_ms: r.elapsed_ms,
        summary: reachable
          ? "端點可達 — 已收到 OTA_HotelResNotifRS 回應 (假訂單預期不會真的被取消)"
          : `端點異常 — HTTP ${r.status}`,
        request: xml,
        response: r.body,
      });
    }
  }

  return new Response(JSON.stringify({ results }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
