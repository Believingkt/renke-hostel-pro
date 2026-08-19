import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface QuickNavItem {
  id: string;
  label: string;
}

interface Props {
  items: QuickNavItem[];
  onSelect: (id: string) => void;
  className?: string;
}

/** 團購頁頁內快速導覽列（sticky，含 scroll spy） */
export function GroupBuyQuickNav({ items, onSelect, className }: Props) {
  const [active, setActive] = useState<string>(items[0]?.id ?? "");

  useEffect(() => {
    if (items.length === 0) return;
    const observed: Element[] = [];
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible?.target.id) setActive(visible.target.id);
      },
      { rootMargin: "-96px 0px -65% 0px", threshold: 0 },
    );
    items.forEach((it) => {
      const el = document.getElementById(it.id);
      if (el) {
        observer.observe(el);
        observed.push(el);
      }
    });
    return () => observer.disconnect();
  }, [items]);

  if (items.length < 2) return null;

  return (
    <nav
      className={cn(
        "sticky top-0 z-30 -mx-5 border-b border-border/60 bg-background/95 px-5 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:-mx-6 sm:px-6",
        className,
      )}
      aria-label="頁內快速導覽"
    >
      <div className="flex gap-1 overflow-x-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            onClick={() => onSelect(it.id)}
            aria-current={active === it.id ? "true" : undefined}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
              active === it.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {it.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

export default GroupBuyQuickNav;
