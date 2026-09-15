import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, Check, X, HelpCircle } from "lucide-react";
import lokezeLogo from "@/assets/lokeze-logo-auth.png";
import { getPasswordIssues } from "@/utils/passwordPolicy";
import { parseFunctionInvokeError } from "@/utils/parseFunctionError";


// 密碼強度檢測
interface PasswordStrength {
  score: number; // 0-5
  label: string; // 很弱/弱/中等/強/很強
  color: string;
  checks: {
    length: boolean;
    uppercase: boolean;
    lowercase: boolean;
    number: boolean;
    special: boolean;
  };
}

const checkPasswordStrength = (password: string): PasswordStrength => {
  const checks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
  };

  const score = Object.values(checks).filter(Boolean).length;
  
  let label = "很弱";
  let color = "bg-destructive";
  
  if (score >= 5) {
    label = "很強";
    color = "bg-primary";
  } else if (score >= 4) {
    label = "強";
    color = "bg-primary/70";
  } else if (score >= 3) {
    label = "中等";
    color = "bg-yellow-500";
  } else if (score >= 2) {
    label = "弱";
    color = "bg-orange-500";
  }

  return { score, label, color, checks };
};

export default function ChangePassword() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [userEmail, setUserEmail] = useState<string>("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState<PasswordStrength | null>(null);
  const [isBackendUser, setIsBackendUser] = useState(false);
  
  // 判斷是否從後台訪問（透過 URL 參數或路徑）
  const searchParams = new URLSearchParams(location.search);
  const sourceParam = searchParams.get('source');
  const isAdminRoute = location.pathname.includes('/admin/') || sourceParam === 'admin';
  const isHQRoute = location.pathname.startsWith('/hq') || location.pathname.includes('/headquarters/') || sourceParam === 'hq';

  useEffect(() => {
    const fetchUserEmail = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) {
        setUserEmail(user.email);
      }

      // 受邀帳號首次登入（後台）會帶 force_password_change 標記：視為後台流程
      const isForcedChange = user?.user_metadata?.force_password_change === true;
      if (isForcedChange) {
        setIsBackendUser(true);
        return;
      }

      // 若可讀取到 user_roles，且有角色，也視為後台流程（前台不變）
      if (user?.id) {
        const { data: roles, error: rolesError } = await supabase
          .from("user_roles")
          .select("id")
          .eq("user_id", user.id)
          .limit(1);

        if (!rolesError) {
          setIsBackendUser((roles?.length ?? 0) > 0);
        }
      }
    };
    fetchUserEmail();
  }, []);

  // 監聽密碼變化，更新強度檢測
  useEffect(() => {
    if (newPassword) {
      setPasswordStrength(checkPasswordStrength(newPassword));
    } else {
      setPasswordStrength(null);
    }
  }, [newPassword]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast.error("密碼不一致");
      return;
    }

    const issues = getPasswordIssues(newPassword, { email: userEmail });
    if (issues.length > 0) {
      toast.error(issues[0]);
      return;
    }

    setIsLoading(true);

    try {
      // Update password via backend function (adds server-side leaked-password check)
      const { data, error } = await supabase.functions.invoke("update-own-password", {
        body: {
          newPassword,
          // Only the "first login" flows require clearing the metadata flag,
          // but doing so is harmless for normal password changes.
          clearForcePasswordChange: true,
        },
      });

      if (error) {
        const parsed = await parseFunctionInvokeError(error);
        throw new Error(parsed.backendError || parsed.message || "修改密碼失敗");
      }
      if (data?.error) throw new Error(data.error);


      if (isAdminRoute) {
        // 從後台主動修改密碼：不登出，直接返回後台
        toast.success("密碼已更新");
        navigate("/admin");
      } else if (isHQRoute) {
        // 從總部後台主動修改密碼：不登出，直接返回總部
        toast.success("密碼已更新");
        navigate("/hq");
      } else {
        // 首次登入強制修改密碼：需要更新標記並登出
        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("無法取得使用者資訊");

        // Update profile to remove force_password_change flag
        const { error: profileError } = await supabase
          .from("profiles")
          .update({ force_password_change: false })
          .eq("id", user.id);

        if (profileError) throw profileError;

        toast.success("密碼已更新，請重新登入");
        
        // Sign out to force re-login with new password
        await supabase.auth.signOut();
        navigate("/auth");
      }
    } catch (error: any) {
      if (import.meta.env.DEV) {
        console.error("Error changing password:", error);
      }
      toast.error(error.message || "修改密碼失敗");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-3 sm:p-4">
      <Card className="w-full max-w-md shadow-lg my-auto">
        <CardHeader className="space-y-1 px-4 sm:px-6 py-4 sm:py-6">
          <div className="flex justify-center mb-3 sm:mb-4">
            <img src={lokezeLogo} alt="Lokeze" className="h-10 sm:h-12 object-contain" />
          </div>
          <CardTitle className="text-xl sm:text-2xl text-center">
            {(isAdminRoute || isHQRoute) ? "修改密碼" : "設定新密碼"}
          </CardTitle>
          <CardDescription className="text-center text-sm sm:text-base">
            {(isAdminRoute || isHQRoute) ? "請輸入新密碼" : "這是您首次登入，請設定新密碼"}
          </CardDescription>
          {userEmail && (
            <div className="mt-2 sm:mt-3 text-center">
              <p className="text-xs sm:text-sm text-muted-foreground">
                帳戶：<span className="font-medium text-foreground break-all">{userEmail}</span>
              </p>
            </div>
          )}
        </CardHeader>
        <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
          <form onSubmit={handleChangePassword} className="space-y-3 sm:space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Label htmlFor="new-password" className="text-sm sm:text-base">新密碼</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="inline-flex touch-manipulation">
                        <HelpCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground hover:text-foreground transition-colors" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-[280px] sm:max-w-xs text-xs sm:text-sm">
                      <div className="space-y-2">
                        <p className="font-semibold">密碼安全建議：</p>
                        <ul className="list-disc list-inside space-y-1 text-[10px] sm:text-xs">
                          <li>使用至少 8 個字元，建議 12 個以上</li>
                          <li>混合使用大小寫字母、數字和特殊符號</li>
                          <li>避免使用個人資訊（生日、姓名等）</li>
                          <li>避免使用常見密碼（123456、password等）</li>
                          <li>不要在多個網站使用相同密碼</li>
                          <li>定期更換密碼以提高安全性</li>
                        </ul>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNewPassword ? "text" : "password"}
                  placeholder="至少 8 個字元"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  className="pr-10 h-10 sm:h-auto text-base"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-2.5 sm:px-3 hover:bg-transparent touch-manipulation"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                >
                  {showNewPassword ? (
                    <Eye className="h-4 w-4 sm:h-4 sm:w-4 text-muted-foreground" />
                  ) : (
                    <EyeOff className="h-4 w-4 sm:h-4 sm:w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              
              {/* 密碼強度指示器 */}
              {passwordStrength && (
                <div className="space-y-2 pt-2 animate-fade-in">
                  <div className="flex items-center justify-between text-xs sm:text-sm">
                    <span className="text-muted-foreground">密碼強度：</span>
                    <span className={`font-medium transition-colors duration-300 ${
                      passwordStrength.score >= 4 ? 'text-primary' :
                      passwordStrength.score >= 3 ? 'text-primary/80' :
                      passwordStrength.score >= 2 ? 'text-yellow-600' :
                      'text-destructive'
                    }`}>
                      {passwordStrength.label}
                    </span>
                  </div>
                  <div className="relative">
                    <Progress 
                      value={(passwordStrength.score / 5) * 100} 
                      className="h-1.5 sm:h-2 transition-all duration-500"
                    />
                    <div 
                      className={`absolute top-0 left-0 h-1.5 sm:h-2 rounded-full transition-all duration-500 ${
                        passwordStrength.score >= 4 ? 'bg-primary' :
                        passwordStrength.score >= 3 ? 'bg-primary/70' :
                        passwordStrength.score >= 2 ? 'bg-yellow-500' :
                        'bg-destructive'
                      }`}
                      style={{ width: `${(passwordStrength.score / 5) * 100}%` }}
                    />
                  </div>
                  
                  {/* 密碼要求檢查列表 */}
                  <div className="space-y-1 pt-1.5 sm:pt-2">
                    <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs transition-all duration-300">
                      {passwordStrength.checks.length ? (
                        <Check className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-primary animate-scale-in flex-shrink-0" />
                      ) : (
                        <X className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-destructive flex-shrink-0" />
                      )}
                      <span className={`transition-colors duration-300 ${passwordStrength.checks.length ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                        至少 8 個字元
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs transition-all duration-300">
                      {passwordStrength.checks.uppercase ? (
                        <Check className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-primary animate-scale-in flex-shrink-0" />
                      ) : (
                        <X className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-destructive flex-shrink-0" />
                      )}
                      <span className={`transition-colors duration-300 ${passwordStrength.checks.uppercase ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                        包含大寫字母 (A-Z)
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs transition-all duration-300">
                      {passwordStrength.checks.lowercase ? (
                        <Check className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-primary animate-scale-in flex-shrink-0" />
                      ) : (
                        <X className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-destructive flex-shrink-0" />
                      )}
                      <span className={`transition-colors duration-300 ${passwordStrength.checks.lowercase ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                        包含小寫字母 (a-z)
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs transition-all duration-300">
                      {passwordStrength.checks.number ? (
                        <Check className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-primary animate-scale-in flex-shrink-0" />
                      ) : (
                        <X className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-destructive flex-shrink-0" />
                      )}
                      <span className={`transition-colors duration-300 ${passwordStrength.checks.number ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                        包含數字 (0-9)
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs transition-all duration-300">
                      {passwordStrength.checks.special ? (
                        <Check className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-primary animate-scale-in flex-shrink-0" />
                      ) : (
                        <X className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-destructive flex-shrink-0" />
                      )}
                      <span className={`transition-colors duration-300 ${passwordStrength.checks.special ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                        包含特殊字元 (!@#$%^&*...)
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password" className="text-sm sm:text-base">確認新密碼</Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="pr-10 h-10 sm:h-auto text-base"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-2.5 sm:px-3 hover:bg-transparent touch-manipulation"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? (
                    <Eye className="h-4 w-4 sm:h-4 sm:w-4 text-muted-foreground" />
                  ) : (
                    <EyeOff className="h-4 w-4 sm:h-4 sm:w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Button 
                type="submit" 
                className={`w-full h-11 sm:h-10 text-base sm:text-sm touch-manipulation ${
                  (isAdminRoute || isHQRoute || isBackendUser)
                    ? '' 
                    : ''
                }`}
                disabled={isLoading}
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                確認修改
              </Button>
              {(isAdminRoute || isHQRoute) && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-11 sm:h-10 text-base sm:text-sm touch-manipulation"
                  onClick={() => navigate(isHQRoute ? "/hq" : "/admin")}
                >
                  取消
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
