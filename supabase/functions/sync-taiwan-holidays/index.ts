import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'npm:zod';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const BodySchema = z.object({
  years: z.array(z.number().int().min(2000).max(2100)).min(1).max(5),
});

const HolidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().min(1),
  type: z.string().min(1),
});

const HolidayResponseSchema = z.object({
  success: z.boolean(),
  year: z.number().int(),
  holidays: z.array(HolidaySchema),
  source: z.string().optional(),
});

type HolidayRecord = z.infer<typeof HolidaySchema>;

const normalizeHolidayType = (type: string) => {
  if (type === 'workday') return 'work_on_weekend';
  if (type === 'compensatory_day_off') return 'compensatory_day_off';
  return 'holiday';
};

// 同一日期僅保留一筆，優先級：補班 > 補假 > 一般國定假日，避免衝突
const TYPE_PRIORITY: Record<string, number> = {
  work_on_weekend: 0,
  compensatory_day_off: 1,
  holiday: 2,
};

const getUniqueHolidays = (holidays: HolidayRecord[]) => {
  const uniqueByDate = new Map<string, HolidayRecord>();

  for (const holiday of holidays) {
    const normalized: HolidayRecord = {
      ...holiday,
      type: normalizeHolidayType(holiday.type),
    };
    const existing = uniqueByDate.get(holiday.date);
    if (
      !existing ||
      (TYPE_PRIORITY[normalized.type] ?? 99) < (TYPE_PRIORITY[existing.type] ?? 99)
    ) {
      uniqueByDate.set(holiday.date, normalized);
    }
  }

  return Array.from(uniqueByDate.values()).sort((a, b) => a.date.localeCompare(b.date));
};

const fetchHolidaysForYear = async (year: number, supabaseUrl: string, anonKey: string) => {
  const response = await fetch(`${supabaseUrl}/functions/v1/fetch-taiwan-holidays`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ year }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`fetch-taiwan-holidays failed for ${year}: ${errorText}`);
  }

  const parsed = HolidayResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error(`Invalid holiday response for ${year}`);
  }

  return getUniqueHolidays(parsed.data.holidays);
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = BodySchema.safeParse(await req.json());
    if (!body.success) {
      return new Response(JSON.stringify({ error: body.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      throw new Error('Missing backend configuration');
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: userRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('accommodation_id, role')
      .eq('user_id', user.id)
      .in('role', ['super_admin', 'hotel_admin']);

    if (rolesError) {
      throw new Error(`Failed to load user roles: ${rolesError.message}`);
    }

    const accommodationIds = Array.from(
      new Set((userRoles ?? []).map((role) => role.accommodation_id).filter(Boolean))
    );

    if (accommodationIds.length === 0) {
      return new Response(JSON.stringify({ error: 'Insufficient permissions' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: accommodations, error: accommodationsError } = await supabase
      .from('accommodation_info')
      .select('id, name')
      .in('id', accommodationIds)
      .eq('is_active', true)
      .order('display_order');

    if (accommodationsError) {
      throw new Error(`Failed to load accommodations: ${accommodationsError.message}`);
    }

    if (!accommodations || accommodations.length === 0) {
      return new Response(JSON.stringify({ error: 'No active accommodations found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let totalSynced = 0;
    const results: Array<{ year: number; accommodation_id: string; inserted: number }> = [];

    for (const year of body.data.years) {
      const holidays = await fetchHolidaysForYear(year, supabaseUrl, anonKey);

      for (const accommodation of accommodations) {
        // 先刪除該年範圍內、不在本次來源中的舊紀錄（處理政府公告變更/撤回的情境）
        const incomingDates = holidays.map((h) => h.date);
        let staleQuery = supabase
          .from('public_holidays')
          .delete()
          .eq('accommodation_id', accommodation.id)
          .gte('holiday_date', `${year}-01-01`)
          .lte('holiday_date', `${year}-12-31`);

        if (incomingDates.length > 0) {
          staleQuery = staleQuery.not('holiday_date', 'in', `(${incomingDates.map((d) => `"${d}"`).join(',')})`);
        }

        const { error: staleError } = await staleQuery;
        if (staleError) {
          throw new Error(`Failed to clear stale holidays for ${accommodation.name}: ${staleError.message}`);
        }

        if (holidays.length > 0) {
          const holidaysToUpsert = holidays.map((holiday) => ({
            accommodation_id: accommodation.id,
            holiday_date: holiday.date,
            holiday_name: holiday.name,
            holiday_type: holiday.type,
          }));

          // Upsert by (accommodation_id, holiday_date) — 依賴 unique constraint 防重複
          const { error: upsertError } = await supabase
            .from('public_holidays')
            .upsert(holidaysToUpsert, { onConflict: 'accommodation_id,holiday_date' });

          if (upsertError) {
            throw new Error(`Failed to upsert holidays for ${accommodation.name}: ${upsertError.message}`);
          }

          totalSynced += holidaysToInsert.length;
          results.push({
            year,
            accommodation_id: accommodation.id,
            inserted: holidaysToInsert.length,
          });
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        years: body.data.years,
        totalSynced,
        accommodationsCount: accommodations.length,
        results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('sync-taiwan-holidays error:', message);

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
