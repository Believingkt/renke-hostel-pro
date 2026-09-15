import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail } from "lucide-react";
import { isMemberPreview } from "@/lib/memberPreviewMock";

export const SYNTHETIC_EMAIL_RE = /@(line|facebook)\.lakeze\.local$/i;

export function isUsableEmail(email?: string | null) {
  if (!email) return false;
  if (SYNTHETIC_EMAIL_RE.test(email)) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** 提醒 LINE / Facebook 登入的會員補填 Email，否則收不到訂單通知信 */
const MissingEmailNotice = () => {
  const [needsEmail, setNeedsEmail] = useState(false);

  useEffect(() => {
    if (isMemberPreview()) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("platform_members")
        .select("email")
        .eq("user_id", user.id)
        .maybeSingle();
      const email = data?.email || user.email || "";
      setNeedsEmail(!isUsableEmail(email));
    })();
  }, []);

  if (!needsEmail) return null;

  return (
    <Card className="border-amber-400/60 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <Mail className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
        <div className="flex-1 space-y-1">
          <p className="text-sm font-semibold text-amber-900">請補填 Email</p>
          <p className="text-sm text-amber-800">
            您使用社群帳號登入，系統尚未取得可寄送的 Email，將無法收到訂房確認信與付款通知信。
          </p>
        </div>
        <Button asChild size="sm" className="flex-shrink-0">
          <Link to="/member/profile/edit">前往填寫</Link>
        </Button>
      </div>
    </Card>
  );
};

export default MissingEmailNotice;
