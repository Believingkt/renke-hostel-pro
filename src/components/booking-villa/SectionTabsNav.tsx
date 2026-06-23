import { useEffect, useRef, useState } from "react";

export interface SectionTab {
  id: string;
  label: string;
}

interface SectionTabsNavProps {
  tabs: SectionTab[];
}

/**
 * 精品民宿訂房頁的橫向錨點頁籤導覽列。
 * - sticky 黏在 header 下方
 * - 使用 IntersectionObserver 追蹤目前可視區塊
 * - 點擊滾動到對應 section（offset 扣掉 header + 自身高度）
 */
export default function SectionTabsNav({ tabs }: SectionTabsNavProps) {
  const [active, setActive] = useState<string>(tabs[0]?.id ?? "");
  const navRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // 觀察各 section 進入視窗時更新 active
  useEffect(() => {
    const els = tabs
      .map((t) => document.getElementById(t.id))
      .filter((el): el is HTMLElement => !!el);
    if (els.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActive(visible[0].target.id);
      },
      {
        rootMargin: "-30% 0px -55% 0px",
        threshold: [0, 0.25, 0.5, 0.75, 1],
      }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [tabs]);

  // active 改變時自動把該頁籤水平捲動到可視範圍
  useEffect(() => {
    const btn = itemRefs.current[active];
    if (btn && navRef.current) {
      const nav = navRef.current;
      const btnLeft = btn.offsetLeft;
      const btnRight = btnLeft + btn.offsetWidth;
      const viewLeft = nav.scrollLeft;
      const viewRight = viewLeft + nav.clientWidth;
      if (btnLeft < viewLeft + 16 || btnRight > viewRight - 16) {
        nav.scrollTo({
          left: btnLeft - nav.clientWidth / 2 + btn.offsetWidth / 2,
          behavior: "smooth",
        });
      }
    }
  }, [active]);

  const handleClick = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    // header (mobile 64) + 本列高度 (約 44)
    const headerOffset = window.matchMedia("(min-width: 768px)").matches
      ? 96 + 48
      : window.matchMedia("(min-width: 640px)").matches
        ? 80 + 48
        : 64 + 48;
    const top = el.getBoundingClientRect().top + window.scrollY - headerOffset;
    window.scrollTo({ top, behavior: "smooth" });
    setActive(id);
  };

  return (
    <div
      className="sticky top-16 sm:top-20 md:top-24 z-40 bg-white/95 backdrop-blur border-b border-gray-100"
      style={{ boxShadow: "0 1px 0 rgba(0,0,0,0.02)" }}
    >
      <div
        ref={navRef}
        className="max-w-3xl mx-auto flex items-center gap-1 overflow-x-auto px-2 h-12 scrollbar-none"
        style={{ scrollbarWidth: "none" }}
      >
        {tabs.map((t) => {
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              ref={(el) => (itemRefs.current[t.id] = el)}
              onClick={() => handleClick(t.id)}
              className="relative shrink-0 px-3 h-12 text-[14px] font-medium transition-colors"
              style={{
                color: isActive ? "#A98467" : "#4B5563",
              }}
            >
              <span className={isActive ? "font-bold" : ""}>{t.label}</span>
              <span
                className="absolute left-1/2 -translate-x-1/2 bottom-1.5 h-[3px] rounded-full transition-all duration-200"
                style={{
                  width: isActive ? "24px" : "0px",
                  background: "#A98467",
                }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
