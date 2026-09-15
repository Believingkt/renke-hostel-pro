import { useEffect } from "react";
import { buildAccommodationCanonical, BOOKING_PORTAL_ORIGIN } from "@/lib/canonicalUrl";

interface AccommodationInfo {
  id?: string | null;
  name: string;
  description: string | null;
  address: string | null;
  phone?: string | null;
  email?: string | null;
  star_rating?: string | null;
  custom_domain?: string | null;
  short_url_alias?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
}

interface RoomType {
  id: string;
  name: string;
  description: string;
  capacity: number;
  size_sqm: number;
  base_price: number;
  room_photos?: { photo_url: string }[];
}

interface StructuredDataProps {
  accommodationInfo: AccommodationInfo;
  roomTypes?: RoomType[];
  averageRating?: number;
  reviewCount?: number;
}

/**
 * 遞迴移除 null / undefined / 空字串 / 空陣列 / 空物件，
 * 避免把 null 或空值直接輸出到 JSON-LD。數字 0 由呼叫端各自判斷是否有意義。
 */
function pruneEmpty<T>(value: T): T | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return value.trim() === "" ? undefined : (value as T);
  if (Array.isArray(value)) {
    const arr = value.map(pruneEmpty).filter((v) => v !== undefined);
    return arr.length > 0 ? (arr as unknown as T) : undefined;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const pruned = pruneEmpty(v);
      if (pruned !== undefined) out[k] = pruned;
    }
    // 只剩 @type / @context 等骨架時視為空物件
    const meaningful = Object.keys(out).filter((k) => !k.startsWith("@"));
    return meaningful.length > 0 ? (out as T) : undefined;
  }
  return value;
}

const toFiniteNumber = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
};

