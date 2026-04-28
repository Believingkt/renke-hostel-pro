import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GovernmentHoliday {
  date: string;  // YYYYMMDD format
  name: string;
  isHoliday: string;  // "是" or "否"
  holidayCategory: string;  // 放假之紀念日及節日, 補行上班日, etc.
  description: string;
}

interface TaiwanHoliday {
  date: string;  // YYYY-MM-DD format
  name: string;
  // 'holiday' = 國定假日 (放假); 'compensatory_day_off' = 補假; 'work_on_weekend' = 補班日
  type: 'holiday' | 'compensatory_day_off' | 'work_on_weekend';
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { year } = await req.json();
    
    if (!year || typeof year !== 'number') {
      return new Response(
        JSON.stringify({ error: '請提供有效的年份' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Fetching Taiwan holidays for year: ${year}`);

    // Taiwan government open data API for holidays
    // Data source: 政府資料開放平臺 - 政府行政機關辦公日曆表
    const apiUrl = `https://data.ntpc.gov.tw/api/datasets/308DCD75-6434-45BC-A95F-584DA4FED251/json?page=0&size=500`;
    
    let holidays: TaiwanHoliday[] = [];
    
    try {
      const response = await fetch(apiUrl, {
        headers: {
          'Accept': 'application/json',
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log(`Received ${data.length} records from government API`);
        
        // Filter and transform the data for the requested year
        const filteredData = data.filter((item: GovernmentHoliday) => {
          const itemYear = parseInt(item.date.substring(0, 4));
          return itemYear === year;
        });
        
        console.log(`Filtered to ${filteredData.length} records for year ${year}`);
        
        // Transform holidays (放假日)
        const holidayRecords = filteredData
          .filter((item: GovernmentHoliday) => 
            item.isHoliday === '是' && 
            (item.holidayCategory === '放假之紀念日及節日' || 
             item.holidayCategory.includes('放假'))
          )
          .filter((item: GovernmentHoliday) => 
            // Only include named holidays, not regular weekends
            item.name && 
            item.name !== '' && 
            !item.name.includes('星期')
          )
          .map((item: GovernmentHoliday) => ({
            date: `${item.date.substring(0, 4)}-${item.date.substring(4, 6)}-${item.date.substring(6, 8)}`,
            name: item.name,
            type: 'holiday' as const,
          }));
        
        // Transform workdays (補班日)
        const workdayRecords = filteredData
          .filter((item: GovernmentHoliday) => 
            item.isHoliday === '否' && 
            item.holidayCategory.includes('補行上班')
          )
          .map((item: GovernmentHoliday) => ({
            date: `${item.date.substring(0, 4)}-${item.date.substring(4, 6)}-${item.date.substring(6, 8)}`,
            name: item.name || '補班日',
            type: 'workday' as const,
          }));
        
        holidays = [...holidayRecords, ...workdayRecords];
        console.log(`Transformed to ${holidayRecords.length} holidays and ${workdayRecords.length} workdays`);
      }
    } catch (apiError) {
      console.error('Government API error:', apiError);
    }
    
    // If no data from API or API failed, use fallback hardcoded holidays
    if (holidays.length === 0) {
      console.log('Using fallback holiday data');
      holidays = getFallbackHolidays(year);
    }
    
    // Remove duplicates based on date
    const uniqueHolidays = Array.from(
      new Map(holidays.map(h => [h.date, h])).values()
    );
    
    console.log(`Returning ${uniqueHolidays.length} unique holidays`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        year,
        holidays: uniqueHolidays,
        source: holidays.length > 0 ? 'government_api' : 'fallback'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error fetching Taiwan holidays:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: '無法取得國定假日資料', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Fallback holiday data with proper lunar calendar dates for each year
function getFallbackHolidays(year: number): TaiwanHoliday[] {
  const lunarDates: Record<number, {
    springFestival: string[];
    dragonBoat: string;
    midAutumn: string;
    tombSweeping: string;
    compensatoryHolidays: { date: string; name: string }[];
  }> = {
    2024: {
      springFestival: ['02-08', '02-09', '02-10', '02-11', '02-12', '02-13', '02-14'],
      dragonBoat: '06-10',
      midAutumn: '09-17',
      tombSweeping: '04-04',
      compensatoryHolidays: [],
    },
    2025: {
      springFestival: ['01-27', '01-28', '01-29', '01-30', '01-31', '02-01', '02-02'],
      dragonBoat: '05-31',
      midAutumn: '10-06',
      tombSweeping: '04-04',
      compensatoryHolidays: [
        { date: '06-02', name: '端午節補假' },
      ],
    },
    2026: {
      springFestival: ['02-16', '02-17', '02-18', '02-19', '02-20', '02-21', '02-22'],
      dragonBoat: '06-19',
      midAutumn: '09-25',
      tombSweeping: '04-05',
      compensatoryHolidays: [
        { date: '04-06', name: '清明節補假' },
      ],
    },
    2027: {
      springFestival: ['02-05', '02-06', '02-07', '02-08', '02-09', '02-10', '02-11'],
      dragonBoat: '06-09',
      midAutumn: '09-15',
      tombSweeping: '04-05',
      compensatoryHolidays: [
        { date: '04-06', name: '清明節補假' },
      ],
    },
  };

  const lunar = lunarDates[year] || lunarDates[2025];
  
  const holidays: TaiwanHoliday[] = [
    // 固定假日
    { date: `${year}-01-01`, name: '元旦', type: 'holiday' },
    { date: `${year}-02-28`, name: '和平紀念日', type: 'holiday' },
    { date: `${year}-04-04`, name: '兒童節', type: 'holiday' },
    { date: lunar.tombSweeping ? `${year}-${lunar.tombSweeping}` : `${year}-04-05`, name: '清明節', type: 'holiday' },
    { date: `${year}-05-01`, name: '勞動節', type: 'holiday' },
    { date: `${year}-10-10`, name: '國慶日', type: 'holiday' },
    
    // 農曆假日 - 春節
    ...lunar.springFestival.map((date, index) => ({
      date: `${year}-${date}`,
      name: index === 0 ? '除夕' : `春節${['初一', '初二', '初三', '初四', '初五'][index - 1] || ''}`,
      type: 'holiday' as const,
    })),
    
    // 端午節
    { date: `${year}-${lunar.dragonBoat}`, name: '端午節', type: 'holiday' },
    
    // 中秋節
    { date: `${year}-${lunar.midAutumn}`, name: '中秋節', type: 'holiday' },

    // 補假日（國定假日遇週末之補假）
    ...(lunar.compensatoryHolidays || []).map(h => ({
      date: `${year}-${h.date}`,
      name: h.name,
      type: 'holiday' as const,
    })),
  ];

  return holidays;
}
