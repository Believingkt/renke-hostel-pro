/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text,
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
    <Head>
      <meta charSet="utf-8" />
      <meta httpEquiv="Content-Type" content="text/html; charset=UTF-8" />
    </Head>
    <Preview>{`註冊成功，請驗證您的電子郵件`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Heading style={brand}>人客多 Lakeze</Heading>
        </Section>
        <Section style={body}>
          <Heading style={h1}>註冊成功</Heading>
          <Text style={text}>
            感謝您加入成為 {siteName} 會員！請於結帳頁面輸入以下 6 位數驗證碼，以完成帳號驗證。
          </Text>
          {token && (
            <>
              <Text style={otpLabel}>您的註冊驗證碼</Text>
              <Text style={otp}>{token}</Text>
              <Text style={otpHint}>驗證碼將於 10 分鐘內失效</Text>
            </>
          )}

          <Hr style={hr} />

          <Heading style={h2}>不是您本人操作？</Heading>
          <Text style={text}>
            可能是其他人不小心輸入了您的電子郵件地址（{recipient}）。請忽略本信，未完成驗證的帳號不會啟用，也無法用來訂房。
          </Text>
          <Text style={text}>
            請勿將此驗證碼提供給任何人，{siteName} 客服不會主動向您索取驗證碼。
          </Text>


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

const main = { backgroundColor: '#ffffff', fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang TC', 'Microsoft JhengHei', Arial, sans-serif", WebkitTextSizeAdjust: '100%', textSizeAdjust: '100%' }
const container = { width: '100%', maxWidth: '560px', margin: '0 auto', padding: '0' }
const header = { background: 'linear-gradient(135deg,#d07218,#d47a0a)', padding: '24px 20px', textAlign: 'center' as const, borderRadius: '12px 12px 0 0' }
const brand = { color: '#ffffff', fontSize: '20px', fontWeight: 700 as const, letterSpacing: '1.5px', margin: 0, lineHeight: 1.4 }
const body = { padding: '28px 20px', color: '#2d3344', fontSize: '15px', lineHeight: 1.8 }
const h1 = { fontSize: '24px', fontWeight: 700 as const, margin: '0 0 14px', color: '#2d3344', textAlign: 'center' as const, lineHeight: 1.4, letterSpacing: '0.5px' }
const h2 = { fontSize: '18px', fontWeight: 700 as const, margin: '0 0 12px', color: '#2d3344', textAlign: 'center' as const, lineHeight: 1.5, letterSpacing: '0.5px' }
const text = { fontSize: '15px', color: '#6b7280', lineHeight: 1.8, margin: '0 0 20px', textAlign: 'center' as const, letterSpacing: '0.3px', wordBreak: 'break-word' as const, lineBreak: 'strict' as const }
const btnWrap = { textAlign: 'center' as const, margin: '8px 0 20px' }
const otpLabel = { textAlign: 'center' as const, fontSize: '14px', color: '#6b7280', margin: '8px 0 4px', lineHeight: 1.6 }
const otp = { textAlign: 'center' as const, fontSize: '30px', fontWeight: 700 as const, letterSpacing: '6px', color: '#2d3344', background: '#fdf0e3', border: '1px solid #d0721833', borderRadius: '8px', padding: '16px 8px', margin: '12px 0', whiteSpace: 'nowrap' as const }
const otpHint = { textAlign: 'center' as const, fontSize: '12px', color: '#999', margin: '0 0 12px', lineHeight: 1.6 }
const hr = { borderColor: '#eeeeee', margin: '8px 0 24px' }
const button = { display: 'inline-block', backgroundColor: '#d07218', color: '#ffffff', fontSize: '16px', fontWeight: 600 as const, borderRadius: '8px', padding: '14px 24px', textDecoration: 'none', maxWidth: '100%', lineHeight: 1.4, whiteSpace: 'nowrap' as const }
const link = { color: '#d07218', wordBreak: 'break-all' as const, fontSize: '12px' }
const linkFallback = { fontSize: '12px', color: '#999', margin: '12px 0 24px', wordBreak: 'break-all' as const, textAlign: 'center' as const, lineHeight: 1.7 }
const notice = { background: '#f7f8fa', borderRadius: '8px', padding: '14px 16px' }
const noticeText = { fontSize: '13px', color: '#6b7280', margin: 0, textAlign: 'center' as const, lineHeight: 1.7, wordBreak: 'break-word' as const }
const footerWrap = { background: '#fafafa', padding: '18px 20px', textAlign: 'center' as const, borderTop: '1px solid #eee', borderRadius: '0 0 12px 12px' }
const copyright = { color: '#999', fontSize: '12px', margin: '0 0 6px', lineHeight: 1.7, wordBreak: 'break-word' as const }
