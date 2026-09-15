// Temporary diagnostic: send one email via Resend using RESEND_API_KEY_LAKEZE.
Deno.serve(async (req) => {
  const url = new URL(req.url);
  const to = url.searchParams.get("to") ?? "nokimi@gmail.com";
  const from = "人客多 <noreply@lakeze.com>";
  const key = Deno.env.get("RESEND_API_KEY_LAKEZE");
  if (!key) {
    return new Response(JSON.stringify({ ok: false, error: "RESEND_API_KEY_LAKEZE not configured" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "【人客多】Resend 直測 (auth-email-hook 走的路徑)",
      html: `<p>這是 Lovable agent 直接用 <code>RESEND_API_KEY_LAKEZE</code> 呼叫 Resend 的測試信。</p><p>寄件人：${from}</p><p>收件人：${to}</p>`,
      text: `Resend direct test. from=${from} to=${to}`,
    }),
  });
  const body = await resp.text();
  return new Response(JSON.stringify({ ok: resp.ok, status: resp.status, from, to, body }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
});
