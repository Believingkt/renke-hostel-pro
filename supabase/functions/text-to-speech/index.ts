import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { text, voice, speed } = await req.json()

    if (!text) {
      throw new Error('未提供文字內容')
    }

    console.log('開始生成語音，文字長度:', text.length, '速度:', speed || 1.0)

    // 使用 OpenAI TTS API 生成語音
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1-hd', // 使用高清版本，語音更自然
        input: text,
        voice: voice || 'nova', // nova 語音適合中文，聲音溫暖親切
        response_format: 'mp3',
        speed: speed || 0.95, // 稍微放慢一點，讓中文發音更清晰
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('OpenAI TTS API 錯誤:', response.status, errorText)
      throw new Error(`OpenAI TTS API error: ${errorText}`)
    }

    // 將音頻轉換為 base64（分塊處理避免堆疊溢位）
    const arrayBuffer = await response.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)
    
    // 分塊處理 base64 編碼，避免 Maximum call stack size exceeded
    let binaryString = ''
    const chunkSize = 8192 // 每次處理 8KB
    
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.slice(i, i + chunkSize)
      binaryString += String.fromCharCode.apply(null, Array.from(chunk))
    }
    
    const base64Audio = btoa(binaryString)

    console.log('語音生成成功，音頻大小:', arrayBuffer.byteLength, 'bytes')

    return new Response(
      JSON.stringify({ audioContent: base64Audio }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
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
