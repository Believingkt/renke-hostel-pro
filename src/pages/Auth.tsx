import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, KeyRound, LogIn } from "lucide-react";
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

  useEffect(() => {
    const handleInviteLink = async () => {
      // Check if this is an invite/recovery link
      const type = searchParams.get('type');
      const tokenHash = searchParams.get('token_hash');
      const error = searchParams.get('error');
      const errorDescription = searchParams.get('error_description');
      
      // Check if there's an error from Supabase (expired/invalid token)
      if ((type === 'recovery' || type === 'invite' || tokenHash) && (error || errorDescription)) {
        setInviteLinkExpired(true);
        toast.error("邀請連結已失效，請聯繫管理員重新發送邀請信");
        return;
      }
      
      if (type === 'recovery' || type === 'invite' || tokenHash) {
        try {
          // First, sign out any existing user to ensure invite link works correctly
          await supabase.auth.signOut();
          
          // Wait a moment for sign out to complete
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Check if we already have a session from the invite link
          const { data: { session }, error: sessionError } = await supabase.auth.getSession();
          
          if (sessionError) {
            console.error("Session error:", sessionError);
            setInviteLinkExpired(true);
            toast.error("邀請連結已失效，請聯繫管理員重新發送邀請信");
            return;
          }
          
          if (session?.user) {
            // Session exists, check if password needs to be set
            setInviteEmail(session.user.email || "");
            
            const { data: profile } = await supabase
              .from("profiles")
              .select("force_password_change")
              .eq("id", session.user.id)
              .single();
            
            if (profile?.force_password_change) {
              setIsInviteMode(true);
            } else {
              navigate("/admin");
            }
          } else {
            // No session - likely the token has expired
            setInviteLinkExpired(true);
            toast.error("邀請連結已失效，請聯繫管理員重新發送邀請信");
          }
        } catch (error) {
          console.error("Error handling invite link:", error);
          setInviteLinkExpired(true);
          toast.error("邀請連結處理失敗，請聯繫管理員重新發送邀請信");
        }
        return;
      }
    };

    handleInviteLink();

    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await checkForcePasswordChange(session.user.id);
      }
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session) {
        await checkForcePasswordChange(session.user.id);
      } else if (event === "PASSWORD_RECOVERY" || event === "USER_UPDATED") {
        // Handle password recovery or user update events
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (currentSession) {
          setInviteEmail(currentSession.user.email || "");
          
          const { data: profile } = await supabase
            .from("profiles")
            .select("force_password_change")
            .eq("id", currentSession.user.id)
            .single();
          
          if (profile?.force_password_change) {
            setIsInviteMode(true);
          }
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, searchParams]);

  const checkForcePasswordChange = async (userId: string) => {
    try {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("force_password_change")
        .eq("id", userId)
        .single();

      if (error) {
        if (import.meta.env.DEV) {
          console.error("Error checking profile:", error);
        }
        navigate("/admin");
        return;
      }

      if (profile?.force_password_change) {
        navigate("/change-password");
      } else {
        navigate("/admin");
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Error in checkForcePasswordChange:", error);
      }
      navigate("/admin");
    }
  };

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
                <Input
                  id="new-password"
                  type="password"
                  placeholder="至少 6 個字元"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">確認密碼</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="請再次輸入密碼"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                />
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
                <Input
                  id="login-password"
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                />
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
