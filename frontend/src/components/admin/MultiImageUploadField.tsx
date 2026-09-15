import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ImagePlus, Loader2, X, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToParentElement } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const BUCKET = "room-photos";
const MAX_BYTES = 8 * 1024 * 1024;

interface Props {
  value: string[];
  onChange: (urls: string[]) => void;
  /** 儲存路徑前綴，例如 `${accommodationId}/group-buy/package` */
  pathPrefix: string;
  className?: string;
  aspect?: string;
}

function SortableThumb({
  url,
  index,
  onRemove,
}: {
  url: string;
  index: number;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: url });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "relative overflow-hidden rounded-lg border border-border bg-muted/40",
        isDragging && "z-10 opacity-80 ring-2 ring-primary",
      )}
    >
      <img src={url} alt={`方案圖片 ${index + 1}`} className="aspect-[4/3] w-full object-cover" />
      {index === 0 && (
        <span className="absolute left-1 top-1 rounded bg-primary/90 px-1.5 py-px text-[10px] font-medium leading-4 text-primary-foreground">
          主圖
        </span>
      )}
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="拖曳排序"
        className="no-touch-enlarge absolute bottom-1 left-1 inline-flex h-7 w-7 cursor-grab items-center justify-center rounded-md bg-background/70 p-0 text-muted-foreground shadow-sm hover:bg-background hover:text-foreground active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <button
        type="button"
        className="no-touch-enlarge absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-md bg-background/70 p-0 text-muted-foreground shadow-sm hover:bg-destructive hover:text-destructive-foreground"
        onClick={onRemove}
        aria-label={`移除圖片 ${index + 1}`}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}


/** 多圖上傳欄位：逐張上傳、可刪除、可拖曳排序，第一張即為主圖 */
export function MultiImageUploadField({ value, onChange, pathPrefix, className, aspect = "aspect-[4/3]" }: Props) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const urls = value ?? [];

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const uploadOne = async (file: File): Promise<string | null> => {
    if (!file.type.startsWith("image/")) {
      toast({ title: `${file.name}：請選擇圖片檔`, variant: "destructive" });
      return null;
    }
    if (file.size > MAX_BYTES) {
      toast({ title: `${file.name}：圖片超過 8MB`, variant: "destructive" });
      return null;
    }
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${pathPrefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, cacheControl: "3600" });
    if (error) {
      toast({ title: "上傳失敗", description: error.message, variant: "destructive" });
      return null;
    }
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  };

  const handleFiles = async (files: File[]) => {
    setUploading(true);
    try {
      const added: string[] = [];
      for (const f of files) {
        const url = await uploadOne(f);
        if (url) added.push(url);
      }
      if (added.length > 0) {
        onChange([...urls, ...added]);
        toast({ title: `已上傳 ${added.length} 張圖片` });
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = urls.indexOf(String(active.id));
    const to = urls.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onChange(arrayMove(urls, from, to));
  };

  return (
    <div className={cn("space-y-2", className)}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) void handleFiles(files);
        }}
      />

      {urls.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToParentElement]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={urls} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-none sm:[grid-template-columns:repeat(auto-fill,minmax(190px,1fr))]">
              {urls.map((url, i) => (
                <SortableThumb
                  key={url}
                  url={url}
                  index={i}
                  onRemove={() => onChange(urls.filter((u) => u !== url))}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={cn(
            "flex w-full max-w-sm flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-muted/40 px-3 text-center text-sm text-muted-foreground transition hover:border-primary/50 hover:text-foreground",
            aspect,
          )}
        >
          {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
          <span>{uploading ? "上傳中…" : "點擊上傳圖片（可多選，單張最大 8MB）"}</span>
        </button>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {urls.length > 0 && (
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-1 h-4 w-4" />}
            新增圖片
          </Button>
        )}
        <p className="text-xs text-muted-foreground">第一張為方案主圖，可直接拖曳縮圖調整順序。</p>
      </div>
    </div>
  );
}

export default MultiImageUploadField;
