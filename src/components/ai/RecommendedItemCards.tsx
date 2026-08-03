import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, ImageIcon } from "lucide-react";

export interface RecommendedItem {
  kind: string;
  id: string;
  title: string;
  subtitle?: string;
  price?: number | null;
  image?: string | null;
  badge?: string | null;
  available?: boolean;
  url?: string | null;
}

const KIND_LABEL: Record<string, string> = {
  room: "房型",
  activity: "活動",
  ticket: "票券",
  experience: "體驗",
  attraction: "景點",
  food: "餐飲",
  dining: "餐飲",
  restaurant: "餐飲",
  meal: "餐飲",
};

export function RecommendedItemCards({ items }: { items: RecommendedItem[] }) {
  const navigate = useNavigate();
  if (!items?.length) return null;

  return (
    <div className="mt-3 space-y-2.5">
      <p className="text-sm font-semibold text-foreground flex items-center gap-2 px-1">
        <span className="text-base">✨</span>
        <span>為您推薦</span>
      </p>
      {items.map((item) => (
        <Card
          key={`${item.kind}-${item.id}`}
          className="overflow-hidden border-primary/20 hover:shadow-md transition-all duration-200"
        >
          <div className="flex">
            <div className="relative w-24 shrink-0 bg-muted flex items-center justify-center">
              {item.image ? (
                <img src={item.image} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
              ) : (
                <ImageIcon className="h-6 w-6 text-muted-foreground" aria-hidden />
              )}
            </div>
            <div className="flex-1 p-3 space-y-1.5 min-w-0">
              <div className="flex items-start gap-2">
                <p className="text-sm font-semibold text-foreground line-clamp-2 flex-1">{item.title}</p>
                <Badge variant="secondary" className="shrink-0 text-[10px]">
                  {KIND_LABEL[item.kind] || item.kind}
                </Badge>
              </div>
              {item.subtitle && (
                <p className="text-xs text-muted-foreground line-clamp-1">{item.subtitle}</p>
              )}
              <div className="flex items-center justify-between gap-2 pt-0.5">
                <div className="flex items-center gap-2 min-w-0">
                  {typeof item.price === "number" && item.price > 0 && (
                    <span className="text-sm font-semibold text-primary">
                      NT$ {item.price.toLocaleString()}
                    </span>
                  )}
                  {item.badge && (
                    <Badge
                      variant={item.available === false ? "outline" : "default"}
                      className="text-[10px]"
                    >
                      {item.badge}
                    </Badge>
                  )}
                </div>
                {item.url && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs border-primary/40 text-primary hover:bg-primary/10 shrink-0"
                    onClick={() => navigate(item.url!)}
                  >
                    {item.kind === "room" ? "查看" : "加入行程"}
                    <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
