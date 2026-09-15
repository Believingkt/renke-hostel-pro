import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limiting
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute

function checkRateLimit(identifier: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(identifier);
  
  if (!record || now > record.resetTime) {
    rateLimitMap.set(identifier, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  if (record.count >= RATE_LIMIT_MAX) return false;
  record.count++;
  return true;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Validate caller has a valid Supabase key (anon or authenticated)
    const authHeader = req.headers.get('authorization') || '';
    const apiKey = req.headers.get('apikey') || '';
    
    if (!authHeader && !apiKey) {
      return new Response(
        JSON.stringify({ error: '未授權的請求' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Rate limiting by IP or fallback identifier
    const clientIP = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    if (!checkRateLimit(clientIP)) {
      console.log('Rate limit exceeded for:', clientIP);
      return new Response(
        JSON.stringify({ error: '請求過於頻繁，請稍後再試' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { text, voice } = await req.json()

    if (!text) {
      throw new Error('未提供文字內容')
    }

    console.log('開始生成語音，文字長度:', text.length, '語音:', voice || 'nova')

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY 未設定')
    }

    // OpenAI TTS 語音選項: alloy, echo, fable, onyx, nova, shimmer
    // 使用 nova 作為預設，適合中文語音
    const selectedVoice = voice || 'nova'
    
    // 使用 OpenAI Text-to-Speech API（串流回傳，降低首字延遲）
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: selectedVoice,
        response_format: 'mp3',
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('OpenAI TTS API 錯誤:', response.status, errorText)
      throw new Error(`OpenAI TTS API error: ${errorText}`)
    }

    console.log('OpenAI 語音串流開始')

    // 直接把 MP3 串流回前端，省掉 buffer + base64
    return new Response(response.body, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('文字轉語音錯誤:', error)
    const errorMessage = error instanceof Error ? error.message : '未知錯誤'
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
