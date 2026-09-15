import { useEffect, useRef, useState } from "react";
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

/** 團購頁頁內快速導覽列（page-level sticky，含 scroll spy） */
export function GroupBuyQuickNav({ items, onSelect, className }: Props) {
  const [active, setActive] = useState<string>(items[0]?.id ?? "");
  const scrollerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const key = items.map((i) => i.id).join(",");

  useEffect(() => {
    if (items.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible?.target.id) setActive(visible.target.id);
      },
      { rootMargin: "-64px 0px -55% 0px", threshold: 0 },
    );
    items.forEach((it) => {
      const el = document.getElementById(it.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // active 改變時自動把該項目水平捲到可視範圍
  useEffect(() => {
    const btn = itemRefs.current[active];
    const nav = scrollerRef.current;
    if (!btn || !nav) return;
    const left = btn.offsetLeft;
    const right = left + btn.offsetWidth;
    if (left < nav.scrollLeft + 16 || right > nav.scrollLeft + nav.clientWidth - 16) {
      nav.scrollTo({ left: left - nav.clientWidth / 2 + btn.offsetWidth / 2, behavior: "smooth" });
    }
  }, [active]);

  if (items.length < 2) return null;

  return (
    <nav
      className={cn(
        "sticky top-0 z-30 w-full border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        className,
      )}
      aria-label="頁內快速導覽"
    >
      <div
        ref={scrollerRef}
        className="mx-auto flex w-full max-w-[1040px] gap-1 overflow-x-auto px-5 py-2 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            ref={(el) => (itemRefs.current[it.id] = el)}
            onClick={() => {
              setActive(it.id);
              onSelect(it.id);
            }}
            aria-current={active === it.id ? "true" : undefined}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
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
