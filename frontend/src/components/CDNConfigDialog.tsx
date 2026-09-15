import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { CDNConfig, CDNProvider, saveCDNConfig } from "@/utils/cdnHelper";
import { Info } from "lucide-react";

interface CDNConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CDNConfigDialog = ({ open, onOpenChange }: CDNConfigDialogProps) => {
  const [config, setConfig] = useState<CDNConfig>({
    provider: 'none',
    enabled: false,
  });

  useEffect(() => {
    // 載入現有配置
    const storedConfig = localStorage.getItem('cdn_config');
    if (storedConfig) {
      setConfig(JSON.parse(storedConfig));
    }
  }, [open]);

  const handleSave = () => {
    // 驗證配置
    if (config.enabled && config.provider !== 'none') {
      if (config.provider === 'cloudflare' && !config.accountHash) {
        toast.error('請輸入 Cloudflare Account Hash');
        return;
      }
      if ((config.provider === 'imgix' || config.provider === 'bunny') && !config.baseUrl) {
        toast.error('請輸入 CDN Base URL');
        return;
      }
      if (config.provider === 'cloudimage' && !config.accountHash) {
        toast.error('請輸入 CloudImage Token');
        return;
      }
    }

    saveCDNConfig(config);
    toast.success('CDN 配置已儲存！重新載入頁面後生效。');
    onOpenChange(false);
  };

  const getProviderHelp = (provider: CDNProvider) => {
    switch (provider) {
      case 'cloudflare':
        return 'Cloudflare Images 提供全球 CDN 加速和自動圖片優化。需要 Cloudflare 帳號。';
      case 'imgix':
        return 'imgix 是專業的圖片處理和 CDN 服務，提供強大的圖片轉換功能。';
      case 'cloudimage':
        return 'CloudImage.io 提供經濟實惠的圖片 CDN 和優化服務。';
      case 'bunny':
        return 'Bunny CDN 提供高性能、低成本的全球 CDN 服務。';
      default:
        return '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>CDN 加速設定</DialogTitle>
          <DialogDescription>
            配置 CDN 服務以加速全球圖片載入速度
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* 啟用 CDN */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>啟用 CDN 加速</Label>
              <p className="text-sm text-muted-foreground">
                透過全球分發節點優化圖片載入
              </p>
            </div>
            <Switch
              checked={config.enabled}
              onCheckedChange={(enabled) => setConfig({ ...config, enabled })}
            />
          </div>

          {/* CDN 提供商 */}
          {config.enabled && (
            <>
              <div className="space-y-2">
                <Label>CDN 提供商</Label>
                <Select
                  value={config.provider}
                  onValueChange={(provider) =>
                    setConfig({ ...config, provider: provider as CDNProvider })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">不使用 CDN</SelectItem>
                    <SelectItem value="cloudflare">Cloudflare Images</SelectItem>
                    <SelectItem value="imgix">imgix</SelectItem>
                    <SelectItem value="cloudimage">CloudImage.io</SelectItem>
                    <SelectItem value="bunny">Bunny CDN</SelectItem>
                  </SelectContent>
                </Select>
                {config.provider !== 'none' && (
                  <div className="flex items-start gap-2 p-3 bg-primary/5 rounded-md border border-primary/20">
                    <Info className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      {getProviderHelp(config.provider)}
                    </p>
                  </div>
                )}
              </div>

              {/* Cloudflare 設定 */}
              {config.provider === 'cloudflare' && (
                <div className="space-y-2">
                  <Label>Cloudflare Account Hash</Label>
                  <Input
                    placeholder="example.com 或您的 Cloudflare 域名"
                    value={config.accountHash || ''}
                    onChange={(e) =>
                      setConfig({ ...config, accountHash: e.target.value })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    您的 Cloudflare 域名或 Account Hash，用於構建 CDN URL
                  </p>
                </div>
              )}

              {/* imgix / Bunny 設定 */}
              {(config.provider === 'imgix' || config.provider === 'bunny') && (
                <div className="space-y-2">
                  <Label>CDN Base URL</Label>
                  <Input
                    placeholder="https://your-domain.imgix.net"
                    value={config.baseUrl || ''}
                    onChange={(e) =>
                      setConfig({ ...config, baseUrl: e.target.value })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    您的 {config.provider === 'imgix' ? 'imgix' : 'Bunny CDN'} Base URL
                  </p>
                </div>
              )}

              {/* CloudImage 設定 */}
              {config.provider === 'cloudimage' && (
                <div className="space-y-2">
                  <Label>CloudImage Token</Label>
                  <Input
                    placeholder="your-token"
                    value={config.accountHash || ''}
                    onChange={(e) =>
                      setConfig({ ...config, accountHash: e.target.value })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    您的 CloudImage Token，可在 CloudImage 控制台中找到
                  </p>
                </div>
              )}

              {/* 使用說明 */}
              <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
                <h4 className="font-medium text-sm">使用說明</h4>
                <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                  <li>配置完成後，所有圖片將自動透過 CDN 載入</li>
                  <li>CDN 會自動優化圖片格式（WebP/AVIF）和尺寸</li>
                  <li>首次載入可能較慢，後續會使用 CDN 快取</li>
                  <li>建議搭配響應式圖片功能以獲得最佳效果</li>
                </ul>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSave}>儲存配置</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
