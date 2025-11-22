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
  let color = "bg-red-500";
  
  if (score >= 5) {
    label = "很強";
    color = "bg-green-500";
  } else if (score >= 4) {
    label = "強";
    color = "bg-blue-500";
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
  
  // 判斷是否從後台訪問
  const isAdminRoute = location.pathname.includes('/admin/');

  useEffect(() => {
    const fetchUserEmail = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) {
        setUserEmail(user.email);
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

    if (newPassword.length < 8) {
      toast.error("密碼至少需要 8 個字元");
      return;
    }

    setIsLoading(true);

    try {
      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) throw updateError;

      if (isAdminRoute) {
        // 從後台主動修改密碼：不登出，直接返回後台
        toast.success("密碼已更新");
        navigate("/admin");
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
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1">
          <div className="flex justify-center mb-4">
            <img src={lokezeLogo} alt="Lokeze" className="h-12 object-contain" />
          </div>
          <CardTitle className="text-2xl text-center">
            {isAdminRoute ? "修改密碼" : "設定新密碼"}
          </CardTitle>
          <CardDescription className="text-center">
            {isAdminRoute ? "請輸入新密碼" : "這是您首次登入，請設定新密碼"}
          </CardDescription>
          {userEmail && (
            <div className="mt-3 text-center">
              <p className="text-sm text-muted-foreground">
                帳戶：<span className="font-medium text-foreground">{userEmail}</span>
              </p>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="new-password">新密碼</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="inline-flex">
                        <HelpCircle className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs">
                      <div className="space-y-2 text-sm">
                        <p className="font-semibold">密碼安全建議：</p>
                        <ul className="list-disc list-inside space-y-1 text-xs">
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
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                >
                  {showNewPassword ? (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              
              {/* 密碼強度指示器 */}
              {passwordStrength && (
                <div className="space-y-2 pt-2 animate-fade-in">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">密碼強度：</span>
                    <span className={`font-medium transition-colors duration-300 ${
                      passwordStrength.score >= 4 ? 'text-green-600' :
                      passwordStrength.score >= 3 ? 'text-blue-600' :
                      passwordStrength.score >= 2 ? 'text-yellow-600' :
                      'text-red-600'
                    }`}>
                      {passwordStrength.label}
                    </span>
                  </div>
                  <div className="relative">
                    <Progress 
                      value={(passwordStrength.score / 5) * 100} 
                      className="h-2 transition-all duration-500"
                    />
                    <div 
                      className={`absolute top-0 left-0 h-2 rounded-full transition-all duration-500 ${
                        passwordStrength.score >= 4 ? 'bg-green-500' :
                        passwordStrength.score >= 3 ? 'bg-blue-500' :
                        passwordStrength.score >= 2 ? 'bg-yellow-500' :
                        'bg-red-500'
                      }`}
                      style={{ width: `${(passwordStrength.score / 5) * 100}%` }}
                    />
                  </div>
                  
                  {/* 密碼要求檢查列表 */}
                  <div className="space-y-1 pt-2">
                    <div className="flex items-center gap-2 text-xs transition-all duration-300">
                      {passwordStrength.checks.length ? (
                        <Check className="h-3 w-3 text-green-600 animate-scale-in" />
                      ) : (
                        <X className="h-3 w-3 text-red-600" />
                      )}
                      <span className={`transition-colors duration-300 ${passwordStrength.checks.length ? 'text-green-600 font-medium' : 'text-muted-foreground'}`}>
                        至少 8 個字元
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs transition-all duration-300">
                      {passwordStrength.checks.uppercase ? (
                        <Check className="h-3 w-3 text-green-600 animate-scale-in" />
                      ) : (
                        <X className="h-3 w-3 text-red-600" />
                      )}
                      <span className={`transition-colors duration-300 ${passwordStrength.checks.uppercase ? 'text-green-600 font-medium' : 'text-muted-foreground'}`}>
                        包含大寫字母 (A-Z)
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs transition-all duration-300">
                      {passwordStrength.checks.lowercase ? (
                        <Check className="h-3 w-3 text-green-600 animate-scale-in" />
                      ) : (
                        <X className="h-3 w-3 text-red-600" />
                      )}
                      <span className={`transition-colors duration-300 ${passwordStrength.checks.lowercase ? 'text-green-600 font-medium' : 'text-muted-foreground'}`}>
                        包含小寫字母 (a-z)
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs transition-all duration-300">
                      {passwordStrength.checks.number ? (
                        <Check className="h-3 w-3 text-green-600 animate-scale-in" />
                      ) : (
                        <X className="h-3 w-3 text-red-600" />
                      )}
                      <span className={`transition-colors duration-300 ${passwordStrength.checks.number ? 'text-green-600 font-medium' : 'text-muted-foreground'}`}>
                        包含數字 (0-9)
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs transition-all duration-300">
                      {passwordStrength.checks.special ? (
                        <Check className="h-3 w-3 text-green-600 animate-scale-in" />
                      ) : (
                        <X className="h-3 w-3 text-red-600" />
                      )}
                      <span className={`transition-colors duration-300 ${passwordStrength.checks.special ? 'text-green-600 font-medium' : 'text-muted-foreground'}`}>
                        包含特殊字元 (!@#$%^&*...)
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">確認新密碼</Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>
            <Button 
              type="submit" 
              className="w-full" 
              disabled={isLoading}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              確認修改
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
