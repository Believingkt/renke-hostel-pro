import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SEOHead } from "@/components/SEOHead";
import heroImage from "/images/villa-landing-hero.jpg";
import {
  ArrowDown, Calendar, MapPin, Users, Waves, Wind, Coffee, Bath, Wifi, Tv, UtensilsCrossed,
  MessageCircle, ArrowRight
} from "lucide-react";
import room1 from "/images/villa-room-1.jpg";
import room2 from "/images/villa-room-2.jpg";
import room3 from "/images/villa-room-3.jpg";

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
  const navigate = useNavigate();
  const heroRef = useRef<HTMLDivElement>(null);
  const [acc, setAcc] = useState<AccommodationData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isVisible, setIsVisible] = useState(false);
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");

  const resolvedId = accId ?? "5f764d55-ae11-4631-80fe-2e611853deae";

  /* fetch accommodation data */
  useEffect(() => {
    let cancelled = false;
    async function fetchAcc() {
      setIsLoading(true);
      const { data, error } = await (supabase as any)
        .from("accommodations")
        .select("id,name,description,image_url,region")
        .eq("id", resolvedId)
        .single();
      if (!cancelled) {
        if (data && !error) setAcc(data as AccommodationData);
        setIsLoading(false);
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

  /* scroll-triggered reveal animation */
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("revealed");
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
    );
    const els = document.querySelectorAll(".reveal-on-scroll");
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  /* scroll-to helper */
  const scrollToContent = () => {
    heroRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-[#F9F8F6] font-sans text-gray-800 pb-28">
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

      {/* ======================== PROMO BANNER ======================== */}
      <section className="mx-auto max-w-6xl px-4 pt-16 sm:px-6 sm:pt-20">
        <div className="reveal-on-scroll relative overflow-hidden rounded-2xl border border-stone-200/80 bg-[#F5F0EB] p-8 sm:p-12">
          {/* Subtle decorative corner accents */}
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
                5月專屬：週五微假期
              </h3>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-stone-500 sm:text-base">
                避開週末人潮，為自己多留一晚寧靜。現在預訂 5 月份週五入住，享專屬迎賓小點與提早入住服務。
              </p>
            </div>

            <a
              href={`/booking/villa/${resolvedId}?filter=friday`}
              className="inline-flex shrink-0 items-center rounded-full border border-stone-400 px-7 py-3 text-sm font-medium tracking-wider text-stone-600 transition hover:bg-stone-700 hover:text-white hover:border-stone-700"
            >
              查看週五空房
            </a>
          </div>
        </div>
      </section>

      {/* ======================== ROOM TYPES ======================== */}
      <section className="mx-auto max-w-6xl px-4 pt-24 sm:px-6 sm:pt-28">
        <div className="text-center reveal-on-scroll">
          <p className="text-xs tracking-[0.3em] text-stone-400">ROOM TYPES</p>
          <h2
            className="mt-3 text-2xl font-semibold text-gray-800 sm:text-3xl"
            style={{ fontFamily: "'Noto Serif TC', serif" }}
          >
            房型介紹
          </h2>
          <div className="mx-auto mt-4 h-px w-16 bg-stone-300" />
          <p className="mx-auto mt-6 max-w-xl text-sm leading-relaxed text-stone-500 sm:text-base">
            每一間房，都是一段獨立的故事。保留老宅靈魂的舒適空間，靜靜等候你來書寫屬於自己的篇章。
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          {[
            {
              image: room1,
              name: "和風雙人房",
              tagline: "保留老宅靈魂的木質溫度",
              desc: "走進房內，木紋的呼吸與光影交織。👆 細看那扇老窗框的紋理，記錄著時光留下的溫柔印記。",
              facilities: [
                { icon: Wind, label: "獨立冷氣" },
                { icon: Wifi, label: "高速 Wi-Fi" },
                { icon: Coffee, label: "手沖咖啡組" },
                { icon: Bath, label: "備品齊全" },
              ],
            },
            {
              image: room2,
              name: "山景閣樓房",
              tagline: "在屋簷下眺望整片山巒",
              desc: "晨光從斜屋頂的木樑灑落，喚醒沉睡的感官。👆 抬頭望去，那道光與山的對話，正是這個房間最美的角落。",
              facilities: [
                { icon: Wind, label: "獨立冷氣" },
                { icon: Wifi, label: "高速 Wi-Fi" },
                { icon: Tv, label: "Smart TV" },
                { icon: Bath, label: "獨立衛浴" },
              ],
            },
            {
              image: room3,
              name: "家庭和室套房",
              tagline: "一家人共度的靜謐時光",
              desc: "寬敞的空間延伸至庭院，每一張床都靠近彼此的呼吸。👆 那盞紙燈下的場景，最適合留下全家最自然的笑容。",
              facilities: [
                { icon: Wind, label: "獨立冷氣" },
                { icon: UtensilsCrossed, label: "簡易廚房" },
                { icon: Coffee, label: "茶水備品" },
                { icon: Bath, label: "檜木浴缸" },
              ],
            },
          ].map((room, i) => (
            <article
              key={room.name}
              className="reveal-on-scroll group flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-100 transition hover:shadow-md"
              style={{ transitionDelay: `${i * 100}ms` }}
            >
              {/* 上：圖片 */}
              <div className="aspect-[4/3] w-full overflow-hidden bg-stone-100">
                <img
                  src={room.image}
                  alt={room.name}
                  width={1280}
                  height={896}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                />
              </div>

              {/* 下：文字 */}
              <div className="flex flex-1 flex-col gap-5 p-6 sm:p-7">
                <div>
                  <h3
                    className="text-xl font-semibold text-gray-800"
                    style={{ fontFamily: "'Noto Serif TC', serif" }}
                  >
                    {room.name}
                  </h3>
                  <p className="mt-1 text-sm tracking-wide text-stone-400">
                    {room.tagline}
                  </p>
                </div>

                <p className="text-sm leading-relaxed text-stone-600">
                  {room.desc}
                </p>

                {/* 設施 icon 化 */}
                <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-stone-100 pt-5">
                  {room.facilities.map((f) => (
                    <div
                      key={f.label}
                      className="flex items-center gap-1.5 text-stone-500"
                    >
                      <f.icon className="h-4 w-4" strokeWidth={1.5} />
                      <span className="text-xs tracking-wide">{f.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </article>
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
