import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { fetchGroupBuyVenueIntro, type VenueIntroData } from "@/lib/groupBuyVenueIntro";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Expand,
  MapPin,
  Phone,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  accommodationId: string;
  /** 團購頁自身已有的圖片數量，若已有大量圖片則不重複展示民宿相簿 */
  hideGallery?: boolean;
}

/**
 * 團購頁的民宿基本介紹（可於後台自訂，預設帶入官網內容）
 * 定位為「輔助資訊」，視覺權重低於團購方案。
 */
export function GroupBuyVenueIntro({ accommodationId, hideGallery }: Props) {
  const { toast } = useToast();
  const [info, setInfo] = useState<VenueIntroData | null>(null);
  const [index, setIndex] = useState(0);
  const [lightbox, setLightbox] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!accommodationId) return;
      const data = await fetchGroupBuyVenueIntro(accommodationId);
      if (!cancelled) {
        setInfo(data);
        setIndex(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accommodationId]);

  if (!info || info.is_visible === false) return null;

  const photos = hideGallery ? [] : info.gallery_urls.slice(0, 12);
  const total = photos.length;
  const go = (delta: number) => setIndex((i) => (total ? (i + delta + total) % total : 0));

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: `已複製${label}`, description: value });
    } catch {
      toast({ title: "複製失敗，請手動選取", variant: "destructive" });
    }
  };

  return (
    <section className="mt-6 rounded-xl border border-border/60 bg-muted/30 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-foreground">關於這間民宿</h2>
        <Badge variant="outline" className="text-xs">{info.name}</Badge>
        {info.region && <span className="text-xs text-muted-foreground">{info.region}</span>}
      </div>

      {info.description && (
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
          {info.description}
        </p>
      )}

      {total > 0 && (
        <div className="mt-4">
          <div className="group relative overflow-hidden rounded-lg bg-background">
            <img
              src={photos[index]}
              alt={`${info.name} 環境照片 ${index + 1}`}
              loading="lazy"
              className="aspect-[16/10] w-full cursor-zoom-in object-cover"
              onClick={() => setLightbox(true)}
            />
            {total > 1 && (
              <>
                <button
                  type="button"
                  aria-label="上一張"
                  onClick={() => go(-1)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-1.5 text-foreground shadow-sm backdrop-blur transition hover:bg-background"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  aria-label="下一張"
                  onClick={() => go(1)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-1.5 text-foreground shadow-sm backdrop-blur transition hover:bg-background"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}
            <button
              type="button"
              aria-label="全螢幕檢視"
              onClick={() => setLightbox(true)}
              className="absolute right-2 top-2 rounded-full bg-background/80 p-1.5 text-foreground shadow-sm backdrop-blur transition hover:bg-background"
            >
              <Expand className="h-4 w-4" />
            </button>
            <span className="absolute bottom-2 right-2 rounded-full bg-foreground/70 px-2 py-0.5 text-xs text-background">
              {index + 1} / {total}
            </span>
          </div>

          {total > 1 && (
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {photos.map((url, i) => (
                <button
                  key={url + i}
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`檢視第 ${i + 1} 張`}
                  className={cn(
                    "h-14 w-20 flex-shrink-0 overflow-hidden rounded-md border-2 transition",
                    i === index ? "border-primary" : "border-transparent opacity-70 hover:opacity-100",
                  )}
                >
                  <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {info.facilities.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {info.facilities.slice(0, 16).map((f) => (
            <span
              key={f}
              className="inline-flex items-center gap-1 rounded-full bg-background px-2.5 py-1 text-xs text-muted-foreground"
            >
              <CheckCircle2 className="h-3 w-3 text-primary" />
              {f}
            </span>
          ))}
        </div>
      )}

      <Separator className="my-4" />

      <div className="space-y-2 text-sm text-muted-foreground">
        {info.address && (
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(info.address)}`}
              target="_blank"
              rel="noreferrer"
              className="flex-1 underline-offset-2 hover:underline"
            >
              {info.address}
            </a>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => copy("地址", info.address!)}
            >
              <Copy className="mr-1 h-3.5 w-3.5" /> 複製
            </Button>
          </div>
        )}
        {info.location_description && (
          <p className="whitespace-pre-line pl-6">{info.location_description}</p>
        )}
        {info.phone && (
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 flex-shrink-0 text-primary" />
            <a href={`tel:${info.phone}`} className="flex-1 underline-offset-2 hover:underline">
              {info.phone}
            </a>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => copy("電話", info.phone!)}
            >
              <Copy className="mr-1 h-3.5 w-3.5" /> 複製
            </Button>
          </div>
        )}
      </div>

      {info.check_in_notice && (
        <Accordion type="single" collapsible className="mt-2">
          <AccordionItem value="notice" className="border-b-0">
            <AccordionTrigger className="py-2 text-sm hover:no-underline">
              <span className="flex items-center gap-2 text-foreground">
                <Clock className="h-4 w-4 text-primary" /> 入住須知
              </span>
            </AccordionTrigger>
            <AccordionContent className="whitespace-pre-line text-sm text-muted-foreground">
              {info.check_in_notice}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}

      <Dialog open={lightbox} onOpenChange={setLightbox}>
        <DialogContent className="max-w-5xl border-none bg-transparent p-0 shadow-none [&>button]:hidden">
          <div className="relative">
            {total > 0 && (
              <img
                src={photos[index]}
                alt={`${info.name} 環境照片 ${index + 1}`}
                className="max-h-[80vh] w-full rounded-lg object-contain"
              />
            )}
            <button
              type="button"
              aria-label="關閉"
              onClick={() => setLightbox(false)}
              className="absolute right-2 top-2 rounded-full bg-background/80 p-2 text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
            {total > 1 && (
              <>
                <button
                  type="button"
                  aria-label="上一張"
                  onClick={() => go(-1)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2 text-foreground"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  aria-label="下一張"
                  onClick={() => go(1)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2 text-foreground"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export default GroupBuyVenueIntro;
