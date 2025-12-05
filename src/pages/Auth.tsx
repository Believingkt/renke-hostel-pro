import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, KeyRound, LogIn, Eye, EyeOff, Mail } from "lucide-react";
import lokezeLogo from "@/assets/lokeze-logo-auth.png";

export default function Auth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isInviteMode, setIsInviteMode] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLinkExpired, setInviteLinkExpired] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isForgotPasswordMode, setIsForgotPasswordMode] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");

  useEffect(() => {
    // Check for expired/invalid invite link from URL params
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');
    
    if (error || errorDescription) {
      setInviteLinkExpired(true);
      toast.error("邀請連結已失效，請聯繫管理員重新發送邀請信");
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("Auth state changed:", event, session?.user?.email);
      
      // For PASSWORD_RECOVERY or SIGNED_IN events, check if user needs to set password
      if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session) {
        const needsPasswordChange = session.user.user_metadata?.force_password_change === true;
        
        const { data: profile } = await supabase
          .from("profiles")
          .select("force_password_change")
          .eq("id", session.user.id)
          .single();
        
        // Show password setup if force_password_change is true in either metadata or profile
        if (needsPasswordChange || profile?.force_password_change) {
          setInviteEmail(session.user.email || "");
          setIsInviteMode(true);
          toast.info("請設定您的登入密碼");
        } else {
          navigate("/admin");
        }
      } else if (event === "USER_UPDATED" && session) {
        // After password update, check if we should redirect to admin
        const { data: profile } = await supabase
          .from("profiles")
          .select("force_password_change")
          .eq("id", session.user.id)
          .single();
        
        const needsPasswordChange = session.user.user_metadata?.force_password_change === true;
        
        if (!profile?.force_password_change && !needsPasswordChange) {
          // Password has been set successfully
          navigate("/admin");
        }
      }
    });

    // Check for existing session on mount
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        const needsPasswordChange = session.user.user_metadata?.force_password_change === true;
        
        const { data: profile } = await supabase
          .from("profiles")
          .select("force_password_change")
          .eq("id", session.user.id)
          .single();
        
        if (needsPasswordChange || profile?.force_password_change) {
          setInviteEmail(session.user.email || "");
          setIsInviteMode(true);
        } else {
          navigate("/admin");
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, searchParams]);


  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });

      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          toast.error("帳號或密碼錯誤");
        } else {
          toast.error(error.message);
        }
      } else {
        toast.success("登入成功！");
      }
    } catch (error) {
      toast.error("登入失敗，請稍後再試");
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!forgotPasswordEmail) {
      toast.error("請輸入電子郵件");
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("send-password-reset", {
        body: { 
          email: forgotPasswordEmail,
          redirectUrl: `${window.location.origin}/reset-password`
        },
      });

      if (error) {
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      toast.success("重設密碼郵件已發送，請檢查您的信箱");
      setIsForgotPasswordMode(false);
      setForgotPasswordEmail("");
    } catch (error: any) {
      console.error("Forgot password error:", error);
      toast.error(error.message || "發送失敗，請稍後再試");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      toast.error("兩次輸入的密碼不一致");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("密碼長度至少需要 6 個字元");
      return;
    }

    setIsLoading(true);

    try {
      // Update password and clear force_password_change from metadata
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
        data: {
          force_password_change: false,
        }
      });

      if (updateError) throw updateError;

      // Update profile to remove force_password_change flag
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ force_password_change: false })
          .eq('id', session.user.id);
        
        if (profileError && import.meta.env.DEV) {
          console.error("Error updating profile:", profileError);
        }
      }

      toast.success("密碼設定成功！正在登入...");
      
      // Navigate to admin after short delay
      setTimeout(() => {
        navigate("/admin");
      }, 1000);
    } catch (error: any) {
      if (import.meta.env.DEV) {
        console.error("Error setting password:", error);
      }
      toast.error(error.message || "密碼設定失敗，請稍後再試");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-3">
          <div className="flex flex-col items-center space-y-2">
            <img src={lokezeLogo} alt="Lokeze" className="h-12 object-contain" />
            <p className="text-lg font-medium text-muted-foreground">人客多 PMS 管理系統</p>
          </div>
          {inviteLinkExpired ? (
            <div className="flex items-center justify-center gap-2 pt-2">
              <CardDescription className="text-center text-destructive">
                邀請連結已失效
              </CardDescription>
            </div>
          ) : isInviteMode ? (
            <div className="flex items-center justify-center gap-2 pt-2">
              <KeyRound className="h-5 w-5 text-blue-600" />
              <CardDescription className="text-center">
                歡迎！請設定您的登入密碼
              </CardDescription>
            </div>
          ) : isForgotPasswordMode ? (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Mail className="h-5 w-5 text-blue-600" />
              <CardDescription className="text-center">
                重設您的密碼
              </CardDescription>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 pt-2">
              <LogIn className="h-5 w-5 text-blue-600" />
              <CardDescription className="text-center">
                請登入您的帳號
              </CardDescription>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {inviteLinkExpired ? (
            <div className="text-center space-y-4">
              <p className="text-sm text-muted-foreground">
                您的邀請連結已過期或失效。請聯繫管理員重新發送邀請信。
              </p>
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => {
                  setInviteLinkExpired(false);
                  window.history.replaceState({}, '', '/auth');
                }}
              >
                返回登入
              </Button>
            </div>
          ) : isInviteMode ? (
            <form onSubmit={handleSetPassword} className="space-y-4">
              {inviteEmail && (
                <div className="space-y-2">
                  <Label>電子郵件</Label>
                  <Input
                    type="email"
                    value={inviteEmail}
                    disabled
                    className="bg-muted"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="new-password">設定密碼</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showNewPassword ? "text" : "password"}
                    placeholder="至少 6 個字元"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                  >
                    {showNewPassword ? (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">確認密碼</Label>
                <div className="relative">
                  <Input
                    id="confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="請再次輸入密碼"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
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
              <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                完成設定
              </Button>
            </form>
          ) : isForgotPasswordMode ? (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="forgot-email">電子郵件</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  placeholder="your@email.com"
                  value={forgotPasswordEmail}
                  onChange={(e) => setForgotPasswordEmail(e.target.value)}
                  required
                />
              </div>
              <p className="text-sm text-muted-foreground">
                輸入您的電子郵件，我們將發送重設密碼連結給您。
              </p>
              <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                發送重設連結
              </Button>
              <Button 
                type="button"
                variant="ghost" 
                className="w-full"
                onClick={() => {
                  setIsForgotPasswordMode(false);
                  setForgotPasswordEmail("");
                }}
              >
                返回登入
              </Button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">電子郵件</Label>
                <Input
                  id="login-email"
                  type="email"
                  placeholder="your@email.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="login-password">密碼</Label>
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 text-sm text-muted-foreground hover:text-primary"
                    onClick={() => setIsForgotPasswordMode(true)}
                  >
                    忘記密碼？
                  </Button>
                </div>
                <div className="relative">
                  <Input
                    id="login-password"
                    type={showLoginPassword ? "text" : "password"}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                  >
                    {showLoginPassword ? (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>
              <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                登入
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
