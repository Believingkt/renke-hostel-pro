/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl?: string
  token?: string
}

export const MagicLinkEmail = ({ siteName, token }: MagicLinkEmailProps) => (
  <Html lang="zh-Hant" dir="ltr">
    <Head>
      <meta charSet="utf-8" />
      <meta httpEquiv="Content-Type" content="text/html; charset=UTF-8" />
    </Head>
    <Preview>{token ? `您的登入驗證碼：${token}` : `${siteName} 登入驗證碼`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Heading style={brand}>人客多 Lakeze</Heading>
        </Section>
        <Section style={body}>
          <Text style={otp}>{token}</Text>
          <Text style={otpDesc}>使用此驗證碼登入您的帳號</Text>
          <Text style={otpHint}>驗證碼在寄發後的 10 分鐘內有效</Text>

          <Section style={notice}>
            <Text style={noticeTitle}>安全提醒</Text>
            <Text style={noticeText}>
              • 請勿將驗證碼轉發或告知任何人，包含自稱客服或平台人員。
            </Text>
            <Text style={noticeText}>
              • 我們不會以電話、簡訊或社群訊息向您索取驗證碼。
            </Text>
            <Text style={noticeText}>
              • 請直接回到您原本的訂房頁面輸入驗證碼，勿點擊他人提供的連結（可能為釣魚網站）。
            </Text>
            <Text style={noticeText}>
              • 若您並未要求此驗證碼，請不用理會這封信；您的帳號仍然安全。
            </Text>
          </Section>

          <Text style={footer}>請勿回覆此則訊息。寄發此則訊息的電子郵件地址無法接收電子郵件。</Text>
        </Section>
        <Section style={footerWrap}>
          <Text style={copyright}>© {new Date().getFullYear()} {siteName} Lakeze. All rights reserved.</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail

const main = { backgroundColor: '#ffffff', fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang TC', 'Microsoft JhengHei', Arial, sans-serif", WebkitTextSizeAdjust: '100%', textSizeAdjust: '100%' }
const container = { width: '100%', maxWidth: '560px', margin: '0 auto', padding: '0' }
const header = { background: 'linear-gradient(135deg,#d07218,#d47a0a)', padding: '24px 20px', textAlign: 'center' as const, borderRadius: '12px 12px 0 0' }
const brand = { color: '#ffffff', fontSize: '20px', fontWeight: 700 as const, letterSpacing: '1.5px', margin: 0, lineHeight: 1.4 }
const body = { padding: '28px 20px', color: '#2d3344', fontSize: '15px', lineHeight: 1.8 }
const otp = { textAlign: 'center' as const, fontSize: '32px', fontWeight: 700 as const, letterSpacing: '6px', color: '#2d3344', margin: '8px 0 12px', whiteSpace: 'nowrap' as const, lineHeight: 1.3 }
const otpDesc = { textAlign: 'center' as const, fontSize: '15px', color: '#2d3344', margin: '0 0 6px', lineHeight: 1.7, letterSpacing: '0.3px' }
const otpHint = { textAlign: 'center' as const, fontSize: '12px', color: '#999', margin: '0 0 24px', lineHeight: 1.6 }
const notice = { background: '#f7f8fa', borderRadius: '8px', padding: '16px' }
const noticeTitle = { fontSize: '15px', fontWeight: 700 as const, color: '#2d3344', margin: '0 0 8px', lineHeight: 1.6 }
const noticeText = { fontSize: '14px', color: '#4b5563', lineHeight: 1.8, margin: '0 0 6px', wordBreak: 'break-word' as const, letterSpacing: '0.3px', lineBreak: 'strict' as const }
const footer = { fontSize: '13px', color: '#999', margin: '24px 0 0', textAlign: 'center' as const, lineHeight: 1.7, wordBreak: 'break-word' as const }
const footerWrap = { background: '#fafafa', padding: '18px 20px', textAlign: 'center' as const, borderTop: '1px solid #eee', borderRadius: '0 0 12px 12px' }
const copyright = { color: '#999', fontSize: '12px', margin: 0, lineHeight: 1.7, wordBreak: 'break-word' as const }
