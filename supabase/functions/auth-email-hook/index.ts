import * as React from 'npm:react@18.3.1'
import { renderToStaticMarkup } from 'npm:react-dom@18.3.1/server'
import { htmlToText } from 'npm:html-to-text@9.0.5'
import { parseEmailWebhookPayload } from 'npm:@lovable.dev/email-js'
import { WebhookError, verifyWebhookRequest } from 'npm:@lovable.dev/webhooks-js'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { SignupEmail } from '../_shared/email-templates/signup.tsx'
import { InviteEmail } from '../_shared/email-templates/invite.tsx'
import { MagicLinkEmail } from '../_shared/email-templates/magic-link.tsx'
import { RecoveryEmail } from '../_shared/email-templates/recovery.tsx'
import { EmailChangeEmail } from '../_shared/email-templates/email-change.tsx'
import { ReauthenticationEmail } from '../_shared/email-templates/reauthentication.tsx'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-lovable-signature, x-lovable-timestamp, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

function buildSubject(type: string, token?: string): string {
  const codePart = token ? ` ${token}` : ''
  switch (type) {
    case 'signup': return `【人客多】您的註冊驗證碼${codePart}`
    case 'magiclink': return `【人客多】您的登入驗證碼${codePart}`
    case 'recovery': return `【人客多】重設您的密碼${codePart}`
    case 'invite': return '【人客多】您已被邀請加入'
    case 'email_change': return '【人客多】確認變更 Email'
    case 'reauthentication': return `【人客多】您的驗證碼${codePart}`
    default: return '【人客多】通知'
  }
}

const EMAIL_TEMPLATES: Record<string, React.ComponentType<any>> = {
  signup: SignupEmail,
  invite: InviteEmail,
  magiclink: MagicLinkEmail,
  recovery: RecoveryEmail,
  email_change: EmailChangeEmail,
  reauthentication: ReauthenticationEmail,
}

function encodeNonAsciiHtml(html: string): string {
  return html.replace(/[^\x00-\x7F]/g, (char) => {
    const codePoint = char.codePointAt(0)
    return codePoint ? `&#${codePoint};` : char
  })
}

function renderEmailHtml(element: React.ReactElement): string {
  // React Email 0.0.22's renderAsync/html-to-text path corrupts some CJK chars
  // in this template (e.g. 「忽」 -> �) before the email reaches Resend.
  // React DOM static rendering preserves the original UTF-8, then we entity-encode
  // non-ASCII before sending to protect the final transport/client rendering path.
  const html = renderToStaticMarkup(element)
  return `<!DOCTYPE html>${html}`
}

function renderEmailText(html: string): string {
  return htmlToText(html, {
    wordwrap: false,
    selectors: [
      { selector: 'a', options: { ignoreHref: false } },
      { selector: 'img', format: 'skip' },
    ],
  })
}

// Brand / sender configuration — Auth emails go DIRECT via Resend (RESEND_API_KEY_LAKEZE).
// Not routed through Lovable Emails queue to avoid double-sends.
const SITE_NAME = "人客多"
const SITE_URL = "https://booking.lakeze.com"
const FROM_ADDRESS = `${SITE_NAME} <noreply@lakeze.com>`

// Sample data for preview mode
const SAMPLE_EMAIL = "user@example.test"
const SAMPLE_DATA: Record<string, object> = {
  signup: { siteName: SITE_NAME, siteUrl: SITE_URL, recipient: SAMPLE_EMAIL, confirmationUrl: SITE_URL, token: '123456' },
  magiclink: { siteName: SITE_NAME, confirmationUrl: SITE_URL, token: '123456' },
  recovery: { siteName: SITE_NAME, confirmationUrl: SITE_URL, token: '123456' },
  invite: { siteName: SITE_NAME, siteUrl: SITE_URL, confirmationUrl: SITE_URL },
  email_change: { siteName: SITE_NAME, oldEmail: SAMPLE_EMAIL, email: SAMPLE_EMAIL, newEmail: SAMPLE_EMAIL, confirmationUrl: SITE_URL },
  reauthentication: { token: '123456' },
}

// Rewrite confirmation URLs to booking.lakeze.com regardless of Supabase Site URL.
function rewriteUrl(url?: string): string | undefined {
  if (!url) return url
  try {
    const u = new URL(url)
    u.protocol = 'https:'
    u.host = 'booking.lakeze.com'
    u.port = ''
    return u.toString()
  } catch {
    return url
  }
}

