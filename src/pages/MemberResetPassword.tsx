import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Lock, CheckCircle } from "lucide-react";
import { getPasswordIssues } from "@/utils/passwordPolicy";

const MemberResetPassword = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);

  useEffect(() => {
    // 檢查 URL hash 是否包含 recovery token
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setIsRecovery(true);
    } else {
      // 也監聽 auth state 變更
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY") {
          setIsRecovery(true);
        }
      });
      return () => subscription.unsubscribe();
    }
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast.error("密碼不一致");
      return;
    }

    const issues = getPasswordIssues(password);
    if (issues.length > 0) {
      toast.error(issues[0]);
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
      toast.success("密碼已重設成功");
      setTimeout(() => navigate("/member/auth"), 2000);
    } catch (error: any) {
      toast.error(error.message || "重設密碼失敗");
    } finally {
      setLoading(false);
    }
  };

  if (!isRecovery) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">驗證重設連結中...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center space-y-4">
            <CheckCircle className="h-12 w-12 mx-auto" style={{ color: "hsl(24, 100%, 50%)" }} />
            <h2 className="text-xl font-bold">密碼已重設</h2>
            <p className="text-muted-foreground">即將跳轉至登入頁面...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold" style={{ color: "hsl(24, 100%, 50%)" }}>
            人客多
          </h1>
          <p className="text-muted-foreground mt-2">重設密碼</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>設定新密碼</CardTitle>
            <CardDescription>請輸入您的新密碼</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleReset} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">新密碼</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="new-password"
                    type="password"
                    placeholder="至少 8 個字元，含大小寫與數字"
                    className="pl-10"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">確認新密碼</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder="再次輸入新密碼"
                    className="pl-10"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
              </div>
              <Button
                type="submit"
                className="w-full bg-[hsl(24,100%,50%)] hover:bg-[hsl(24,100%,45%)] text-white"
                disabled={loading}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                確認重設
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default MemberResetPassword;
