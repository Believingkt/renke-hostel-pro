import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import lokezeLogo from "@/assets/lokeze-logo-auth.png";

export default function ChangePassword() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast.error("密碼不一致");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("密碼至少需要 6 個字元");
      return;
    }

    setIsLoading(true);

    try {
      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) throw updateError;

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
          <CardTitle className="text-2xl text-center">設定新密碼</CardTitle>
          <CardDescription className="text-center">
            這是您首次登入，請設定新密碼
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">新密碼</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="至少 6 個字元"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">確認新密碼</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            <Button 
              type="submit" 
              className="w-full bg-orange-500 hover:bg-orange-600 text-white border-none" 
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
