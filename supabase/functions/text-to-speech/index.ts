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

    console.log('開始生成語音，文字長度:', text.length, '語音:', voice || 'Aria')

    const ELEVEN_LABS_API_KEY = Deno.env.get('ELEVEN_LABS_API_KEY')
    if (!ELEVEN_LABS_API_KEY) {
      throw new Error('ELEVEN_LABS_API_KEY 未設定')
    }

    // ElevenLabs 語音 ID (使用中文母語者聲音)
    const voiceId = voice || 'kGjJqO6wdwRN9iJsoeIC'
    
    // 使用 ElevenLabs Text-to-Speech API
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVEN_LABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_multilingual_v2', // 支援多語言的高品質模型
        voice_settings: {
          stability: 0.7,           // 更高的穩定性，確保發音清晰一致
          similarity_boost: 0.8,    // 提高相似度，保持語音特徵
          style: 0.0,               // 不增加額外風格化
          use_speaker_boost: true   // 增強說話者特徵
        }
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('ElevenLabs TTS API 錯誤:', response.status, errorText)
      throw new Error(`ElevenLabs TTS API error: ${errorText}`)
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

    console.log('ElevenLabs 語音生成成功，音頻大小:', arrayBuffer.byteLength, 'bytes')

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
