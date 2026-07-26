/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
  token?: string
}

export const SignupEmail = ({ siteName, siteUrl, recipient, confirmationUrl, token }: SignupEmailProps) => (
  <Html lang="zh-Hant" dir="ltr">
    <Head />
    <Preview>{`註冊成功，請驗證您的電子郵件`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Heading style={brand}>人客多 Lakeze</Heading>
        </Section>
        <Section style={body}>
          <Heading style={h1}>註冊成功</Heading>
          <Text style={text}>
            感謝您加入成為 {siteName} 會員！請在 7 天內驗證您的電子郵件，以完成帳號設定。
          </Text>
          {confirmationUrl && (
            <Section style={btnWrap}>
              <Button style={button} href={confirmationUrl}>驗證我的電子郵件</Button>
            </Section>
          )}
          {token && (
            <>
              <Text style={otpLabel}>或於結帳頁面輸入 6 位數驗證碼</Text>
              <Text style={otp}>{token}</Text>
              <Text style={otpHint}>驗證碼將於 10 分鐘內失效</Text>
            </>
          )}

          <Hr style={hr} />

          <Heading style={h2}>還沒註冊？</Heading>
          <Text style={text}>
            別擔心 — 可能是其他用戶不小心輸入了您的電子郵件地址（{recipient}）。您可以直接忽略這封信，未經驗證的帳號不會啟用。請注意：此連結有效期限為 7 天。
          </Text>

          {confirmationUrl && (
            <Text style={linkFallback}>
              若按鈕無法點擊，請複製此連結至瀏覽器：<br />
              <Link href={confirmationUrl} style={link}>{confirmationUrl}</Link>
            </Text>
          )}

          <Section style={notice}>
            <Text style={noticeText}>請勿回覆此則訊息。寄發此則訊息的電子郵件地址無法接收電子郵件。</Text>
          </Section>
        </Section>
        <Section style={footerWrap}>
          <Text style={copyright}>由於此封電子郵件包含您的個人資料與訂單細節，因此請勿轉發。</Text>
          <Text style={copyright}>© {new Date().getFullYear()} {siteName} Lakeze. All rights reserved.</Text>
          {siteUrl && <Link href={siteUrl} style={link}>{siteUrl}</Link>}
        </Section>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail

const main = { backgroundColor: '#ffffff', fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang TC', 'Microsoft JhengHei', Arial, sans-serif" }
const container = { maxWidth: '560px', margin: '0 auto', padding: '0' }
const header = { background: 'linear-gradient(135deg,#d07218,#d47a0a)', padding: '28px 24px', textAlign: 'center' as const, borderRadius: '12px 12px 0 0' }
const brand = { color: '#ffffff', fontSize: '20px', fontWeight: 700 as const, letterSpacing: '2px', margin: 0 }
const body = { padding: '32px 28px', color: '#2d3344', fontSize: '15px', lineHeight: 1.7 }
const h1 = { fontSize: '26px', fontWeight: 700 as const, margin: '0 0 16px', color: '#2d3344', textAlign: 'center' as const }
const h2 = { fontSize: '18px', fontWeight: 700 as const, margin: '0 0 12px', color: '#2d3344', textAlign: 'center' as const }
const text = { fontSize: '15px', color: '#6b7280', lineHeight: 1.7, margin: '0 0 20px', textAlign: 'center' as const }
const btnWrap = { textAlign: 'center' as const, margin: '8px 0 20px' }
const otpLabel = { textAlign: 'center' as const, fontSize: '14px', color: '#6b7280', margin: '8px 0 4px' }
const otp = { textAlign: 'center' as const, fontSize: '32px', fontWeight: 700 as const, letterSpacing: '10px', color: '#2d3344', background: '#fdf0e3', border: '1px solid #d0721833', borderRadius: '8px', padding: '18px', margin: '12px 0' }
const otpHint = { textAlign: 'center' as const, fontSize: '12px', color: '#999', margin: '0 0 12px' }
const hr = { borderColor: '#eeeeee', margin: '8px 0 24px' }
const button = { display: 'inline-block', backgroundColor: '#d07218', color: '#ffffff', fontSize: '16px', fontWeight: 600 as const, borderRadius: '8px', padding: '14px 36px', textDecoration: 'none' }
const link = { color: '#d07218', wordBreak: 'break-all' as const, fontSize: '12px' }
const linkFallback = { fontSize: '12px', color: '#999', margin: '12px 0 24px', wordBreak: 'break-all' as const, textAlign: 'center' as const }
const notice = { background: '#f7f8fa', borderRadius: '8px', padding: '16px' }
const noticeText = { fontSize: '13px', color: '#6b7280', margin: 0, textAlign: 'center' as const }
const footerWrap = { background: '#fafafa', padding: '20px 28px', textAlign: 'center' as const, borderTop: '1px solid #eee', borderRadius: '0 0 12px 12px' }
const copyright = { color: '#999', fontSize: '12px', margin: '0 0 6px' }
