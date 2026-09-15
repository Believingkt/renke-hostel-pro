import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Mail, Send, CheckCircle, XCircle } from "lucide-react";

const EmailTest = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const { toast } = useToast();

  const handleSendTestEmail = async () => {
    if (!email) {
      toast({
        title: "請輸入郵箱地址",
        variant: "destructive",
      });
      return;
    }

    // 簡單的郵箱格式驗證
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast({
        title: "請輸入有效的郵箱地址",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("test-email", {
        body: { email },
      });

      if (error) {
        console.error("發送測試郵件失敗:", error);
        setResult({
          success: false,
          message: error.message || "發送失敗",
        });
        toast({
          title: "發送失敗",
          description: error.message,
          variant: "destructive",
        });
      } else if (data?.error) {
        console.error("Resend 錯誤:", data.error);
        setResult({
          success: false,
          message: data.error,
        });
        toast({
          title: "發送失敗",
          description: data.error,
          variant: "destructive",
        });
      } else {
        console.log("測試郵件發送成功:", data);
        setResult({
          success: true,
          message: `測試郵件已成功發送至 ${email}`,
        });
        toast({
          title: "發送成功",
          description: `測試郵件已發送至 ${email}，請檢查您的收件箱`,
        });
      }
    } catch (err: any) {
      console.error("發送測試郵件時發生錯誤:", err);
      setResult({
        success: false,
        message: err.message || "未知錯誤",
      });
      toast({
        title: "發送失敗",
        description: err.message || "發送測試郵件時發生錯誤",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-6 w-6" />
            <CardTitle>郵件發送測試</CardTitle>
          </div>
          <CardDescription>
            測試 Resend 郵件服務配置是否正確。發送一封測試郵件到指定的郵箱地址。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="test-email" className="text-sm font-medium">
                收件人郵箱地址
              </label>
              <Input
                id="test-email"
                type="email"
                placeholder="example@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>

            <Button 
              onClick={handleSendTestEmail} 
              disabled={loading || !email}
              className="w-full"
            >
              {loading ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  發送中...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  發送測試郵件
                </>
              )}
            </Button>
          </div>

          {result && (
            <div
              className={`p-4 rounded-lg border ${
                result.success
                  ? "bg-success/10 border-success/30"
                  : "bg-red-50 border-red-200"
              }`}
            >
              <div className="flex items-start gap-3">
                {result.success ? (
                  <CheckCircle className="h-5 w-5 text-success mt-0.5" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
                )}
                <div className="flex-1">
                  <h4
                    className={`font-medium ${
                      result.success ? "text-success" : "text-red-900"
                    }`}
                  >
                    {result.success ? "發送成功" : "發送失敗"}
                  </h4>
                  <p
                    className={`text-sm mt-1 ${
                      result.success ? "text-success/80" : "text-red-700"
                    }`}
                  >
                    {result.message}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="bg-success/10 border border-success/30 rounded-lg p-4">
            <h4 className="font-medium text-success mb-2">✅ 使用測試域名</h4>
            <p className="text-sm text-success/80 mb-2">
              目前使用 Resend 官方測試域名 <strong>onboarding@resend.dev</strong> 發送郵件。
            </p>
            <p className="text-sm text-success/70">
              這個域名已驗證，可以正常發送測試郵件。等 sensaninn.lakeze.com 驗證完成後，記得切換回自訂域名。
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-blue-900 mb-2">💡 使用提示</h4>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• 郵件可能需要幾分鐘才能送達</li>
              <li>• 請檢查垃圾郵件資料夾</li>
              <li>• 當前發件人：森山寫照測試 &lt;onboarding@resend.dev&gt;</li>
              <li>• 測試域名僅供開發測試使用</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default EmailTest;
