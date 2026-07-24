/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({ siteName, siteUrl, confirmationUrl }: InviteEmailProps) => (
  <Html lang="zh-Hant" dir="ltr">
    <Head />
    <Preview>您已被邀請加入 {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Heading style={brand}>人客多 Lakeze</Heading>
        </Section>
        <Section style={body}>
          <Heading style={h1}>您已被邀請加入{siteName}！</Heading>
          <Text style={text}>
            請點擊下方按鈕接受邀請並設定密碼以啟用您的帳號。
          </Text>
          <Button style={button} href={confirmationUrl}>接受邀請</Button>
          <Text style={linkFallback}>
            若按鈕無法點擊，請複製此連結至瀏覽器：<br />
            <Link href={confirmationUrl} style={link}>{confirmationUrl}</Link>
          </Text>
          <Text style={footer}>
            若您並未預期收到此邀請，可安全忽略此郵件。前往：<Link href={siteUrl} style={link}>{siteUrl}</Link>
          </Text>
        </Section>
        <Section style={footerWrap}>
          <Text style={copyright}>© {new Date().getFullYear()} {siteName} Lakeze. All rights reserved.</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail

const main = { backgroundColor: '#ffffff', fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang TC', 'Microsoft JhengHei', Arial, sans-serif" }
const container = { maxWidth: '560px', margin: '0 auto', padding: '0' }
const header = { background: 'linear-gradient(135deg,#d07218,#d47a0a)', padding: '28px 24px', textAlign: 'center' as const, borderRadius: '12px 12px 0 0' }
const brand = { color: '#ffffff', fontSize: '20px', fontWeight: 700 as const, letterSpacing: '2px', margin: 0 }
const body = { padding: '32px 28px', color: '#2d3344', fontSize: '15px', lineHeight: 1.7 }
const h1 = { fontSize: '22px', fontWeight: 700 as const, margin: '0 0 16px', color: '#2d3344' }
const text = { fontSize: '15px', color: '#6b7280', lineHeight: 1.7, margin: '0 0 20px' }
const button = { display: 'inline-block', backgroundColor: '#d07218', color: '#ffffff', fontSize: '16px', fontWeight: 600 as const, borderRadius: '8px', padding: '14px 36px', textDecoration: 'none', margin: '16px auto' }
const link = { color: '#d07218', wordBreak: 'break-all' as const }
const linkFallback = { fontSize: '12px', color: '#999', margin: '12px 0 24px', wordBreak: 'break-all' as const }
const footer = { fontSize: '13px', color: '#999', margin: '24px 0 0' }
const footerWrap = { background: '#fafafa', padding: '20px 28px', textAlign: 'center' as const, borderTop: '1px solid #eee', borderRadius: '0 0 12px 12px' }
const copyright = { color: '#999', fontSize: '12px', margin: 0 }
