import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SEOHead } from "@/components/SEOHead";
import fallbackHero from "/images/villa-landing-hero.jpg";
import * as LucideIcons from "lucide-react";
import {
  ArrowDown, Calendar, MapPin, Users, Waves, Wind, Coffee, Bath, Wifi, Tv,
  UtensilsCrossed, MessageCircle, ArrowRight, Mountain, Bed, Flame, Sparkles,
  Camera, UserCheck, ShieldCheck, Home,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  VillaLanding – Sensan single-page landing (data from backend)      */
/*  Read-only: no writes, no business-logic changes.                   */
/* ------------------------------------------------------------------ */

const DEFAULT_ID = "5f764d55-ae11-4631-80fe-2e611853deae";

/* amenity 名稱 → lucide icon 對應（找不到就用 ShieldCheck） */
const amenityIconMap: Record<string, React.ComponentType<any>> = {
  "空調": Wind, "暖氣": Flame, "山景": Mountain, "雙人床": Bed,
  "浴缸": Bath, "私人衛浴": Bath, "獨立衛浴": Bath, "免治馬桶": Bath,
  "淋浴": Bath, "獨立廁所": Bath, "毛巾": Bath, "浴巾": Bath,
  "吹風機": Wind, "洗髮精": Bath, "拖鞋": Bath, "鏡子": Bath, "香皂 / 沐浴乳": Bath,
  "免費無線上網": Wifi, "Wi-Fi": Wifi, "平面電視": Tv,
  "寢具用品": Bed, "遮光窗簾": Home, "衣櫥": Home,
};
const pickAmenityIcon = (name: string) => amenityIconMap[name] ?? ShieldCheck;

/* about_features 的 icon_name (lucide) 動態解析 */
const resolveLucide = (name?: string | null) => {
  if (!name) return Sparkles;
  const C = (LucideIcons as any)[name];
  return C ?? Sparkles;
};

interface AccInfo {
  id: string;
  name: string;
  short_name: string | null;
  description: string | null;
  hero_main_title: string | null;
  hero_subtitle: string | null;
  hero_description: string | null;
  og_image_url: string | null;
  region_1: string | null;
  region_2: string | null;
  address: string | null;
  phone: string | null;
  line_id: string | null;
  building_count: number | null;
}
interface RoomType {
  id: string;
  name: string;
  name_en: string | null;
  description: string | null;
  capacity: number | null;
  size_sqm: number | null;
  display_order: number | null;
  is_exclusive_package: boolean | null;
}
interface Photo { photo_url: string; photo_type?: string; display_order?: number }
interface RoomPhoto extends Photo { room_type_id: string }
interface Amenity { room_type_id: string; amenity_name: string; category: string | null }
interface AboutFeature { title: string; description: string | null; icon_name: string | null }
interface AboutSection { section_title: string | null; section_description: string | null }
interface Pkg {
  id: string; name: string; subtitle: string | null;
  sale_price: number | null; original_price: number | null;
}

export default function VillaLanding() {
  const { accId } = useParams<{ accId: string }>();
  const navigate = useNavigate();
  const heroRef = useRef<HTMLDivElement>(null);

  const resolvedId = accId ?? DEFAULT_ID;

  const [acc, setAcc] = useState<AccInfo | null>(null);
  const [heroPhotos, setHeroPhotos] = useState<Photo[]>([]);
  const [galleryPhotos, setGalleryPhotos] = useState<Photo[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [roomPhotos, setRoomPhotos] = useState<RoomPhoto[]>([]);
  const [amenities, setAmenities] = useState<Amenity[]>([]);
  const [aboutFeatures, setAboutFeatures] = useState<AboutFeature[]>([]);
  const [aboutSection, setAboutSection] = useState<AboutSection | null>(null);
  const [packages, setPackages] = useState<Pkg[]>([]);

  const [isVisible, setIsVisible] = useState(false);
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");

  const [introExpanded, setIntroExpanded] = useState(false);
  const [introNeedsExpand, setIntroNeedsExpand] = useState(false);
  const introTextRef = useRef<HTMLDivElement>(null);

  /* fetch all data in parallel — read-only */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb: any = supabase;
      const [
        accRes, photosRes, rtRes, aboutFRes, aboutSRes, pkgRes,
      ] = await Promise.all([
        sb.from("accommodation_info").select(
          "id,name,short_name,description,hero_main_title,hero_subtitle,hero_description,og_image_url,region_1,region_2,address,phone,line_id,building_count"
        ).eq("id", resolvedId).maybeSingle(),
        sb.from("accommodation_photos").select("photo_url,photo_type,display_order")
          .eq("accommodation_id", resolvedId).order("display_order"),
        sb.from("room_types").select("id,name,name_en,description,capacity,size_sqm,display_order,is_exclusive_package")
          .eq("accommodation_id", resolvedId).order("display_order"),
        sb.from("about_features").select("title,description,icon_name,display_order")
          .eq("accommodation_id", resolvedId).order("display_order"),
        sb.from("about_section").select("section_title,section_description")
          .eq("accommodation_id", resolvedId).maybeSingle(),
        sb.from("accommodation_packages").select("id,name,subtitle,sale_price,original_price,display_order,enabled")
          .eq("accommodation_id", resolvedId).eq("enabled", true).order("display_order"),
      ]);

      if (cancelled) return;

      if (accRes?.data) setAcc(accRes.data as AccInfo);

      const allPhotos = (photosRes?.data ?? []) as Photo[];
      setHeroPhotos(allPhotos.filter((p) => p.photo_type === "hero"));
      setGalleryPhotos(allPhotos.filter((p) => p.photo_type === "gallery"));

      const rts = (rtRes?.data ?? []) as RoomType[];
      setRoomTypes(rts);

      if (rts.length > 0) {
        const ids = rts.map((r) => r.id);
        const [rpRes, amRes] = await Promise.all([
          sb.from("room_photos").select("room_type_id,photo_url,display_order")
            .in("room_type_id", ids).order("display_order"),
          sb.from("room_amenities").select("room_type_id,amenity_name,category")
            .in("room_type_id", ids),
        ]);
        if (!cancelled) {
          setRoomPhotos((rpRes?.data ?? []) as RoomPhoto[]);
          setAmenities((amRes?.data ?? []) as Amenity[]);
        }
      }

      setAboutFeatures((aboutFRes?.data ?? []) as AboutFeature[]);
      if (aboutSRes?.data) setAboutSection(aboutSRes.data as AboutSection);
      setPackages((pkgRes?.data ?? []) as Pkg[]);

      setTimeout(() => setIsVisible(true), 100);
    })();
    return () => { cancelled = true; };
  }, [resolvedId]);

  /* scroll reveal */
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) e.target.classList.add("revealed");
      }),
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
    );
    document.querySelectorAll(".reveal-on-scroll").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [roomTypes, galleryPhotos, aboutFeatures, packages]);

  /* check if intro text exceeds 4 lines on mobile */
  useEffect(() => {
    const checkOverflow = () => {
      const el = introTextRef.current;
      if (!el || window.innerWidth >= 640) {
        setIntroNeedsExpand(false);
        return;
      }
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
      const maxH = lineHeight * 4;
      setIntroNeedsExpand(el.scrollHeight > maxH + 1);
    };
    checkOverflow();
    window.addEventListener("resize", checkOverflow);
    return () => window.removeEventListener("resize", checkOverflow);
  }, [aboutSection?.section_description, acc?.description]);

  const scrollToContent = () =>
    heroRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  /* ---------------- derived ---------------- */
  const accName = acc?.name ?? "森山寫照";
  const heroTitle = acc?.hero_main_title ?? accName;
  const heroSubtitle = acc?.hero_subtitle ?? "";
  const heroDesc = acc?.hero_description ?? "遠離喧囂，找到屬於你的慢步調";
  const accDesc = acc?.description ?? "";
  const region = [acc?.region_1, acc?.region_2].filter(Boolean).join(" ") || "宜蘭 冬山";
  const introParagraphs = (aboutSection?.section_description ?? accDesc)
    .split("\n")
    .filter(Boolean);

  const heroImage = heroPhotos[0]?.photo_url ?? acc?.og_image_url ?? fallbackHero;

  const maxCapacity = useMemo(
    () => roomTypes.reduce((m, r) => Math.max(m, r.capacity ?? 0), 0),
    [roomTypes]
  );

  /* 每房第一張圖 */
  const firstPhotoOf = (rtId: string) =>
    roomPhotos.find((p) => p.room_type_id === rtId)?.photo_url;

  /* 每房前 4 個 amenity（去重） */
  const amenitiesOf = (rtId: string) => {
    const seen = new Set<string>();
    const list = amenities
      .filter((a) => a.room_type_id === rtId)
      .filter((a) => {
        if (seen.has(a.amenity_name)) return false;
        seen.add(a.amenity_name); return true;
      });
    // 優先顯示有意義的關鍵 amenity
    const priority = ["山景", "空調", "免費無線上網", "平面電視", "浴缸", "獨立衛浴", "私人衛浴", "雙人床"];
    const sorted = [
      ...priority.flatMap((k) => list.filter((a) => a.amenity_name === k)),
      ...list.filter((a) => !priority.includes(a.amenity_name)),
    ];
    return sorted.slice(0, 4);
  };

  const featuredPkg = packages[0];

  const lineHref = (() => {
    const raw = (acc?.line_id ?? "").trim();
    if (!raw) return "#";
    const id = raw.startsWith("@") ? raw.slice(1) : raw;
    return `https://line.me/R/ti/p/@${id}?utm_source=villa_landing&utm_medium=floating_btn&utm_campaign=booking_inquiry`;
  })();

  return (
    <div className="min-h-screen bg-[#F9F8F6] font-sans text-gray-800 pb-28">
      <SEOHead
        title={`${accName} – 官方訂房`}
        description={accDesc || heroDesc}
        image={acc?.og_image_url ?? undefined}
      />

      {/* ======================== HERO ======================== */}
      <section className="relative h-[85vh] w-full overflow-hidden sm:h-screen">
        <div className="absolute inset-0">
          <img
            src={heroImage}
            alt={heroTitle}
            className="h-full w-full object-cover object-center"
            fetchPriority="high"
          />
          <div className="absolute inset-0 bg-black/55 sm:bg-black/40" />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#F9F8F6] to-transparent" />
        </div>

        <div className="relative z-10 flex h-full flex-col items-center justify-center px-6 text-center">
          <h1
            className={`max-w-4xl font-serif text-4xl font-semibold leading-snug tracking-wide text-white transition-all duration-1000 sm:text-5xl md:text-6xl lg:text-7xl ${
              isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
            }`}
            style={{ fontFamily: "'Noto Serif TC', serif" }}
          >
            {heroTitle}
          </h1>

          {heroSubtitle && (
            <p
              className={`mt-6 max-w-xl text-lg font-light tracking-[0.3em] text-white/90 transition-all duration-1000 sm:text-xl md:text-2xl ${
                isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
              }`}
              style={{ transitionDelay: "150ms" }}
            >
              {heroSubtitle}
            </p>
          )}

          {heroDesc && (
            <p
              className={`mt-4 max-w-xl text-sm font-light tracking-wider text-white/80 transition-all duration-1000 sm:text-base ${
                isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
              }`}
              style={{ transitionDelay: "250ms" }}
            >
              {heroDesc}
            </p>
          )}

          <div
            className={`mt-10 transition-all duration-1000 ${
              isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
            }`}
            style={{ transitionDelay: "300ms" }}
          >
            <button
              onClick={scrollToContent}
              className="rounded-full bg-white/90 px-8 py-3.5 text-sm font-medium tracking-widest text-gray-800 shadow-lg backdrop-blur-sm transition hover:bg-white hover:shadow-xl"
            >
              探索更多
            </button>
          </div>

          <div
            className={`absolute bottom-10 flex flex-col items-center gap-2 text-white/70 transition-opacity duration-1000 ${
              isVisible ? "opacity-100" : "opacity-0"
            }`}
            style={{ transitionDelay: "600ms" }}
          >
            <span className="text-xs tracking-widest">SCROLL</span>
            <ArrowDown className="h-4 w-4 animate-bounce" />
          </div>
        </div>
      </section>

      {/* ======================== QUICK INFO BAR ======================== */}
      <section ref={heroRef} className="relative z-20 -mt-16 mx-auto max-w-5xl px-4 sm:px-6">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/60 shadow-xl backdrop-blur-md sm:grid-cols-4">
          {[
            { icon: Users, label: "最大容納", value: maxCapacity ? `${maxCapacity} 人` : "— 人" },
            { icon: MapPin, label: "位置", value: region },
            { icon: Waves, label: "型態", value: heroSubtitle || "精品旅宿" },
            { icon: Home, label: "房型數", value: roomTypes.filter(r => !r.is_exclusive_package).length
                ? `${roomTypes.filter(r => !r.is_exclusive_package).length} 種房` : "包棟" },
          ].map((item) => (
            <div key={item.label} className="flex flex-col items-center gap-2 bg-white/80 px-4 py-6 text-center transition hover:bg-white">
              <item.icon className="h-5 w-5 text-stone-500" strokeWidth={1.5} />
              <span className="text-xs tracking-wider text-stone-400">{item.label}</span>
              <span className="text-sm font-medium text-gray-800">{item.value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ======================== PROMO BANNER (real package) ======================== */}
      {featuredPkg && (
        <section className="mx-auto max-w-6xl px-4 pt-16 sm:px-6 sm:pt-20">
          <div className="reveal-on-scroll relative overflow-hidden rounded-2xl border border-stone-200/80 bg-[#F5F0EB] p-8 sm:p-12">
            <div className="absolute left-3 top-3 h-6 w-6 border-l border-t border-stone-300/60" />
            <div className="absolute right-3 top-3 h-6 w-6 border-r border-t border-stone-300/60" />
            <div className="absolute bottom-3 left-3 h-6 w-6 border-b border-l border-stone-300/60" />
            <div className="absolute bottom-3 right-3 h-6 w-6 border-b border-r border-stone-300/60" />

            <div className="relative flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
              <div className="flex-1">
                <p className="text-xs tracking-[0.25em] text-stone-400">SPECIAL PLAN</p>
                <h3
                  className="mt-2 text-2xl font-semibold text-gray-800 sm:text-3xl"
                  style={{ fontFamily: "'Noto Serif TC', serif" }}
                >
                  {featuredPkg.name}
                </h3>
                {featuredPkg.subtitle && (
                  <p className="mt-3 max-w-xl text-sm leading-relaxed text-stone-500 sm:text-base">
                    {featuredPkg.subtitle}
                  </p>
                )}
                {(featuredPkg.sale_price || featuredPkg.original_price) && (
                  <div className="mt-4 flex items-baseline gap-3">
                    {featuredPkg.original_price && featuredPkg.sale_price &&
                      Number(featuredPkg.original_price) > Number(featuredPkg.sale_price) && (
                      <span className="text-sm text-stone-400 line-through">
                        NT$ {Number(featuredPkg.original_price).toLocaleString()}
                      </span>
                    )}
                    <span className="text-xl font-semibold text-[#A98467] sm:text-2xl"
                      style={{ fontFamily: "'Noto Serif TC', serif" }}>
                      NT$ {Number(featuredPkg.sale_price ?? featuredPkg.original_price).toLocaleString()}
                    </span>
                    <span className="text-xs text-stone-400">/ 晚起</span>
                  </div>
                )}
              </div>

              <a
                href={`/booking/villa/${resolvedId}`}
                className="inline-flex shrink-0 items-center rounded-full border border-stone-400 px-7 py-3 text-sm font-medium tracking-wider text-stone-600 transition hover:bg-stone-700 hover:text-white hover:border-stone-700"
              >
                查看此方案
              </a>
            </div>
          </div>
        </section>
      )}

      {/* ======================== ROOM TYPES (real) ======================== */}
      {roomTypes.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pt-24 sm:px-6 sm:pt-28">
          <div className="text-center reveal-on-scroll">
            <p className="text-xs tracking-[0.3em] text-stone-400">ROOM TYPES</p>
            <h2 className="mt-3 text-2xl font-semibold text-gray-800 sm:text-3xl"
              style={{ fontFamily: "'Noto Serif TC', serif" }}>
              房型介紹
            </h2>
            <div className="mx-auto mt-4 h-px w-16 bg-stone-300" />
            <p className="mx-auto mt-6 max-w-xl text-sm leading-relaxed text-stone-500 sm:text-base">
              每一間房，都是一段獨立的故事。在森山的木質溫度與山林靜謐中，找回屬於自己的步調。
            </p>
          </div>

          <div
            className="mt-14 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-8"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {roomTypes.map((rt, i) => {
              const img = firstPhotoOf(rt.id);
              const ams = amenitiesOf(rt.id);
              const desc = (rt.description ?? "").split("\n").filter(Boolean)[0] ?? "";
              return (
                <article
                  key={rt.id}
                  className="reveal-on-scroll group flex min-w-[85vw] snap-start flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-100 transition hover:shadow-md sm:min-w-0"
                  style={{ transitionDelay: `${i * 100}ms` }}
                >
                  <div className="aspect-[4/3] w-full overflow-hidden bg-stone-100">
                    {img ? (
                      <img
                        src={img}
                        alt={rt.name}
                        width={1280}
                        height={896}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-stone-300 text-sm">
                        {rt.name}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col gap-5 p-6 sm:p-7">
                    <div>
                      <div className="flex items-baseline justify-between gap-3">
                        <h3 className="text-xl font-semibold text-gray-800"
                          style={{ fontFamily: "'Noto Serif TC', serif" }}>
                          {rt.name}
                        </h3>
                        {rt.is_exclusive_package && (
                          <span className="rounded-full bg-[#F5F0EB] px-2.5 py-0.5 text-[10px] tracking-wider text-[#A98467]">
                            包區
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm tracking-wide text-stone-400">
                        {rt.capacity ? `可容納 ${rt.capacity} 人` : ""}
                        {rt.size_sqm ? ` · ${rt.size_sqm} 坪` : ""}
                        {rt.name_en ? ` · ${rt.name_en}` : ""}
                      </p>
                    </div>

                    {desc && (
                      <p className="text-sm leading-relaxed text-stone-600 line-clamp-3">
                        👆 {desc}
                      </p>
                    )}

                    {ams.length > 0 && (
                      <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-stone-100 pt-5">
                        {ams.map((a) => {
                          const Icon = pickAmenityIcon(a.amenity_name);
                          return (
                            <div key={a.amenity_name} className="flex items-center gap-1.5 text-stone-500">
                              <Icon className="h-4 w-4" strokeWidth={1.5} />
                              <span className="text-xs tracking-wide">{a.amenity_name}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* ======================== INTRO TEXT (about_section) ======================== */}
      {(aboutSection?.section_title || aboutSection?.section_description || accDesc) && (
        <section className="mx-auto max-w-3xl px-6 py-20 text-center sm:py-28">
          <div className="reveal-on-scroll">
            <h2 className="text-2xl font-semibold leading-relaxed text-gray-800 sm:text-3xl"
              style={{ fontFamily: "'Noto Serif TC', serif" }}>
              {aboutSection?.section_title ?? "在自然中，重新找回生活的節奏"}
            </h2>
            <div className="mx-auto mt-4 h-px w-16 bg-stone-300" />
            <div
              ref={introTextRef}
              className={`mt-8 text-stone-600 sm:text-lg leading-loose sm:leading-relaxed ${introExpanded ? "" : "line-clamp-4"}`}
            >
              {introParagraphs.length > 0 ? (
                introParagraphs.map((para, i) => (
                  <p key={i} className="mb-5 last:mb-0">{para}</p>
                ))
              ) : (
                <p>{aboutSection?.section_description ?? accDesc}</p>
              )}
            </div>
            {introNeedsExpand && !introExpanded && (
              <button
                onClick={() => setIntroExpanded(true)}
                className="mt-5 text-sm tracking-wider text-[#A98467] transition-colors hover:text-[#8a6b52]"
              >
                閱讀更多…
              </button>
            )}
          </div>
        </section>
      )}

      {/* ======================== PHOTO GRID (real gallery) ======================== */}
      {galleryPhotos.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {galleryPhotos.slice(0, 6).map((p, i) => {
              const layout = [
                "aspect-[4/5] lg:col-span-1",
                "aspect-[4/3] lg:col-span-2",
                "aspect-[4/3] lg:col-span-2",
                "aspect-[4/5] lg:col-span-1",
                "aspect-[4/3] lg:col-span-2",
                "aspect-[4/5] lg:col-span-1",
              ][i] ?? "aspect-[4/3] lg:col-span-1";
              return (
                <div
                  key={p.photo_url}
                  className={`${layout} overflow-hidden rounded-2xl bg-stone-200 reveal-on-scroll`}
                  style={{ transitionDelay: `${i * 100}ms` }}
                >
                  <img
                    src={p.photo_url}
                    alt={`${accName} 空間實景 ${i + 1}`}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-700 hover:scale-[1.03]"
                  />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ======================== FEATURES (about_features) ======================== */}
      {aboutFeatures.length > 0 && (
        <section className="bg-white/60 py-20 backdrop-blur-sm sm:py-28">
          <div className="mx-auto max-w-5xl px-6">
            <div className="text-center reveal-on-scroll">
              <h2 className="text-2xl font-semibold text-gray-800 sm:text-3xl"
                style={{ fontFamily: "'Noto Serif TC', serif" }}>
                為什麼選擇{acc?.short_name ?? accName}
              </h2>
              <div className="mx-auto mt-4 h-px w-16 bg-stone-300" />
            </div>

            <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {aboutFeatures.map((f, i) => {
                const Icon = resolveLucide(f.icon_name);
                return (
                  <div
                    key={f.title + i}
                    className="reveal-on-scroll rounded-xl border border-stone-100 bg-white/80 p-8 text-center shadow-sm transition hover:shadow-md"
                    style={{ transitionDelay: `${i * 100}ms` }}
                  >
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#F5F0EB] text-[#A98467]">
                      <Icon className="h-5 w-5" strokeWidth={1.5} />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-800"
                      style={{ fontFamily: "'Noto Serif TC', serif" }}>
                      {f.title}
                    </h3>
                    {f.description && (
                      <p className="mt-3 text-sm leading-relaxed text-stone-500">
                        {f.description}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ======================== CTA / BOOKING ======================== */}
      <section className="mx-auto max-w-4xl px-6 py-20 text-center sm:py-28">
        <div className="reveal-on-scroll">
          <h2 className="text-2xl font-semibold text-gray-800 sm:text-3xl"
            style={{ fontFamily: "'Noto Serif TC', serif" }}>
            準備好放慢腳步了嗎？
          </h2>
          <p className="mt-4 text-stone-500">
            選擇你理想的日期，開啟一段與自然共處的旅程。
          </p>
          <div className="mt-10">
            <a
              href={`/booking/villa/${resolvedId}`}
              className="inline-block rounded-full bg-gray-800 px-10 py-4 text-sm font-medium tracking-widest text-white shadow-lg transition hover:bg-gray-700 hover:shadow-xl"
            >
              立即預約
            </a>
          </div>
        </div>
      </section>

      {/* ======================== FOOTER ======================== */}
      <footer className="border-t border-stone-200 bg-[#F9F8F6] py-10 text-center">
        <p className="text-xs tracking-wider text-stone-400">
          © {new Date().getFullYear()} {accName} · {acc?.address ?? ""}
        </p>
      </footer>

      {/* ======================== STICKY BOOKING BAR ======================== */}
      {/* Mobile target height ~76px (incl. border + safe-area). */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-stone-200/80 bg-white/85 backdrop-blur-md"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-3 py-2 sm:gap-4 sm:px-6 sm:py-4">
          <div className="flex flex-1 items-center gap-1.5 sm:gap-3">
            {/* 入住 */}
            <div className="flex flex-1 flex-col gap-0.5 sm:gap-1">
              <label className="text-[10px] font-medium tracking-wider text-stone-400 sm:text-xs">
                入住
              </label>
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
                <input
                  type="date"
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 bg-white py-1.5 pl-7 pr-1 text-base text-gray-800 outline-none transition focus:border-[#A98467] focus:ring-1 focus:ring-[#A98467]/20 sm:py-2 sm:pl-8 sm:pr-2 sm:text-sm"
                />
              </div>
            </div>

            <ArrowRight className="mt-4 hidden h-4 w-4 shrink-0 text-stone-300 sm:block" />

            {/* 退房 */}
            <div className="flex flex-1 flex-col gap-0.5 sm:gap-1">
              <label className="text-[10px] font-medium tracking-wider text-stone-400 sm:text-xs">
                退房
              </label>
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
                <input
                  type="date"
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 bg-white py-1.5 pl-7 pr-1 text-base text-gray-800 outline-none transition focus:border-[#A98467] focus:ring-1 focus:ring-[#A98467]/20 sm:py-2 sm:pl-8 sm:pr-2 sm:text-sm"
                />
              </div>
            </div>
          </div>

          <button
            onClick={() => {
              const params = new URLSearchParams();
              if (checkIn) params.set("checkIn", checkIn);
              if (checkOut) params.set("checkOut", checkOut);
              const qs = params.toString();
              navigate(`/booking/villa/${resolvedId}${qs ? `?${qs}` : ""}`);
            }}
            className="shrink-0 rounded-xl px-3.5 py-2.5 text-sm font-medium tracking-wider text-white shadow-md transition hover:shadow-lg active:scale-[0.98] sm:px-8 sm:py-3.5 sm:text-base"
            style={{ backgroundColor: "#A98467", minHeight: "44px" }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#95755a"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#A98467"; }}
          >
            <span className="sm:hidden">預訂</span>
            <span className="hidden sm:inline">規劃我的假期</span>
          </button>
        </div>
      </div>

      {/* ======================== FLOATING CONTACT BUTTON ======================== */}
      {/* 必須在 sticky bar 上方：手機 bar 約 76px + 安全區 + 12px 間距 */}
      {acc?.line_id && (
        <a
          href={lineHref}
          target="_blank"
          rel="noopener noreferrer"
          className="group fixed right-4 z-[60] flex items-center gap-2 overflow-hidden rounded-full bg-[#7D9B76] pl-3.5 pr-3.5 text-white shadow-lg transition-all duration-500 hover:pr-5 sm:right-6"
          style={{
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 88px)",
            minHeight: "48px",
            minWidth: "48px",
          }}
          aria-label="聯絡管家 LINE"
        >
          <MessageCircle className="h-5 w-5 shrink-0" />
          <span className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-medium transition-all duration-500 group-hover:max-w-[16rem] group-hover:pr-1">
            對房型有疑問？與管家聊聊
          </span>
        </a>
      )}
    </div>
  );
}
