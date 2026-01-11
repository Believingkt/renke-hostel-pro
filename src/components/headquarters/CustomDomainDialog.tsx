import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, XCircle, Loader2, Copy, Globe, Info, AlertTriangle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface CustomDomainDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accommodationId: string;
  accommodationName: string;
  currentDomain: string | null;
  onDomainUpdated: () => void;
}

// Domain validation regex
const DOMAIN_REGEX = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

export function CustomDomainDialog({
  open,
  onOpenChange,
  accommodationId,
  accommodationName,
  currentDomain,
  onDomainUpdated
}: CustomDomainDialogProps) {
  const [domain, setDomain] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [domainStatus, setDomainStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setDomain(currentDomain || "");
      setDomainStatus("idle");
    }
  }, [open, currentDomain]);

  // Validate domain format and check availability
  const checkDomainAvailability = async (domainValue: string) => {
    if (!domainValue) {
      setDomainStatus("idle");
      return;
    }

    // Remove protocol and trailing slashes
    const cleanDomain = domainValue
      .replace(/^(https?:\/\/)?/, "")
      .replace(/\/$/, "")
      .toLowerCase();

    // Format validation
    if (!DOMAIN_REGEX.test(cleanDomain)) {
      setDomainStatus("invalid");
      return;
    }

    setDomainStatus("checking");

    try {
      const { data, error } = await supabase
        .from("accommodation_info")
        .select("id, name")
        .eq("custom_domain", cleanDomain)
        .neq("id", accommodationId)
        .maybeSingle();

      if (error) {
        console.error("Error checking domain:", error);
        setDomainStatus("idle");
        return;
      }

      setDomainStatus(data ? "taken" : "available");
    } catch (error) {
      console.error("Error checking domain:", error);
      setDomainStatus("idle");
    }
  };

  // Debounced domain check
  useEffect(() => {
    const timer = setTimeout(() => {
      checkDomainAvailability(domain);
    }, 500);

    return () => clearTimeout(timer);
  }, [domain, accommodationId]);

  const handleDomainChange = (value: string) => {
    // Clean and normalize domain input
    const cleaned = value
      .replace(/^(https?:\/\/)?/, "")
      .replace(/\/$/, "")
      .toLowerCase()
      .trim();
    setDomain(cleaned);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`已複製 ${label}`);
  };

  const handleSave = async () => {
    if (!domain) {
      toast.error("請輸入網域");
      return;
    }

    if (domainStatus === "invalid") {
      toast.error("網域格式不正確");
      return;
    }

    if (domainStatus === "taken") {
      toast.error("此網域已被其他民宿使用");
      return;
    }

    if (domainStatus === "checking") {
      toast.error("正在檢查網域，請稍候");
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("accommodation_info")
        .update({ custom_domain: domain })
        .eq("id", accommodationId);

      if (error) throw error;

      toast.success("自訂網域已儲存", {
        description: `${domain} 已綁定至 ${accommodationName}`,
      });
      onDomainUpdated();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error saving domain:", error);
      if (error.message?.includes("duplicate") || error.code === "23505") {
        toast.error("此網域已被其他民宿使用");
      } else {
        toast.error("儲存失敗", { description: error.message });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveDomain = async () => {
    setIsRemoving(true);
    try {
      const { error } = await supabase
        .from("accommodation_info")
        .update({ custom_domain: null })
        .eq("id", accommodationId);

      if (error) throw error;

      toast.success("自訂網域已移除");
      onDomainUpdated();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error removing domain:", error);
      toast.error("移除失敗", { description: error.message });
    } finally {
      setIsRemoving(false);
    }
  };

  const getStatusIcon = () => {
    switch (domainStatus) {
      case "checking":
        return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
      case "available":
        return <CheckCircle2 className="h-4 w-4 text-primary" />;
      case "taken":
        return <XCircle className="h-4 w-4 text-destructive" />;
      case "invalid":
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      default:
        return null;
    }
  };

  const getStatusText = () => {
    switch (domainStatus) {
      case "checking":
        return "檢查中...";
      case "available":
        return "可以使用";
      case "taken":
        return "已被其他民宿使用";
      case "invalid":
        return "格式不正確";
      default:
        return "";
    }
  };

  // Lovable's IP for A record
  const targetIP = "185.158.133.1";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            自訂網域設定 - {accommodationName}
          </DialogTitle>
          <DialogDescription>
            綁定您自己的網域，讓客人可以透過您的網域直接訪問民宿網站
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Current Domain Status */}
          {currentDomain && (
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  目前綁定的網域
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <code className="bg-background px-3 py-1.5 rounded text-sm font-mono">
                    {currentDomain}
                  </code>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(currentDomain, "網域")}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleRemoveDomain}
                      disabled={isRemoving}
                      className="text-destructive hover:text-destructive"
                    >
                      {isRemoving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Domain Input */}
          <div className="space-y-2">
            <Label htmlFor="domain">{currentDomain ? "更換網域" : "輸入您的網域"}</Label>
            <div className="relative">
              <Input
                id="domain"
                value={domain}
                onChange={(e) => handleDomainChange(e.target.value)}
                placeholder="例如：www.myhotel.com 或 myhotel.com"
                disabled={isSaving}
                className="pr-10"
              />
              {domain && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {getStatusIcon()}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                輸入完整網域名稱，例如 myhotel.com 或 www.myhotel.com
              </span>
              {domain && domainStatus !== "idle" && (
                <span className={`flex items-center gap-1 ${
                  domainStatus === "available" ? "text-primary" :
                  domainStatus === "taken" ? "text-destructive" :
                  domainStatus === "invalid" ? "text-amber-500" :
                  "text-muted-foreground"
                }`}>
                  {getStatusText()}
                </span>
              )}
            </div>
          </div>

          {/* DNS Setup Instructions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">DNS 設定說明</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                請在您的網域註冊商或 DNS 服務商處，新增以下 DNS 記錄：
              </p>

              <div className="bg-muted rounded-lg p-4 space-y-3">
                {/* A Record for root domain */}
                <div>
                  <div className="text-xs text-muted-foreground mb-1">根網域 (例如 myhotel.com)</div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground block text-xs">類型</span>
                      <Badge variant="outline">A</Badge>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-xs">名稱</span>
                      <div className="flex items-center gap-1">
                        <code className="bg-background px-2 py-0.5 rounded text-xs font-mono">@</code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => copyToClipboard("@", "名稱")}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-xs">值</span>
                      <div className="flex items-center gap-1">
                        <code className="bg-background px-2 py-0.5 rounded text-xs font-mono">{targetIP}</code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => copyToClipboard(targetIP, "IP 位址")}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-3">
                  <div className="text-xs text-muted-foreground mb-1">www 子網域 (例如 www.myhotel.com)</div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground block text-xs">類型</span>
                      <Badge variant="outline">A</Badge>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-xs">名稱</span>
                      <div className="flex items-center gap-1">
                        <code className="bg-background px-2 py-0.5 rounded text-xs font-mono">www</code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => copyToClipboard("www", "名稱")}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-xs">值</span>
                      <div className="flex items-center gap-1">
                        <code className="bg-background px-2 py-0.5 rounded text-xs font-mono">{targetIP}</code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => copyToClipboard(targetIP, "IP 位址")}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  DNS 記錄設定完成後，可能需要等待最多 72 小時才能完全生效。
                  系統會自動為您的網域配置 SSL 憑證。
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            取消
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={isSaving || !domain || domainStatus === "taken" || domainStatus === "invalid" || domainStatus === "checking"}
          >
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            儲存網域
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
