/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
  token?: string
}

export const MagicLinkEmail = ({ siteName, confirmationUrl, token }: MagicLinkEmailProps) => (
  <Html lang="zh-Hant" dir="ltr">
    <Head />
    <Preview>{token ? `您的登入驗證碼：${token}` : `${siteName} 快速登入連結`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Heading style={brand}>人客多 Lakeze</Heading>
        </Section>
        <Section style={body}>
          <Heading style={h1}>快速登入{siteName}</Heading>
          <Text style={text}>請於結帳頁面輸入以下 6 位數驗證碼完成登入，或點擊按鈕直接登入。</Text>
          {token && (
            <>
              <Text style={otpLabel}>您的 6 位數驗證碼</Text>
              <Text style={otp}>{token}</Text>
              <Text style={otpHint}>驗證碼將於 10 分鐘內失效</Text>
            </>
          )}
          {confirmationUrl && (
            <>
              <Button style={button} href={confirmationUrl}>直接登入</Button>
              <Text style={linkFallback}>
                若按鈕無法點擊，請複製此連結至瀏覽器：<br />
                <Link href={confirmationUrl} style={link}>{confirmationUrl}</Link>
              </Text>
            </>
          )}
          <Text style={footer}>若非本人操作，請忽略此郵件。</Text>
        </Section>
        <Section style={footerWrap}>
          <Text style={copyright}>© {new Date().getFullYear()} {siteName} Lakeze. All rights reserved.</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail

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
