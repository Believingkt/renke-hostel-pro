import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ImagePlus, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageUploadFieldProps {
  value: string | null | undefined;
  onChange: (url: string | null) => void;
  /** 儲存路徑前綴，例如 `${accommodationId}/group-buy` */
  pathPrefix: string;
  className?: string;
  aspect?: string;
}

const BUCKET = "room-photos";
const MAX_BYTES = 8 * 1024 * 1024;

/** 圖片上傳欄位：直接上傳到儲存空間並回傳公開網址（取代手動貼網址） */
export function ImageUploadField({
  value,
  onChange,
  pathPrefix,
  className,
  aspect = "aspect-[16/9]",
}: ImageUploadFieldProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "請選擇圖片檔", variant: "destructive" });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast({ title: "圖片超過 8MB", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${pathPrefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, cacheControl: "3600" });
      if (error) throw error;
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      onChange(data.publicUrl);
      toast({ title: "圖片已上傳" });
    } catch (e) {
      toast({
        title: "上傳失敗",
        description: e instanceof Error ? e.message : "",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
      {value ? (
        <div className="relative overflow-hidden rounded-lg border border-border">
          <img src={value} alt="已上傳圖片" className={cn("w-full object-cover", aspect)} />
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="absolute right-2 top-2 h-7 w-7"
            onClick={() => onChange(null)}
            aria-label="移除圖片"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-muted/40 text-sm text-muted-foreground transition hover:border-primary/50 hover:text-foreground",
            aspect,
          )}
        >
          {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
          <span>{uploading ? "上傳中…" : "點擊上傳圖片（最大 8MB）"}</span>
        </button>
      )}
      {value && (
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}更換圖片
        </Button>
      )}
    </div>
  );
}
