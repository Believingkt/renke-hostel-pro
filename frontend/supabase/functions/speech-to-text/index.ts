// 語音辨識：接收前端錄音（base64），轉送 Lovable AI Gateway 進行轉文字
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EXT_BY_MIME: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
};

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY 未設定" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => null);
    const audio: unknown = body?.audio;
    const mimeType: string = typeof body?.mimeType === "string" ? body.mimeType : "audio/webm";

    if (typeof audio !== "string" || audio.length < 100) {
      return new Response(JSON.stringify({ error: "錄音內容為空，請重新錄製" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bytes = base64ToBytes(audio);
    // 約 1KB 以下多半是空白／無聲錄音
    if (bytes.byteLength < 1024) {
      return new Response(JSON.stringify({ error: "錄音太短，請再說一次" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // 25MB 上限
    if (bytes.byteLength > 24 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: "錄音檔案過大，請縮短錄音時間" }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const baseMime = mimeType.split(";")[0].trim().toLowerCase();
    const ext = EXT_BY_MIME[baseMime] ?? "webm";

    const form = new FormData();
    form.append("model", "openai/gpt-4o-mini-transcribe");
    form.append("file", new Blob([bytes], { type: baseMime }), `recording.${ext}`);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(`語音辨識失敗 [${response.status}]: ${detail}`);
      const message =
        response.status === 429
          ? "語音辨識目前使用量過高，請稍後再試"
          : response.status === 402
            ? "AI 額度不足，請至工作區補充額度"
            : "語音辨識失敗，請重試或直接輸入文字";
      return new Response(JSON.stringify({ error: message, status: response.status, details: detail }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const text = (result?.text ?? "").trim();

    return new Response(JSON.stringify({ text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("speech-to-text 例外:", error);
    return new Response(JSON.stringify({ error: "語音處理發生錯誤，請重試" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
