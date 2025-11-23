import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, accommodationId } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // 初始化 Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 定義工具（使用 Gemini 格式）
    const tools = [
      {
        type: "function",
        function: {
          name: "get_available_rooms",
          description: "查詢可用的房型和價格",
          parameters: {
            type: "object",
            properties: {
              check_in_date: {
                type: "string",
                description: "入住日期，格式：YYYY-MM-DD"
              },
              check_out_date: {
                type: "string",
                description: "退房日期，格式：YYYY-MM-DD"
              }
            },
            required: ["check_in_date", "check_out_date"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "check_discount_code",
          description: "驗證折扣碼是否有效",
          parameters: {
            type: "object",
            properties: {
              code: {
                type: "string",
                description: "折扣碼"
              }
            },
            required: ["code"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "create_booking",
          description: "創建訂單",
          parameters: {
            type: "object",
            properties: {
              guest_name: { type: "string", description: "客人姓名" },
              guest_phone: { type: "string", description: "客人手機" },
              guest_email: { type: "string", description: "客人 Email" },
              check_in_date: { type: "string", description: "入住日期 YYYY-MM-DD" },
              check_out_date: { type: "string", description: "退房日期 YYYY-MM-DD" },
              room_type_id: { type: "string", description: "房型 ID" },
              guest_count: { type: "number", description: "人數" },
              pet_count: { type: "number", description: "毛孩數量" },
              meal_plan: { type: "string", description: "餐食方案：breakfast_only 或 bbq" },
              discount_code: { type: "string", description: "折扣碼（選填）" },
              notes: { type: "string", description: "備註（選填）" }
            },
            required: ["guest_name", "guest_phone", "check_in_date", "check_out_date", "room_type_id", "guest_count"]
          }
        }
      }
    ];

    // 處理工具調用
    const handleToolCall = async (toolName: string, args: any) => {
      console.log(`執行工具: ${toolName}`, args);

      if (toolName === "get_available_rooms") {
        const { data: roomTypes } = await supabase
          .from('room_types')
          .select('*')
          .eq('accommodation_id', accommodationId)
          .order('display_order');
        
        return {
          rooms: roomTypes?.map(rt => ({
            id: rt.id,
            name: rt.name,
            capacity: rt.capacity,
            weekday_price: rt.weekday_2_meals_price,
            weekend_price: rt.weekend_2_meals_price,
            description: rt.description
          })) || []
        };
      }

      if (toolName === "check_discount_code") {
        const { data } = await supabase.rpc('validate_discount_code', {
          p_accommodation_id: accommodationId,
          p_code: args.code
        });
        
        return data?.[0] || { is_valid: false, message: "折扣碼無效" };
      }

      if (toolName === "create_booking") {
        // 生成訂單號
        const { data: orderNumber } = await supabase.rpc('generate_order_number');
        
        // 創建訂單
        const { data: order, error } = await supabase
          .from('orders')
          .insert({
            accommodation_id: accommodationId,
            order_number: orderNumber,
            guest_name: args.guest_name,
            guest_phone: args.guest_phone,
            guest_email: args.guest_email,
            check_in_date: args.check_in_date,
            check_out_date: args.check_out_date,
            room_type_id: args.room_type_id,
            guest_count: args.guest_count,
            pet_count: args.pet_count || 0,
            meal_plan: args.meal_plan,
            discount_code: args.discount_code,
            notes: args.notes,
            total_price: 0, // 需要計算
            final_price: 0,
            order_status: 'pending',
            payment_status: 'unpaid'
          })
          .select()
          .single();

        if (error) {
          console.error('創建訂單失敗:', error);
          return { success: false, message: "訂單創建失敗" };
        }

        return { success: true, order_number: orderNumber, order_id: order.id };
      }

      return { error: "未知的工具" };
    };

    // 系統提示詞
    const systemPrompt = `你是森山寫照的 AI 訂房助手。你可以直接幫助客人查詢房型和完成訂房。

## 你的能力：
1. 查詢可用房型和價格（使用 get_available_rooms）
2. 驗證折扣碼（使用 check_discount_code）
3. 直接創建訂單（使用 create_booking）

## 旅宿資訊：
- 名稱：森山寫照
- 特色：山林環抱、日式美學、管家服務、專業寫真攝影
- 入住時間：15:00 後
- 退房時間：11:00 前
- 地址：宜蘭縣冬山鄉大進三路208號
- 電話：0903-178-518

## 房型資訊：
1. 12人包區 - 三間房（四人房×3）- 平日一泊二食 $30,000
2. 14人包區 - 四間房（雙人房×1 + 四人房×3）- 平日一泊二食 $32,700
3. 16人包區 - 五間房（雙人房×2 + 四人房×3）- 平日一泊二食 $38,700
4. 18人包區 - 六間房（雙人房×3 + 四人房×3）- 平日一泊二食 $49,500

## 加購方案：
- 毛孩方案：每隻 $600/天（限兩隻，僅開放兩房）
- 烤肉餐：平日至少12人份，週末至少18人份，每人 $900

## 重要須知：
- 每天僅接待 1 組客人（包區制）
- 7-12歲孩童加價 $800（含早餐和設施）
- 0-6歲不加價（不提供早餐和備品）
- 13歲以上算成人
- 訂金30%，餘款入住時支付

## 對話流程：
1. 詢問入住和退房日期
2. 使用 get_available_rooms 查詢房型
3. 詢問客人基本資料（姓名、手機、Email）
4. 如有折扣碼，使用 check_discount_code 驗證
5. 確認所有資訊後，使用 create_booking 創建訂單

開始時請簡短問候並詢問入住日期。`;

    console.log("發送請求到 AI Gateway...");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages
        ],
        tools,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway 錯誤:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ 
          error: "使用量超過限制，請稍後再試" 
        }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      if (response.status === 402) {
        return new Response(JSON.stringify({ 
          error: "AI 服務需要充值，請聯絡管理員" 
        }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      throw new Error("AI Gateway 回應失敗");
    }


    // 建立 streaming response with tool handling
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let pendingToolCalls: any[] = [];

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.trim() || line.startsWith(':')) continue;
              if (!line.startsWith('data: ')) continue;

              const data = line.slice(6);
              if (data === '[DONE]') {
                // 處理待執行的工具
                if (pendingToolCalls.length > 0) {
                  const toolResults = await Promise.all(
                    pendingToolCalls.map(async (tc) => {
                      const result = await handleToolCall(tc.function.name, JSON.parse(tc.function.arguments));
                      return { tool_call_id: tc.id, result };
                    })
                  );

                  // 發送工具執行結果
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                    type: 'tool_calls_complete',
                    results: toolResults
                  })}\n\n`));
                }
                continue;
              }

              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta;

                // 處理工具調用
                if (delta?.tool_calls) {
                  pendingToolCalls.push(...delta.tool_calls);
                  continue;
                }

                // 轉發文字內容
                if (delta?.content) {
                  controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                }

              } catch (e) {
                console.error('解析 SSE 失敗:', e);
              }
            }
          }
        } catch (error) {
          console.error('Stream 處理錯誤:', error);
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "未知錯誤" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
