// Shared TravelMap (台灣旅宿地圖) external room search core.
//
// Behavior-preserving extraction from `search-external-rooms/index.ts` so that
// the public booking search and the admin-only connection test share exactly
// one implementation. Nothing in here changes request payloads, external API
// parameters, mapping lookup, availability semantics or response shape.
//
// deno-lint-ignore-file no-explicit-any

// fetchViaProxy 已抽到 staticIpProxy.ts（與 PAYUNi 共用），此處 re-export 以維持既有匯入點
import { fetchViaProxy } from './staticIpProxy.ts';
export { fetchViaProxy };

const API_URLS: Record<string, string> = {
  production: 'https://booking.taiwantravelmap.com/api/CIDDistributor.ashx',
  uat: 'https://booking.travelmap.com.tw/api/CIDDistributor.ashx',
};

// Helper: extract text from LanguageItem array (prefer zh-TW)
export function getLocalizedText(items: any[], lang = 'zh-TW'): string {
  if (!Array.isArray(items)) return '';
  const match = items.find((i: any) => i.Language === lang) || items[0];
  return match?.text || match?.Text || '';
}

// Helper: extract address from AddressInfo array
export function getLocalizedAddress(items: any[], lang = 'zh-TW'): string {
  if (!Array.isArray(items)) return '';
  const match = items.find((i: any) => i.Language === lang) || items[0];
  if (!match) return '';
  return [match.City, match.Area, match.Address].filter(Boolean).join('');
}

export interface ExternalRoomsSearchInput {
  accommodationId: unknown;
  checkIn: unknown;
  checkOut: unknown;
}

export interface ExternalRoomsSearchResult {
  status: number;
  body: Record<string, any>;
}

/**
 * Run the TravelMap SearchAll flow for one accommodation.
 * Performs zero DB writes. Credentials are read server-side only and are never
 * included in the returned body.
 */
