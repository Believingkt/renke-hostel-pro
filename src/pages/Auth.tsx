import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import lokezeLogo from "@/assets/lokeze-logo-auth.png";

export default function Auth() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  useEffect(() => {
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
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-3">
          <div className="flex flex-col items-center space-y-2">
            <img src={lokezeLogo} alt="Lokeze" className="h-12 object-contain" />
            <p className="text-lg font-medium text-muted-foreground">人客多 PMS 管理系統</p>
          </div>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </div>
  );
}
