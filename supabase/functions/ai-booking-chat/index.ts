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

    // 定義工具函數
    const tools = [
      {
        type: "function",
        name: "get_available_rooms",
        description: "查詢指定日期範圍內的可用房型和價格。請先詢問客戶入住和退房日期，然後呼叫此函數。",
        parameters: {
          type: "object",
          properties: {
            checkInDate: {
              type: "string",
              description: "入住日期，格式：YYYY-MM-DD"
            },
            checkOutDate: {
              type: "string",
              description: "退房日期，格式：YYYY-MM-DD"
            },
            accommodationId: {
              type: "string",
              description: "旅宿 ID"
            }
          },
          required: ["checkInDate", "checkOutDate", "accommodationId"]
        }
      },
      {
        type: "function",
        name: "check_discount_code",
        description: "驗證折扣碼是否有效",
        parameters: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "折扣碼"
            },
            accommodationId: {
              type: "string",
              description: "旅宿 ID"
            }
          },
          required: ["code", "accommodationId"]
        }
      },
      {
        type: "function",
        name: "create_booking",
        description: "創建訂單。只在收集完所有必要資訊後呼叫此函數：入住/退房日期、房型、客人姓名、電話、Email。",
        parameters: {
          type: "object",
          properties: {
            accommodationId: { type: "string" },
            roomTypeId: { type: "string" },
            checkInDate: { type: "string" },
            checkOutDate: { type: "string" },
            guestName: { type: "string" },
            guestPhone: { type: "string" },
            guestEmail: { type: "string" },
            guestCount: { type: "number" },
            discountCode: { type: "string" },
            notes: { type: "string" }
          },
          required: ["accommodationId", "roomTypeId", "checkInDate", "checkOutDate", "guestName", "guestPhone", "guestEmail", "guestCount"]
        }
      }
    ];

    // 系統提示詞
    const systemPrompt = `你是森山寫照的 AI 訂房助手。你的任務是協助客人完成線上訂房。

## 你的職責：
1. 友善且專業地與客人對話
2. 收集訂房必要資訊：入住/退房日期、人數、房型選擇、聯絡資訊
3. 回答關於旅宿的問題
4. 協助客人完成訂房流程

## 重要規則：
- 先詢問入住和退房日期，再使用 get_available_rooms 查詢可用房型
- 必須收集：姓名、電話（09開頭10碼）、Email
- 確認所有資訊無誤後，才呼叫 create_booking
- 如果客人提到折扣碼，使用 check_discount_code 驗證
- 保持對話自然、簡潔、有溫度

## 旅宿資訊：
- 名稱：森山寫照
- 特色：山林環抱、日式美學、管家服務、專業寫真
- 入住時間：15:00 後
- 退房時間：11:00 前

開始時請簡短問候並詢問客人的需求。`;

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
        tools: tools,
        tool_choice: "auto",
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

    // 處理工具呼叫的函數
    const handleToolCall = async (toolName: string, args: any) => {
      console.log(`執行工具: ${toolName}`, args);

      switch (toolName) {
        case "get_available_rooms": {
          const { data: roomTypes } = await supabase
            .from("room_types")
            .select(`
              id,
              name,
              name_en,
              description,
              capacity,
              size_sqm,
              weekday_2_meals_price,
              weekday_3_meals_price,
              weekend_2_meals_price,
              weekend_3_meals_price
            `)
            .eq("accommodation_id", args.accommodationId)
            .order("display_order");

          // 檢查日期範圍內是否有週末
          const checkIn = new Date(args.checkInDate);
          const checkOut = new Date(args.checkOutDate);
          const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
          
          let hasWeekend = false;
          for (let i = 0; i < nights; i++) {
            const date = new Date(checkIn);
            date.setDate(checkIn.getDate() + i);
            if (date.getDay() === 6) {
              hasWeekend = true;
              break;
            }
          }

          // 獲取國定假日
          const { data: holidays } = await supabase
            .from("public_holidays")
            .select("holiday_date")
            .eq("accommodation_id", args.accommodationId);

          const holidayDates = holidays?.map(h => h.holiday_date) || [];
          
          for (let i = 0; i < nights; i++) {
            const date = new Date(checkIn);
            date.setDate(checkIn.getDate() + i);
            const dateStr = date.toISOString().split('T')[0];
            if (holidayDates.includes(dateStr)) {
              hasWeekend = true;
              break;
            }
          }

          const availableRooms = roomTypes?.map(room => ({
            id: room.id,
            name: room.name,
            nameEn: room.name_en,
            description: room.description,
            capacity: room.capacity,
            size: room.size_sqm,
            pricing: {
              weekday2Meals: room.weekday_2_meals_price,
              weekday3Meals: room.weekday_3_meals_price,
              weekend2Meals: room.weekend_2_meals_price,
              weekend3Meals: room.weekend_3_meals_price,
            },
            hasWeekend
          })) || [];

          return JSON.stringify({
            success: true,
            rooms: availableRooms,
            nights,
            hasWeekend,
            message: `找到 ${availableRooms.length} 個可用房型`
          });
        }

        case "check_discount_code": {
          const { data: result } = await supabase
            .rpc('validate_discount_code', {
              p_code: args.code.toUpperCase(),
              p_accommodation_id: args.accommodationId
            });

          if (result && result.length > 0) {
            const validation = result[0];
            return JSON.stringify({
              success: validation.is_valid,
              discountType: validation.discount_type,
              discountValue: validation.discount_value,
              message: validation.message
            });
          }

          return JSON.stringify({
            success: false,
            message: "無法驗證折扣碼"
          });
        }

        case "create_booking": {
          // 生成訂單編號
          const { data: orderNumber } = await supabase.rpc('generate_order_number');
          
          // 計算住宿天數
          const checkIn = new Date(args.checkInDate);
          const checkOut = new Date(args.checkOutDate);
          const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

          // 獲取房型資訊
          const { data: roomType } = await supabase
            .from("room_types")
            .select("*")
            .eq("id", args.roomTypeId)
            .single();

          if (!roomType) {
            return JSON.stringify({
              success: false,
              message: "找不到指定的房型"
            });
          }

          // 計算價格（簡化版，實際需要考慮平日/週末）
          const basePrice = roomType.weekday_2_meals_price || roomType.base_price;
          const totalPrice = basePrice * nights;

          // 處理折扣
          let discountAmount = 0;
          let finalPrice = totalPrice;

          if (args.discountCode) {
            const { data: discountResult } = await supabase
              .rpc('validate_discount_code', {
                p_code: args.discountCode.toUpperCase(),
                p_accommodation_id: args.accommodationId,
                p_order_amount: totalPrice,
                p_room_type_id: args.roomTypeId,
                p_check_in_date: args.checkInDate
              });

            if (discountResult && discountResult.length > 0 && discountResult[0].is_valid) {
              const discount = discountResult[0];
              if (discount.discount_type === 'percentage') {
                discountAmount = Math.round(totalPrice * discount.discount_value / 100);
              } else {
                discountAmount = discount.discount_value;
              }
              finalPrice = totalPrice - discountAmount;
            }
          }

          // 創建或獲取客戶記錄
          const { data: existingCustomer } = await supabase
            .from("customers")
            .select("id")
            .eq("accommodation_id", args.accommodationId)
            .eq("phone", args.guestPhone)
            .maybeSingle();

          let customerId = existingCustomer?.id;

          if (!customerId) {
            const { data: newCustomer } = await supabase
              .from("customers")
              .insert({
                accommodation_id: args.accommodationId,
                name: args.guestName,
                phone: args.guestPhone,
                email: args.guestEmail,
                first_order_date: args.checkInDate
              })
              .select("id")
              .single();
            
            customerId = newCustomer?.id;
          }

          // 創建訂單
          const { data: order, error: orderError } = await supabase
            .from("orders")
            .insert({
              accommodation_id: args.accommodationId,
              room_type_id: args.roomTypeId,
              customer_id: customerId,
              order_number: orderNumber,
              check_in_date: args.checkInDate,
              check_out_date: args.checkOutDate,
              guest_name: args.guestName,
              guest_phone: args.guestPhone,
              guest_email: args.guestEmail,
              guest_count: args.guestCount,
              total_price: totalPrice,
              discount_amount: discountAmount,
              discount_code: args.discountCode || null,
              final_price: finalPrice,
              meal_plan: "2_meals",
              order_status: "pending",
              payment_status: "unpaid",
              notes: args.notes || null
            })
            .select()
            .single();

          if (orderError) {
            console.error("創建訂單失敗:", orderError);
            return JSON.stringify({
              success: false,
              message: "訂單創建失敗，請稍後再試"
            });
          }

          return JSON.stringify({
            success: true,
            orderNumber: order.order_number,
            totalPrice,
            discountAmount,
            finalPrice,
            message: `訂單已成功建立！訂單編號：${order.order_number}`
          });
        }

        default:
          return JSON.stringify({ error: "未知的工具" });
      }
    };

    // 建立 streaming response
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
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta;

                // 處理工具呼叫
                if (delta?.tool_calls) {
                  for (const toolCall of delta.tool_calls) {
                    const index = toolCall.index;
                    
                    if (!pendingToolCalls[index]) {
                      pendingToolCalls[index] = {
                        id: toolCall.id,
                        type: 'function',
                        function: { name: '', arguments: '' }
                      };
                    }

                    if (toolCall.function?.name) {
                      pendingToolCalls[index].function.name += toolCall.function.name;
                    }
                    if (toolCall.function?.arguments) {
                      pendingToolCalls[index].function.arguments += toolCall.function.arguments;
                    }
                  }
                }

                // 轉發文字內容
                if (delta?.content) {
                  controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                }

                // 檢查是否完成
                if (parsed.choices?.[0]?.finish_reason === 'tool_calls') {
                  // 執行所有工具呼叫
                  const toolResults = [];
                  for (const toolCall of pendingToolCalls.filter(Boolean)) {
                    const args = JSON.parse(toolCall.function.arguments);
                    const result = await handleToolCall(toolCall.function.name, args);
                    toolResults.push({
                      tool_call_id: toolCall.id,
                      result
                    });
                  }

                  // 發送工具結果給前端
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                    type: 'tool_calls_complete',
                    results: toolResults
                  })}\n\n`));
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
