export const APP_TITLES = {
  booking: "人客多線上訂房系統",
  pms: "人客多 PMS 管理系統",
  hq: "人客多 總部後台",
} as const;

export type AppName = keyof typeof APP_TITLES;
