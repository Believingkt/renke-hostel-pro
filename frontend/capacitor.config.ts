import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lakeze.booking',
  appName: '人客多',
  webDir: 'dist',
  plugins: {
    PushNotifications: {
      // App 在前景時，也讓 iOS 直接顯示系統橫幅／音效／badge
      // （不另外用 local notification 呈現，避免背景時跳兩則）
      presentationOptions: ['alert', 'sound', 'badge'],
    },
  },
};

export default config;
