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
    const { text, voice } = await req.json()

    if (!text) {
      throw new Error('未提供文字內容')
    }

    console.log('開始生成語音，文字長度:', text.length)

    // 使用 OpenAI TTS API 生成語音
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: voice || 'nova', // nova 語音適合中文
        response_format: 'mp3',
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('OpenAI TTS API 錯誤:', response.status, errorText)
      throw new Error(`OpenAI TTS API error: ${errorText}`)
    }

    // 將音頻轉換為 base64
    const arrayBuffer = await response.arrayBuffer()
    const base64Audio = btoa(
      String.fromCharCode(...new Uint8Array(arrayBuffer))
    )

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
