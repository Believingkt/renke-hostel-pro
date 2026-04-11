import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { subdomain, domain } = await req.json();

    if (!subdomain || !domain) {
      return new Response(
        JSON.stringify({ 
          verified: false, 
          message: '缺少必要參數' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const fullDomain = `${subdomain}.${domain}`;
    
    // Use DNS over HTTPS (DoH) to query DNS records
    // We'll use Cloudflare's DNS API
    const dnsQueryUrl = `https://cloudflare-dns.com/dns-query?name=${fullDomain}&type=CNAME`;
    
    const dnsResponse = await fetch(dnsQueryUrl, {
      headers: {
        'Accept': 'application/dns-json'
      }
    });

    if (!dnsResponse.ok) {
      return new Response(
        JSON.stringify({ 
          verified: false, 
          message: 'DNS 查詢失敗，請稍後再試' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const dnsData = await dnsResponse.json();
    
    // Check if there are any CNAME answers
    if (dnsData.Answer && dnsData.Answer.length > 0) {
      const cnameRecords = dnsData.Answer.filter((record: any) => record.type === 5); // Type 5 = CNAME
      
      if (cnameRecords.length > 0) {
        const cnameTarget = cnameRecords[0].data.replace(/\.$/, ''); // Remove trailing dot
        
        // Check if the CNAME points to the correct domain
        if (cnameTarget === domain || cnameTarget.endsWith(`.${domain}`)) {
          return new Response(
            JSON.stringify({ 
              verified: true, 
              message: `DNS 設定正確！子網域 ${fullDomain} 已正確指向 ${domain}`,
              cnameTarget 
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } else {
          return new Response(
            JSON.stringify({ 
              verified: false, 
              message: `CNAME 記錄存在，但指向錯誤的目標。請將目標修改為 ${domain}`,
              cnameTarget 
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    // Also check A records as a fallback (in case CNAME was resolved)
    const aQueryUrl = `https://cloudflare-dns.com/dns-query?name=${fullDomain}&type=A`;
    const aResponse = await fetch(aQueryUrl, {
      headers: {
        'Accept': 'application/dns-json'
      }
    });

    if (aResponse.ok) {
      const aData = await aResponse.json();
      if (aData.Answer && aData.Answer.length > 0) {
        // Domain resolves to an IP, it might be configured correctly
        return new Response(
          JSON.stringify({ 
            verified: true, 
            message: `DNS 記錄已設定！${fullDomain} 已可解析。`,
            cnameTarget: domain
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // No DNS records found
    return new Response(
      JSON.stringify({ 
        verified: false, 
        message: `找不到 ${fullDomain} 的 DNS 記錄。請確認您已在 DNS 供應商處新增 CNAME 記錄，DNS 記錄可能需要最多 48 小時才能生效。`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('DNS verification error:', error);
    return new Response(
      JSON.stringify({ 
        verified: false, 
        message: '驗證過程發生錯誤，請稍後再試' 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