export async function runExternalRoomsSearch(
  supabase: any,
  input: ExternalRoomsSearchInput,
): Promise<ExternalRoomsSearchResult> {
  const { accommodationId, checkIn, checkOut } = input as {
    accommodationId: string; checkIn: string; checkOut: string;
  };

  if (!accommodationId || !checkIn || !checkOut) {
    return { status: 400, body: { error: '缺少必要參數：accommodationId, checkIn, checkOut' } };
  }

  // Validate date format YYYY-MM-DD and convert to YYYY/MM/DD for external API
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(checkIn) || !dateRegex.test(checkOut)) {
    return { status: 400, body: { error: '日期格式錯誤，請使用 YYYY-MM-DD' } };
  }

  // Get external mapping for this accommodation
  const { data: mapping, error: mappingError } = await supabase
    .from('external_hotel_mappings')
    .select('*')
    .eq('accommodation_id', accommodationId)
    .eq('is_enabled', true)
    .maybeSingle();

  if (mappingError || !mapping) {
    return { status: 404, body: { error: '此住宿尚未設定外部訂房平台串接' } };
  }

  // Get API credentials from secrets (prefer TAIWAN_TRAVELMAP_*, fallback to legacy EXTERNAL_BOOKING_*)
  const accountId = Deno.env.get('TAIWAN_TRAVELMAP_ACCOUNT_ID') || Deno.env.get('EXTERNAL_BOOKING_ACCOUNT_ID');
  const password = Deno.env.get('TAIWAN_TRAVELMAP_PASSWORD') || Deno.env.get('EXTERNAL_BOOKING_PASSWORD');
  // Allow secret-based default CID (overrides mapping when mapping.cid_code is empty)
  const defaultCid = Deno.env.get('TAIWAN_TRAVELMAP_CID');
  const cidCode = mapping.cid_code || defaultCid;
  if (!cidCode) {
    return { status: 500, body: { error: '尚未設定 CIDCode' } };
  }

  if (!accountId || !password) {
    console.error('Missing EXTERNAL_BOOKING_ACCOUNT_ID or EXTERNAL_BOOKING_PASSWORD');
    return { status: 500, body: { error: '外部訂房平台帳號尚未設定' } };
  }

  const apiUrl = API_URLS[mapping.api_environment] || API_URLS.production;
  const externalCheckIn = checkIn.replace(/-/g, '/');
  const externalCheckOut = checkOut.replace(/-/g, '/');

  console.log(`[External API] SearchAll: CID=${cidCode}, CheckIn=${externalCheckIn}, CheckOut=${externalCheckOut}, env=${mapping.api_environment}`);

  const apiResponse = await fetchViaProxy(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'AccountID': accountId,
      'Password': password,
    },
    body: JSON.stringify({
      Control: 'SearchAll',
      CIDCode: cidCode,
      CheckIn: externalCheckIn,
      CheckOut: externalCheckOut,
    }),
  });

  if (!apiResponse.ok) {
    const errText = await apiResponse.text();
    console.error(`[External API] HTTP ${apiResponse.status}: ${errText}`);
    return { status: 502, body: { error: '外部訂房平台查詢失敗' } };
  }

  const apiData = await apiResponse.json();

  if (apiData.Status === false) {
    console.error(`[External API] Error: ${apiData.Message}`);
    return { status: 502, body: { error: apiData.Message || '外部平台查詢失敗' } };
  }

  // Parse and filter results
  const hotels = apiData.HostelList || [];

  // If hotel_code is set, filter for specific hotel; otherwise return all
  const filteredHotels = mapping.hotel_code
    ? hotels.filter((h: any) => h.Code === mapping.hotel_code)
    : hotels;

  // Transform to simplified format for AI consumption
  const result = filteredHotels.map((hotel: any) => ({
    hotelCode: hotel.Code,
    name: getLocalizedText(hotel.Name),
    description: getLocalizedText(hotel.Description),
    address: getLocalizedAddress(hotel.Address),
    email: hotel.Email,
    phone: hotel.Phone,
    bookingUrl: hotel.BookingURL,
    photos: (hotel.Photo || []).map((p: any) => p.URL).filter(Boolean),
    amenities: (hotel.Amenities || []).map((a: any) => getLocalizedText([a])).filter(Boolean),
    checkInTime: (hotel.CheckInStartTime || []).map((t: any) => `${t.Type}: ${t.Time}`),
    checkOutTime: (hotel.CheckOutEndTime || []).map((t: any) => `${t.Type}: ${t.Time}`),
    rooms: (hotel.Rooms || []).map((room: any) => ({
      code: room.Code,
      name: getLocalizedText(room.Name),
      description: getLocalizedText(room.Description),
      rateName: getLocalizedText(room.RateName),
      rateDescription: getLocalizedText(room.RateDescription),
      maxOccupancy: room.MaxOccupancy,
      baseOccupancy: room.BaseOccupancy,
      inventoryCount: room.InventoryCount,
      count: room.Count,
      checkIn: room.CheckIn,
      checkOut: room.CheckOut,
      minStayDays: room.MinStayDays,
      maxStayDays: room.MaxStayDays,
      bookingUrl: room.BookingURL,
      totalPrice: room.TotalPrice?.MoneyDetail ? {
        beforeTax: room.TotalPrice.MoneyDetail.AmountBeforeTax,
        afterTax: room.TotalPrice.MoneyDetail.AmountAfterTax,
        currency: room.TotalPrice.MoneyDetail.CurrencyCode || 'TWD',
      } : null,
      beds: (room.BedConfigurations || []).map((bed: any) => ({
        description: getLocalizedText(bed.Description),
        quantity: bed.Quantity,
      })),
      additionalGuest: (room.AdditionalGuest || []).map((ag: any) => ({
        ageCode: ag.AgeCode,
        amount: ag.Amount,
        currency: ag.CurrencyCode || 'TWD',
      })),
      photos: (room.Photo || []).map((p: any) => p.URL).filter(Boolean),
      amenities: (room.Amenities || []).map((a: any) => getLocalizedText([a])).filter(Boolean),
    })),
  }));

  return {
    status: 200,
    body: {
      success: true,
      checkIn,
      checkOut,
      hotels: result,
      totalHotels: result.length,
      totalRooms: result.reduce((sum: number, h: any) => sum + (h.rooms?.length || 0), 0),
    },
  };
}
