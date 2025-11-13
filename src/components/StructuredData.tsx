import { useEffect } from "react";

interface AccommodationInfo {
  name: string;
  description: string;
  address: string;
  phone?: string;
  email?: string;
  star_rating?: string;
}

interface RoomType {
  id: string;
  name: string;
  description: string;
  capacity: number;
  size_sqm: number;
  base_price: number;
  weekday_price?: number;
  weekend_price?: number;
  room_photos?: { photo_url: string }[];
}

interface StructuredDataProps {
  accommodationInfo: AccommodationInfo;
  roomTypes?: RoomType[];
  averageRating?: number;
  reviewCount?: number;
}

export const StructuredData = ({
  accommodationInfo,
  roomTypes = [],
  averageRating = 4.8,
  reviewCount = 4,
}: StructuredDataProps) => {
  useEffect(() => {
    // 清除舊的結構化資料
    const existingScripts = document.querySelectorAll('script[type="application/ld+json"]');
    existingScripts.forEach(script => script.remove());

    // 旅館/企業資訊
    const hotelData = {
      "@context": "https://schema.org",
      "@type": "LodgingBusiness",
      "@id": `${window.location.origin}#organization`,
      "name": accommodationInfo.name,
      "description": accommodationInfo.description,
      "image": `${window.location.origin}/og-image.jpg`,
      "url": window.location.origin,
      "telephone": accommodationInfo.phone || "",
      "email": accommodationInfo.email || "",
      "address": {
        "@type": "PostalAddress",
        "streetAddress": accommodationInfo.address,
        "addressCountry": "TW",
        "addressLocality": accommodationInfo.address.includes("南投") ? "南投縣" : 
                          accommodationInfo.address.includes("宜蘭") ? "宜蘭縣" : "台灣"
      },
      "geo": {
        "@type": "GeoCoordinates",
        "latitude": "",
        "longitude": ""
      },
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": averageRating.toString(),
        "bestRating": "5",
        "worstRating": "1",
        "ratingCount": reviewCount.toString()
      },
      "priceRange": roomTypes.length > 0 
        ? `NT$${Math.min(...roomTypes.map(r => r.weekday_price || r.base_price))} - NT$${Math.max(...roomTypes.map(r => r.weekend_price || r.base_price))}`
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
    };

    // 房型資訊（每個房型作為一個產品）
    const roomsData = roomTypes.map((room, index) => ({
      "@context": "https://schema.org",
      "@type": "Product",
      "@id": `${window.location.origin}#room-${room.id}`,
      "name": `${accommodationInfo.name} - ${room.name}`,
      "description": room.description || `${room.name}，最多可容納 ${room.capacity} 人，室內空間 ${room.size_sqm} 平方公尺`,
      "image": room.room_photos && room.room_photos.length > 0 
        ? room.room_photos.map(p => p.photo_url)
        : [`${window.location.origin}/og-image.jpg`],
      "brand": {
        "@type": "Brand",
        "name": accommodationInfo.name
      },
      "offers": {
        "@type": "AggregateOffer",
        "availability": "https://schema.org/InStock",
        "priceCurrency": "TWD",
        "lowPrice": (room.weekday_price || room.base_price).toString(),
        "highPrice": (room.weekend_price || room.base_price).toString(),
        "priceValidUntil": new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        "url": `${window.location.origin}#rooms`
      },
      "additionalProperty": [
        {
          "@type": "PropertyValue",
          "name": "容納人數",
          "value": room.capacity.toString()
        },
        {
          "@type": "PropertyValue",
          "name": "房間大小",
          "value": `${room.size_sqm} 平方公尺`
        }
      ]
    }));

    // 網站導航麵包屑
    const breadcrumbData = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "name": "首頁",
          "item": window.location.origin
        },
        {
          "@type": "ListItem",
          "position": 2,
          "name": accommodationInfo.name,
          "item": window.location.href
        }
      ]
    };

    // 網站資訊
    const websiteData = {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${window.location.origin}#website`,
      "url": window.location.origin,
      "name": accommodationInfo.name,
      "description": accommodationInfo.description,
      "publisher": {
        "@id": `${window.location.origin}#organization`
      }
    };

    // 插入所有結構化資料
    const allData = [
      hotelData,
      ...roomsData,
      breadcrumbData,
      websiteData
    ];

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