async function handlePreview(req: Request): Promise<Response> {
  const previewCorsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type',
  }
  if (req.method === 'OPTIONS') return new Response(null, { headers: previewCorsHeaders })

  const apiKey = Deno.env.get('LOVABLE_API_KEY')
  const authHeader = req.headers.get('Authorization')
  if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...previewCorsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let type: string
  try { type = (await req.json()).type } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { ...previewCorsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const EmailTemplate = EMAIL_TEMPLATES[type]
  if (!EmailTemplate) {
    return new Response(JSON.stringify({ error: `Unknown email type: ${type}` }), {
      status: 400, headers: { ...previewCorsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const html = renderEmailHtml(React.createElement(EmailTemplate, SAMPLE_DATA[type] || {}))
  return new Response(html, {
    status: 200, headers: { ...previewCorsHeaders, 'Content-Type': 'text/html; charset=utf-8' },
  })
}

async function sendViaResend(params: {
  to: string
  subject: string
  html: string
  text: string
}): Promise<{ ok: boolean; status: number; body: string; messageId?: string }> {
  const key = Deno.env.get('RESEND_API_KEY_LAKEZE')
  if (!key) {
    return { ok: false, status: 500, body: 'RESEND_API_KEY_LAKEZE not configured' }
  }
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [params.to],
      subject: params.subject.normalize('NFC'),
      html: encodeNonAsciiHtml(params.html.normalize('NFC')),
      text: params.text.normalize('NFC'),
    }),
  })
  const body = await resp.text()
  let messageId: string | undefined
  try { messageId = JSON.parse(body)?.id } catch {}
  return { ok: resp.ok, status: resp.status, body, messageId }
}

async function handleWebhook(req: Request): Promise<Response> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY')
  if (!apiKey) {
    console.error('LOVABLE_API_KEY not configured')
    return new Response(JSON.stringify({ error: 'Server configuration error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let payload: any
  try {
    const verified = await verifyWebhookRequest({ req, secret: apiKey, parser: parseEmailWebhookPayload })
    payload = verified.payload
  } catch (error) {
    if (error instanceof WebhookError) {
      console.error('Webhook verification failed', { code: error.code, message: error.message })
      const status = ['invalid_signature','missing_timestamp','invalid_timestamp','stale_timestamp'].includes(error.code) ? 401 : 400
      return new Response(JSON.stringify({ error: error.code }), {
        status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    console.error('Webhook verification error', { error })
    return new Response(JSON.stringify({ error: 'Invalid webhook payload' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const emailType = payload?.data?.action_type
  const recipient = payload?.data?.email
  const run_id = payload?.run_id
  const token = payload?.data?.token
  const rawUrl = payload?.data?.url
  const confirmationUrl = rewriteUrl(rawUrl)

  console.log('Auth event received', { emailType, recipient, run_id, hasToken: !!token, hasUrl: !!rawUrl })

  const EmailTemplate = EMAIL_TEMPLATES[emailType]
  if (!EmailTemplate) {
    console.error('Unknown email type', { emailType, run_id })
    return new Response(JSON.stringify({ error: `Unknown email type: ${emailType}` }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const templateProps = {
    siteName: SITE_NAME,
    siteUrl: SITE_URL,
    recipient,
    confirmationUrl,
    token,
    email: recipient,
    oldEmail: payload?.data?.old_email,
    newEmail: payload?.data?.new_email,
  }

  const html = renderEmailHtml(React.createElement(EmailTemplate, templateProps))
  const text = renderEmailText(html)
  const subject = buildSubject(emailType, token)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const localMessageId = crypto.randomUUID()

  // Log pending
  await supabase.from('email_send_log').insert({
    message_id: localMessageId,
    template_name: emailType,
    recipient_email: recipient,
    status: 'pending',
    metadata: { provider: 'resend', sender: 'lakeze.com', via: 'auth-email-hook-direct', run_id },
  })

  // Send via Resend directly
  const result = await sendViaResend({ to: recipient, subject, html, text })

  if (!result.ok) {
    console.error('Resend send failed', { status: result.status, body: result.body, emailType, recipient, run_id })
    await supabase.from('email_send_log').insert({
      message_id: localMessageId,
      template_name: emailType,
      recipient_email: recipient,
      status: 'failed',
      error_message: `resend ${result.status}: ${result.body.slice(0, 500)}`,
      metadata: { provider: 'resend', run_id },
    })
    return new Response(JSON.stringify({ error: 'Resend send failed', status: result.status }), {
      status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  console.log('Resend send ok', { status: result.status, resendId: result.messageId, emailType, recipient, run_id })

  await supabase.from('email_send_log').insert({
    message_id: localMessageId,
    template_name: emailType,
    recipient_email: recipient,
    status: 'sent',
    metadata: { provider: 'resend', resend_id: result.messageId, sender: 'lakeze.com', via: 'auth-email-hook-direct', run_id },
  })

  return new Response(JSON.stringify({ success: true, provider: 'resend', id: result.messageId }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (url.pathname.endsWith('/preview')) return handlePreview(req)
  try {
    return await handleWebhook(req)
  } catch (error) {
    console.error('Webhook handler error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
