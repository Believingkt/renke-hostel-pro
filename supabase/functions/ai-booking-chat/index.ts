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

    // 先不使用工具調用，簡化實作
    const tools = undefined;

    // 系統提示詞
    const systemPrompt = `你是森山寫照的 AI 訂房助手。你的任務是協助客人完成線上訂房。

## 你的職責：
1. 友善且專業地與客人對話
2. 回答關於旅宿的問題
3. 引導客人到訂房頁面完成訂房

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

## 對話風格：
- 保持友善、專業、簡潔
- 適時使用 emoji 增加溫度
- 如果客人詢問訂房，請引導他們點擊「開始訂房」按鈕
- 回答問題時提供具體資訊，避免過於冗長

開始時請簡短問候並詢問可以如何協助。`;

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
