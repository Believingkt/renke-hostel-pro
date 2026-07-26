/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
  token?: string
}

export const RecoveryEmail = ({ siteName, confirmationUrl, token }: RecoveryEmailProps) => (
  <Html lang="zh-Hant" dir="ltr">
    <Head>
      <meta charSet="utf-8" />
      <meta httpEquiv="Content-Type" content="text/html; charset=UTF-8" />
    </Head>
    <Preview>{token ? `您的密碼重設驗證碼：${token}` : `${siteName} 密碼重設連結`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Heading style={brand}>人客多 Lakeze</Heading>
        </Section>
        <Section style={body}>
          <Heading style={h1}>重設您的密碼</Heading>
          <Text style={text}>我們收到您在{siteName}的密碼重設請求。請使用下方驗證碼或點擊按鈕設定新密碼。</Text>
          {token && (
            <>
              <Text style={otpLabel}>您的 6 位數驗證碼</Text>
              <Text style={otp}>{token}</Text>
              <Text style={otpHint}>驗證碼將於 10 分鐘內失效</Text>
            </>
          )}
          {confirmationUrl && (
            <>
              <Button style={button} href={confirmationUrl}>重設密碼</Button>
              <Text style={linkFallback}>
                若按鈕無法點擊，請複製此連結至瀏覽器：<br />
                <Link href={confirmationUrl} style={link}>{confirmationUrl}</Link>
              </Text>
            </>
          )}
          <Text style={footer}>若您沒有申請重設密碼，請忽略此郵件，您的密碼不會被變更。</Text>
        </Section>
        <Section style={footerWrap}>
          <Text style={copyright}>© {new Date().getFullYear()} {siteName} Lakeze. All rights reserved.</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail

const main = { backgroundColor: '#ffffff', fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang TC', 'Microsoft JhengHei', Arial, sans-serif" }
const container = { maxWidth: '560px', margin: '0 auto', padding: '0' }
const header = { background: 'linear-gradient(135deg,#d07218,#d47a0a)', padding: '28px 24px', textAlign: 'center' as const, borderRadius: '12px 12px 0 0' }
const brand = { color: '#ffffff', fontSize: '20px', fontWeight: 700 as const, letterSpacing: '2px', margin: 0 }
const body = { padding: '32px 28px', color: '#2d3344', fontSize: '15px', lineHeight: 1.7 }
const h1 = { fontSize: '22px', fontWeight: 700 as const, margin: '0 0 16px', color: '#2d3344' }
const text = { fontSize: '15px', color: '#6b7280', lineHeight: 1.7, margin: '0 0 20px' }
const otpLabel = { textAlign: 'center' as const, fontSize: '14px', color: '#6b7280', margin: '8px 0 4px' }
const otp = { textAlign: 'center' as const, fontSize: '36px', fontWeight: 700 as const, letterSpacing: '12px', color: '#2d3344', background: '#fdf0e3', border: '1px solid #d0721833', borderRadius: '8px', padding: '20px', margin: '12px 0' }
const otpHint = { textAlign: 'center' as const, fontSize: '12px', color: '#999', margin: '0 0 20px' }
const button = { display: 'inline-block', backgroundColor: '#d07218', color: '#ffffff', fontSize: '16px', fontWeight: 600 as const, borderRadius: '8px', padding: '14px 36px', textDecoration: 'none', margin: '16px auto' }
const link = { color: '#d07218', wordBreak: 'break-all' as const }
const linkFallback = { fontSize: '12px', color: '#999', margin: '12px 0 24px', wordBreak: 'break-all' as const }
const footer = { fontSize: '13px', color: '#999', margin: '24px 0 0' }
const footerWrap = { background: '#fafafa', padding: '20px 28px', textAlign: 'center' as const, borderTop: '1px solid #eee', borderRadius: '0 0 12px 12px' }
const copyright = { color: '#999', fontSize: '12px', margin: 0 }
