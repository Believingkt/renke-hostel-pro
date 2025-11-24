import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, KeyRound, LogIn, Eye, EyeOff } from "lucide-react";
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
      
      if (event === "SIGNED_IN" && session) {
        // Check if this is from an invite link
        const { data: profile } = await supabase
          .from("profiles")
          .select("force_password_change")
          .eq("id", session.user.id)
          .single();
        
        if (profile?.force_password_change) {
          setInviteEmail(session.user.email || "");
          setIsInviteMode(true);
        } else {
          navigate("/admin");
        }
      } else if (event === "PASSWORD_RECOVERY") {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (currentSession) {
          setInviteEmail(currentSession.user.email || "");
          setIsInviteMode(true);
        }
      } else if (event === "USER_UPDATED" && session) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("force_password_change")
          .eq("id", session.user.id)
          .single();
        
        if (profile?.force_password_change) {
          setInviteEmail(session.user.email || "");
          setIsInviteMode(true);
        }
      }
    });

    // Check for existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("force_password_change")
          .eq("id", session.user.id)
          .single();
        
        if (profile?.force_password_change) {
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
      // Update password for invited user
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
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
              <KeyRound className="h-5 w-5 text-primary" />
              <CardDescription className="text-center">
                歡迎！請設定您的登入密碼
              </CardDescription>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 pt-2">
              <LogIn className="h-5 w-5 text-primary" />
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
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
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
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                完成設定
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
                <Label htmlFor="login-password">密碼</Label>
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
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
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
