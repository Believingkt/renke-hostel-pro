import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SEOHead } from "@/components/SEOHead";
import heroImage from "/images/villa-landing-hero.jpg";
import { ArrowDown, Calendar, MapPin, Users, Waves } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  VillaLanding – single-page intro skeleton (Japandi / warm minimal)  */
/* ------------------------------------------------------------------ */

interface AccommodationData {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  region: string | null;
}

export default function VillaLanding() {
  const { accId } = useParams<{ accId: string }>();
  const heroRef = useRef<HTMLDivElement>(null);
  const [acc, setAcc] = useState<AccommodationData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isVisible, setIsVisible] = useState(false);

  const resolvedId = accId ?? "5f764d55-ae11-4631-80fe-2e611853deae";

  /* fetch accommodation data */
  useEffect(() => {
    let cancelled = false;
    async function fetchAcc() {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("accommodations")
        .select("id,name,description,image_url,region")
        .eq("id", resolvedId)
        .single();
      if (!cancelled) {
        if (data && !error) setAcc(data);
        setIsLoading(false);
        // trigger entrance animation
        setTimeout(() => setIsVisible(true), 100);
      }
    }
    fetchAcc();
    return () => { cancelled = true; };
  }, [resolvedId]);

  const accName = acc?.name ?? "森山莊民宿";
  const accDesc =
    acc?.description ??
    "隱身於山林之間的靜謐居所，以簡約自然的設計語彙，為旅人打造一段遠離喧囂的純粹時光。";
  const accRegion = acc?.region ?? "南投埔里";

  /* scroll-to helper */
  const scrollToContent = () => {
    heroRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-[#F9F8F6] font-sans text-gray-800">
      <SEOHead
        title={`${accName} – 官方訂房`}
        description={accDesc}
        image={acc?.image_url ?? undefined}
      />

      {/* ======================== HERO ======================== */}
      <section className="relative h-screen w-full overflow-hidden">
        {/* Full-bleed background image */}
        <div className="absolute inset-0">
          <img
            src={heroImage}
            alt="Villa interior atmosphere"
            className="h-full w-full object-cover"
            fetchPriority="high"
          />
          {/* Dark semi-transparent overlay */}
          <div className="absolute inset-0 bg-black/40" />
          {/* Bottom gradient fade */}
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#F9F8F6] to-transparent" />
        </div>

        {/* Centered white text */}
        <div className="relative z-10 flex h-full flex-col items-center justify-center px-6 text-center">
          <h1
            className={`max-w-4xl font-serif text-4xl font-semibold leading-snug tracking-wide text-white transition-all duration-1000 sm:text-5xl md:text-6xl lg:text-7xl ${
              isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
            }`}
            style={{ fontFamily: "'Noto Serif TC', serif", transitionDelay: "0ms" }}
          >
            遠離喧囂，找到屬於你的慢步調
          </h1>

          <p
            className={`mt-6 max-w-xl text-lg font-light tracking-wider text-white/90 transition-all duration-1000 sm:text-xl md:text-2xl ${
              isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
            }`}
            style={{ transitionDelay: "150ms" }}
          >
            預約一段不被打擾的純粹時光
          </p>

          {/* CTA placeholder */}
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

          {/* Scroll hint */}
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
      <section
        ref={heroRef}
        className="relative z-20 -mt-16 mx-auto max-w-5xl px-4 sm:px-6"
      >
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/60 shadow-xl backdrop-blur-md sm:grid-cols-4">
          {[
            { icon: Users, label: "最大容納", value: "12 人" },
            { icon: MapPin, label: "位置", value: accRegion },
            { icon: Waves, label: "房型", value: "包棟 Villa" },
            { icon: Calendar, label: "最短入住", value: "1 晚" },
          ].map((item) => (
            <div
              key={item.label}
              className="flex flex-col items-center gap-2 bg-white/80 px-4 py-6 text-center transition hover:bg-white"
            >
              <item.icon className="h-5 w-5 text-stone-500" strokeWidth={1.5} />
              <span className="text-xs tracking-wider text-stone-400">
                {item.label}
              </span>
              <span className="text-sm font-medium text-gray-800">
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ======================== INTRO TEXT ======================== */}
      <section className="mx-auto max-w-3xl px-6 py-20 text-center sm:py-28">
        <div className="reveal-on-scroll">
          <h2
            className="text-2xl font-semibold leading-relaxed text-gray-800 sm:text-3xl"
            style={{ fontFamily: "'Noto Serif TC', serif" }}
          >
            在自然中，重新找回生活的節奏
          </h2>
          <div className="mx-auto mt-4 h-px w-16 bg-stone-300" />
          <p className="mt-8 leading-relaxed text-stone-600 sm:text-lg">
            {accDesc}
          </p>
        </div>
      </section>

      {/* ======================== PHOTO GRID (placeholder) ======================== */}
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { aspect: "aspect-[4/5]", col: "lg:col-span-1" },
            { aspect: "aspect-[4/3]", col: "lg:col-span-2" },
            { aspect: "aspect-[4/3]", col: "lg:col-span-2" },
            { aspect: "aspect-[4/5]", col: "lg:col-span-1" },
          ].map((item, i) => (
            <div
              key={i}
              className={`${item.aspect} ${item.col} overflow-hidden rounded-2xl bg-stone-200 reveal-on-scroll`}
              style={{ transitionDelay: `${i * 100}ms` }}
            >
              {/* Placeholder – replace with real images later */}
              <div className="flex h-full w-full items-center justify-center bg-stone-200 text-stone-400">
                <span className="text-sm tracking-wider">空間實景 {i + 1}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ======================== FEATURES / HIGHLIGHTS ======================== */}
      <section className="bg-white/60 py-20 backdrop-blur-sm sm:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center reveal-on-scroll">
            <h2
              className="text-2xl font-semibold text-gray-800 sm:text-3xl"
              style={{ fontFamily: "'Noto Serif TC', serif" }}
            >
              為什麼選擇這裡
            </h2>
            <div className="mx-auto mt-4 h-px w-16 bg-stone-300" />
          </div>

          <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                title: "獨立包棟",
                desc: "專屬空間，不被打擾，與親友共享私密時光。",
              },
              {
                title: "自然景觀",
                desc: "窗外即是山巒與綠意，每一天都在風景中醒來。",
              },
              {
                title: "簡約設計",
                desc: "以 Japandi 美學打造，讓空間回歸純粹與寧靜。",
              },
              {
                title: "完備設施",
                desc: "廚房、影音、戶外休憩區，滿足各種度假需求。",
              },
              {
                title: "貼心服務",
                desc: "從入住到離開，我們讓你只帶走美好回憶。",
              },
              {
                title: "便利交通",
                desc: "距離市區僅數分鐘車程，輕鬆抵達的隱世桃源。",
              },
            ].map((item, i) => (
              <div
                key={item.title}
                className="reveal-on-scroll rounded-xl border border-stone-100 bg-white/80 p-8 text-center shadow-sm transition hover:shadow-md"
                style={{ transitionDelay: `${i * 100}ms` }}
              >
                <h3
                  className="text-lg font-semibold text-gray-800"
                  style={{ fontFamily: "'Noto Serif TC', serif" }}
                >
                  {item.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-stone-500">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ======================== CTA / BOOKING ======================== */}
      <section className="mx-auto max-w-4xl px-6 py-20 text-center sm:py-28">
        <div className="reveal-on-scroll">
          <h2
            className="text-2xl font-semibold text-gray-800 sm:text-3xl"
            style={{ fontFamily: "'Noto Serif TC', serif" }}
          >
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

      {/* ======================== FOOTER (minimal) ======================== */}
      <footer className="border-t border-stone-200 bg-[#F9F8F6] py-10 text-center">
        <p className="text-xs tracking-wider text-stone-400">
          © {new Date().getFullYear()} {accName} · All rights reserved
        </p>
      </footer>
    </div>
  );
}
