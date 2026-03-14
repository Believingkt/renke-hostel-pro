import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const API_URLS: Record<string, string> = {
  production: 'https://booking.taiwantravelmap.com/api/CIDDistributor.ashx',
  uat: 'https://booking.travelmap.com.tw/api/CIDDistributor.ashx',
};

// Helper: extract text from LanguageItem array (prefer zh-TW)
function getLocalizedText(items: any[], lang = 'zh-TW'): string {
  if (!Array.isArray(items)) return '';
  const match = items.find((i: any) => i.Language === lang) || items[0];
  return match?.text || match?.Text || '';
}

// Helper: extract address from AddressInfo array
function getLocalizedAddress(items: any[], lang = 'zh-TW'): string {
  if (!Array.isArray(items)) return '';
  const match = items.find((i: any) => i.Language === lang) || items[0];
  if (!match) return '';
  return [match.City, match.Area, match.Address].filter(Boolean).join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { accommodationId, checkIn, checkOut } = body;

    if (!accommodationId || !checkIn || !checkOut) {
      return new Response(
        JSON.stringify({ error: '缺少必要參數：accommodationId, checkIn, checkOut' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate date format YYYY-MM-DD and convert to YYYY/MM/DD for external API
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(checkIn) || !dateRegex.test(checkOut)) {
      return new Response(
        JSON.stringify({ error: '日期格式錯誤，請使用 YYYY-MM-DD' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get external mapping for this accommodation
    const { data: mapping, error: mappingError } = await supabase
      .from('external_hotel_mappings')
      .select('*')
      .eq('accommodation_id', accommodationId)
      .eq('is_enabled', true)
      .maybeSingle();

    if (mappingError || !mapping) {
      return new Response(
        JSON.stringify({ error: '此住宿尚未設定外部訂房平台串接' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get API credentials from secrets
    const accountId = Deno.env.get('EXTERNAL_BOOKING_ACCOUNT_ID');
    const password = Deno.env.get('EXTERNAL_BOOKING_PASSWORD');

    if (!accountId || !password) {
      console.error('Missing EXTERNAL_BOOKING_ACCOUNT_ID or EXTERNAL_BOOKING_PASSWORD');
      return new Response(
        JSON.stringify({ error: '外部訂房平台帳號尚未設定' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiUrl = API_URLS[mapping.api_environment] || API_URLS.production;
    const externalCheckIn = checkIn.replace(/-/g, '/');
    const externalCheckOut = checkOut.replace(/-/g, '/');

    console.log(`[External API] Calling SearchAll: CID=${mapping.cid_code}, CheckIn=${externalCheckIn}, CheckOut=${externalCheckOut}`);

    // Call external distribution API
    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'AccountID': accountId,
        'Password': password,
      },
      body: JSON.stringify({
        Control: 'SearchAll',
        CIDCode: mapping.cid_code,
        CheckIn: externalCheckIn,
        CheckOut: externalCheckOut,
      }),
    });

    if (!apiResponse.ok) {
      const errText = await apiResponse.text();
      console.error(`[External API] HTTP ${apiResponse.status}: ${errText}`);
      return new Response(
        JSON.stringify({ error: '外部訂房平台查詢失敗' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiData = await apiResponse.json();

    if (apiData.Status === false) {
      console.error(`[External API] Error: ${apiData.Message}`);
      return new Response(
        JSON.stringify({ error: apiData.Message || '外部平台查詢失敗' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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

    return new Response(
      JSON.stringify({
        success: true,
        checkIn,
        checkOut,
        hotels: result,
        totalHotels: result.length,
        totalRooms: result.reduce((sum: number, h: any) => sum + (h.rooms?.length || 0), 0),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[search-external-rooms] Error:', error);
    return new Response(
      JSON.stringify({ error: '系統錯誤，請稍後再試' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
