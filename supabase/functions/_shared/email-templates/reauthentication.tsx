/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="zh-Hant" dir="ltr">
    <Head />
    <Preview>您的驗證碼：{token}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Heading style={brand}>人客多 Lakeze</Heading>
        </Section>
        <Section style={body}>
          <Heading style={h1}>您的驗證碼</Heading>
          <Text style={text}>請使用以下 6 位數驗證碼完成身份驗證：</Text>
          <Text style={otpLabel}>您的 6 位數驗證碼</Text>
          <Text style={otp}>{token}</Text>
          <Text style={otpHint}>驗證碼將於 10 分鐘內失效</Text>
          <Text style={footer}>若非本人操作，請忽略此郵件。</Text>
        </Section>
        <Section style={footerWrap}>
          <Text style={copyright}>© {new Date().getFullYear()} 人客多 Lakeze. All rights reserved.</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

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
const footer = { fontSize: '13px', color: '#999', margin: '24px 0 0' }
const footerWrap = { background: '#fafafa', padding: '20px 28px', textAlign: 'center' as const, borderTop: '1px solid #eee', borderRadius: '0 0 12px 12px' }
const copyright = { color: '#999', fontSize: '12px', margin: 0 }
