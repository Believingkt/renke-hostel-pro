import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, XCircle, Loader2, Copy, ExternalLink, Info, Globe } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface DnsSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subdomain: string;
  accommodationName: string;
}

interface DnsVerificationResult {
  status: 'pending' | 'verified' | 'failed';
  message: string;
  cnameTarget?: string;
}

export function DnsSettingsDialog({
  open,
  onOpenChange,
  subdomain,
  accommodationName
}: DnsSettingsDialogProps) {
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<DnsVerificationResult | null>(null);

  const fullDomain = `${subdomain}.lakeze.com`;
  const cnameTarget = "lakeze.com";

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`已複製 ${label}`);
  };

  const verifyDns = async () => {
    setVerifying(true);
    setVerificationResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('verify-dns', {
        body: { subdomain, domain: 'lakeze.com' }
      });

      if (error) throw error;

      setVerificationResult({
        status: data.verified ? 'verified' : 'failed',
        message: data.message,
        cnameTarget: data.cnameTarget
      });
    } catch (error) {
      console.error('DNS verification error:', error);
      setVerificationResult({
        status: 'failed',
        message: '無法驗證 DNS 設定，請稍後再試'
      });
    } finally {
      setVerifying(false);
    }
  };

  const dnsProviderInstructions = [
    {
      id: 'cloudflare',
      name: 'Cloudflare',
      steps: [
        '登入 Cloudflare Dashboard',
        '選擇您的域名',
        '點擊 "DNS" 選項卡',
        '點擊 "Add record" 按鈕',
        '類型選擇 "CNAME"',
        `名稱輸入 "${subdomain}"`,
        `目標輸入 "${cnameTarget}"`,
        '關閉 Proxy 狀態（橘色雲朵變成灰色）',
        '點擊 "Save" 保存'
      ]
    },
    {
      id: 'godaddy',
      name: 'GoDaddy',
      steps: [
        '登入 GoDaddy 帳戶',
        '進入 "My Products" 頁面',
        '找到您的域名，點擊 "DNS"',
        '在 "Records" 區域，點擊 "Add"',
        '類型選擇 "CNAME"',
        `主機名稱輸入 "${subdomain}"`,
        `指向輸入 "${cnameTarget}"`,
        'TTL 選擇預設值',
        '點擊 "Save" 保存'
      ]
    },
    {
      id: 'namecheap',
      name: 'Namecheap',
      steps: [
        '登入 Namecheap 帳戶',
        '進入 "Domain List"',
        '點擊域名旁邊的 "Manage"',
        '選擇 "Advanced DNS" 標籤',
        '點擊 "Add New Record"',
        '類型選擇 "CNAME Record"',
        `Host 輸入 "${subdomain}"`,
        `Value 輸入 "${cnameTarget}"`,
        '點擊綠色勾勾保存'
      ]
    },
    {
      id: 'gandi',
      name: 'Gandi',
      steps: [
        '登入 Gandi 帳戶',
        '進入域名管理頁面',
        '點擊 "DNS Records"',
        '點擊 "Add" 按鈕',
        '類型選擇 "CNAME"',
        `名稱輸入 "${subdomain}"`,
        `值輸入 "${cnameTarget}"`,
        '點擊 "Create" 保存'
      ]
    }
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            DNS 設定 - {accommodationName}
          </DialogTitle>
          <DialogDescription>
            設定子網域 {fullDomain} 的 DNS CNAME 記錄
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* DNS Record Info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">必要的 DNS 記錄</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted rounded-lg p-4">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground block mb-1">類型</span>
                    <Badge variant="outline">CNAME</Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground block mb-1">主機名稱</span>
                    <div className="flex items-center gap-2">
                      <code className="bg-background px-2 py-1 rounded text-sm font-mono">
                        {subdomain}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => copyToClipboard(subdomain, '主機名稱')}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground block mb-1">目標</span>
                    <div className="flex items-center gap-2">
                      <code className="bg-background px-2 py-1 rounded text-sm font-mono">
                        {cnameTarget}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => copyToClipboard(cnameTarget, '目標')}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Info className="h-4 w-4" />
                <span>完整網址：</span>
                <code className="bg-muted px-2 py-0.5 rounded font-mono">{fullDomain}</code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => copyToClipboard(fullDomain, '完整網址')}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* DNS Verification */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">DNS 驗證</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                設定完成後，點擊下方按鈕驗證您的 DNS 設定是否正確。DNS 記錄可能需要最多 48 小時才能生效。
              </p>

              <Button onClick={verifyDns} disabled={verifying} className="w-full">
                {verifying ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    驗證中...
                  </>
                ) : (
                  <>
                    <Globe className="mr-2 h-4 w-4" />
                    驗證 DNS 設定
                  </>
                )}
              </Button>

              {verificationResult && (
                <Alert variant={verificationResult.status === 'verified' ? 'default' : 'destructive'}>
                  <div className="flex items-start gap-2">
                    {verificationResult.status === 'verified' ? (
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                    ) : (
                      <XCircle className="h-5 w-5" />
                    )}
                    <AlertDescription>
                      <div className="font-medium">
                        {verificationResult.status === 'verified' ? 'DNS 設定正確！' : 'DNS 設定尚未完成'}
                      </div>
                      <div className="text-sm mt-1">{verificationResult.message}</div>
                      {verificationResult.cnameTarget && (
                        <div className="text-sm mt-1 text-muted-foreground">
                          目前指向：{verificationResult.cnameTarget}
                        </div>
                      )}
                    </AlertDescription>
                  </div>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Provider Instructions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">設定步驟</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="cloudflare" className="w-full">
                <TabsList className="grid grid-cols-4 w-full">
                  {dnsProviderInstructions.map(provider => (
                    <TabsTrigger key={provider.id} value={provider.id} className="text-xs">
                      {provider.name}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {dnsProviderInstructions.map(provider => (
                  <TabsContent key={provider.id} value={provider.id} className="mt-4">
                    <ol className="list-decimal list-inside space-y-2 text-sm">
                      {provider.steps.map((step, index) => (
                        <li key={index} className="text-muted-foreground">
                          {step}
                        </li>
                      ))}
                    </ol>
                    <Button
                      variant="link"
                      className="mt-4 p-0 h-auto text-sm"
                      onClick={() => {
                        const urls: Record<string, string> = {
                          cloudflare: 'https://dash.cloudflare.com/',
                          godaddy: 'https://dcc.godaddy.com/',
                          namecheap: 'https://www.namecheap.com/myaccount/',
                          gandi: 'https://admin.gandi.net/'
                        };
                        window.open(urls[provider.id], '_blank');
                      }}
                    >
                      前往 {provider.name} 管理頁面
                      <ExternalLink className="ml-1 h-3 w-3" />
                    </Button>
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>

          {/* Help Info */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-sm">
              如果您使用的 DNS 供應商不在上方列表中，請在您的 DNS 管理頁面新增一條 CNAME 記錄，
              將 <code className="bg-muted px-1 rounded">{subdomain}</code> 指向{" "}
              <code className="bg-muted px-1 rounded">{cnameTarget}</code>。
            </AlertDescription>
          </Alert>
        </div>
      </DialogContent>
    </Dialog>
  );
}
