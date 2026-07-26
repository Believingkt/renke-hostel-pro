import { AlertCircle, CheckCircle, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MemberSessionBarProps {
  loggedInMember: { id: string; name: string; email: string; phone: string } | null;
  bookingEmail: string;
  isMismatch: boolean;
  onSwitchAccount?: () => void;
  onGoToBookerStep?: () => void;
  showGoToBookerStep?: boolean;
}

/** 訂房與結帳全程顯示目前登入的會員 Email，並提示訂單將掛靠的帳號 */
const MemberSessionBar = ({
  loggedInMember,
  bookingEmail,
  isMismatch,
  onSwitchAccount,
  onGoToBookerStep,
  showGoToBookerStep,
}: MemberSessionBarProps) => {
  const trimmedBookingEmail = bookingEmail.trim();

  if (!loggedInMember && !trimmedBookingEmail) {
    return (
      <div className="mb-3 rounded-lg border bg-muted/40 px-3 py-2 flex items-center gap-2 text-sm text-muted-foreground">
        <UserRound className="h-4 w-4 shrink-0" />
        <span>尚未登入會員，本次訂單將以訪客身分建立</span>
      </div>
    );
  }

  if (loggedInMember && isMismatch) {
    return (
      <div className="mb-3 rounded-lg border-2 border-orange-300 bg-orange-50 px-3 py-2.5 space-y-2">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-orange-600 shrink-0 mt-0.5" />
          <div className="text-sm text-orange-900 space-y-0.5 min-w-0">
            <p>
              目前登入會員：<span className="font-medium break-all">{loggedInMember.email}</span>
            </p>
            <p>
              本次訂房 Email：<span className="font-medium break-all">{trimmedBookingEmail}</span>
            </p>
            <p className="font-medium">兩者不一致，此訂單不會掛在目前登入的帳號下。</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => onSwitchAccount?.()}>
            登出並以此 Email 重新驗證（OTP）
          </Button>
          {showGoToBookerStep && (
            <Button variant="ghost" size="sm" onClick={() => onGoToBookerStep?.()}>
              回到訂房資料步驟
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (loggedInMember) {
    return (
      <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 flex items-center gap-2 text-sm text-emerald-800">
        <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
        <span className="min-w-0 break-all">
          目前登入會員：<span className="font-medium">{loggedInMember.email}</span>
          {trimmedBookingEmail ? "，訂單將掛在此帳號" : "，訂房可累積紅利點數"}
        </span>
      </div>
    );
  }

  return (
    <div className="mb-3 rounded-lg border bg-muted/40 px-3 py-2 flex items-center gap-2 text-sm text-muted-foreground">
      <UserRound className="h-4 w-4 shrink-0" />
      <span className="min-w-0 break-all">
        未登入會員 · 訂房 Email：<span className="font-medium">{trimmedBookingEmail}</span>（訂單以訪客身分建立）
      </span>
    </div>
  );
};

export default MemberSessionBar;