export const StructuredData = ({
  accommodationInfo,
  roomTypes = [],
  averageRating,
  reviewCount,
}: StructuredDataProps) => {
  useEffect(() => {
    // 清除舊的結構化資料
    const existingScripts = document.querySelectorAll('script[type="application/ld+json"]');
    existingScripts.forEach(script => script.remove());

    // 網址一律與頁面 canonical 同源同值，不使用 window.location.*
    const pageUrl = buildAccommodationCanonical({
      id: accommodationInfo.id,
      custom_domain: accommodationInfo.custom_domain,
      short_url_alias: accommodationInfo.short_url_alias,
    });
    let origin = BOOKING_PORTAL_ORIGIN;
    try {
      origin = new URL(pageUrl).origin;
    } catch {
      /* 保底使用平台主網域 */
    }

    const lat = toFiniteNumber(accommodationInfo.latitude);
    const lng = toFiniteNumber(accommodationInfo.longitude);
    const positivePrices = roomTypes
      .map((r) => toFiniteNumber(r.base_price))
      .filter((p): p is number => p !== undefined && p > 0);

    // 旅館/企業資訊
    const hotelData = pruneEmpty({
      "@context": "https://schema.org",
      "@type": "LodgingBusiness",
      "@id": `${pageUrl}#organization`,
      "name": accommodationInfo.name,
      "description": accommodationInfo.description,
      "image": `${origin}/og-image.jpg`,
      "url": pageUrl,
      "telephone": accommodationInfo.phone,
      "email": accommodationInfo.email,
      "address": {
        "@type": "PostalAddress",
        "streetAddress": accommodationInfo.address,
        "addressCountry": "TW",
        "addressLocality": accommodationInfo.address?.includes("南投") ? "南投縣" :
                          accommodationInfo.address?.includes("宜蘭") ? "宜蘭縣" : "台灣"
      },
      ...(lat !== undefined && lng !== undefined
        ? {
            "geo": {
              "@type": "GeoCoordinates",
              "latitude": lat.toString(),
              "longitude": lng.toString()
            }
          }
        : {}),
      // 僅在有真實評分資料時才輸出，避免虛假評分觸發 Google 結構化資料人工處罰
      ...(averageRating !== undefined && reviewCount !== undefined && reviewCount > 0
        ? {
            "aggregateRating": {
              "@type": "AggregateRating",
              "ratingValue": averageRating.toString(),
              "bestRating": "5",
              "worstRating": "1",
              "ratingCount": reviewCount.toString()
            }
          }
        : {}),
      "priceRange": positivePrices.length > 0
        ? `NT$${Math.min(...positivePrices)} - NT$${Math.max(...positivePrices)}`
        : "$$",
      "starRating": accommodationInfo.star_rating ? {
        "@type": "Rating",
        "ratingValue": accommodationInfo.star_rating
      } : undefined,
      "amenityFeature": [
        { "@type": "LocationFeatureSpecification", "name": "免費停車" },
        { "@type": "LocationFeatureSpecification", "name": "免費WiFi" },
        { "@type": "LocationFeatureSpecification", "name": "管家服務" },
        { "@type": "LocationFeatureSpecification", "name": "一泊二食" }
      ],
      "checkinTime": "15:00",
      "checkoutTime": "11:00"
    });

    // 房型資訊（每個房型作為一個產品）
    const roomsData = roomTypes.map((room) => {
      const price = toFiniteNumber(room.base_price);
      const capacity = toFiniteNumber(room.capacity);
      const size = toFiniteNumber(room.size_sqm);

      const descParts = [
        capacity !== undefined && capacity > 0 ? `最多可容納 ${capacity} 人` : null,
        size !== undefined && size > 0 ? `室內空間 ${size} 平方公尺` : null,
      ].filter(Boolean);

      return pruneEmpty({
        "@context": "https://schema.org",
        "@type": "Product",
        "@id": `${pageUrl}#room-${room.id}`,
        "name": `${accommodationInfo.name} - ${room.name}`,
        "description":
          room.description ||
          (descParts.length > 0 ? `${room.name}，${descParts.join("，")}` : room.name),
        "image": room.room_photos && room.room_photos.length > 0
          ? room.room_photos.map(p => p.photo_url)
          : [`${origin}/og-image.jpg`],
        "brand": {
          "@type": "Brand",
          "name": accommodationInfo.name
        },
        ...(price !== undefined && price > 0
          ? {
              "offers": {
                "@type": "AggregateOffer",
                "availability": "https://schema.org/InStock",
                "priceCurrency": "TWD",
                "lowPrice": price.toString(),
                "highPrice": price.toString(),
                "priceValidUntil": new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                "url": `${pageUrl}#rooms`
              }
            }
          : {}),
        "additionalProperty": [
          ...(capacity !== undefined && capacity > 0
            ? [{ "@type": "PropertyValue", "name": "容納人數", "value": capacity.toString() }]
            : []),
          ...(size !== undefined && size > 0
            ? [{ "@type": "PropertyValue", "name": "房間大小", "value": `${size} 平方公尺` }]
            : []),
        ]
      });
    }).filter((d): d is NonNullable<typeof d> => d !== undefined);

    // 網站導航麵包屑
    const breadcrumbData = pruneEmpty({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "name": "首頁",
          "item": origin
        },
        {
          "@type": "ListItem",
          "position": 2,
          "name": accommodationInfo.name,
          "item": pageUrl
        }
      ]
    });

    // 網站資訊
    const websiteData = pruneEmpty({
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${origin}#website`,
      "url": origin,
      "name": accommodationInfo.name,
      "description": accommodationInfo.description,
      "publisher": {
        "@id": `${pageUrl}#organization`
      }
    });

    // 插入所有結構化資料
    const allData = [
      hotelData,
      ...roomsData,
      breadcrumbData,
      websiteData
    ].filter(Boolean);

    allData.forEach((data, index) => {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.text = JSON.stringify(data, null, 2);
      script.setAttribute('data-structured-data', `schema-${index}`);
      document.head.appendChild(script);
    });

    // 清理函數
    return () => {
      const scripts = document.querySelectorAll('script[data-structured-data]');
      scripts.forEach(script => script.remove());
    };
  }, [accommodationInfo, roomTypes, averageRating, reviewCount]);

  return null; // 這個組件不渲染任何內容
};
