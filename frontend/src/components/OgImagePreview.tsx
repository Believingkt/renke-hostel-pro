import { Card, CardContent } from "@/components/ui/card";
import { Facebook, Twitter, Linkedin } from "lucide-react";

interface OgImagePreviewProps {
  title: string;
  description: string;
  imageUrl: string;
  url?: string;
}

export const OgImagePreview = ({ title, description, imageUrl, url }: OgImagePreviewProps) => {
  const displayUrl = url || "www.example.com";
  const truncatedDescription = description.length > 150 ? description.substring(0, 150) + "..." : description;

  return (
    <div className="space-y-4 mt-4 p-4 bg-muted/30 rounded-lg">
      <div className="flex items-center gap-2 mb-4">
        <Info className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-medium">社群媒體預覽效果</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Facebook Preview */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Facebook className="h-4 w-4 text-[#1877F2]" />
            <span>Facebook</span>
          </div>
          <Card className="overflow-hidden border-border/50">
            <CardContent className="p-0">
              <div className="aspect-[1.91/1] bg-muted relative overflow-hidden">
                {imageUrl ? (
                  <img 
                    src={imageUrl} 
                    alt="Facebook preview" 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
                    無圖片
                  </div>
                )}
              </div>
              <div className="p-3 bg-card space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide truncate">
                  {displayUrl}
                </p>
                <h3 className="font-semibold text-sm line-clamp-2 leading-tight">
                  {title || "標題"}
                </h3>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {truncatedDescription || "描述"}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Twitter Preview */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Twitter className="h-4 w-4 text-[#1DA1F2]" />
            <span>Twitter (X)</span>
          </div>
          <Card className="overflow-hidden border-border/50">
            <CardContent className="p-0">
              <div className="aspect-[2/1] bg-muted relative overflow-hidden">
                {imageUrl ? (
                  <img 
                    src={imageUrl} 
                    alt="Twitter preview" 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
                    無圖片
                  </div>
                )}
              </div>
              <div className="p-3 bg-card space-y-1 border-t border-l border-r rounded-t-none">
                <h3 className="font-semibold text-sm line-clamp-2 leading-tight">
                  {title || "標題"}
                </h3>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {truncatedDescription || "描述"}
                </p>
                <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                  <span className="opacity-50">🔗</span>
                  {displayUrl}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* LinkedIn Preview */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Linkedin className="h-4 w-4 text-[#0A66C2]" />
            <span>LinkedIn</span>
          </div>
          <Card className="overflow-hidden border-border/50">
            <CardContent className="p-0">
              <div className="aspect-[1.91/1] bg-muted relative overflow-hidden">
                {imageUrl ? (
                  <img 
                    src={imageUrl} 
                    alt="LinkedIn preview" 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
                    無圖片
                  </div>
                )}
              </div>
              <div className="p-3 bg-card space-y-1">
                <h3 className="font-semibold text-sm line-clamp-2 leading-tight">
                  {title || "標題"}
                </h3>
                <p className="text-xs text-muted-foreground truncate">
                  {displayUrl}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-4 p-3 bg-primary/5 rounded-md border border-primary/20">
        <div className="flex gap-2 text-sm">
          <div className="text-primary mt-0.5">💡</div>
          <div className="space-y-1">
            <p className="font-medium text-sm">最佳實踐建議</p>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
              <li>使用 1200x630 像素的圖片以確保在所有平台上都能完美顯示</li>
              <li>重要內容應放在中央區域，避免被平台裁切</li>
              <li>文字清晰易讀，即使在小螢幕上也要能夠辨識</li>
              <li>檔案大小建議不超過 8MB 以確保快速載入</li>
              <li>支援 JPG、PNG 和 WebP 格式</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

// Info icon import
import { Info } from "lucide-react";
