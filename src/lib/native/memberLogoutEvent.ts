/** 原生 App：由「我的」頁內的登出按鈕通知 MemberLayout 開啟確認對話框 */
export const MEMBER_LOGOUT_EVENT = "lakeze:member-logout";

export function requestMemberLogout(): void {
  window.dispatchEvent(new CustomEvent(MEMBER_LOGOUT_EVENT));
}
