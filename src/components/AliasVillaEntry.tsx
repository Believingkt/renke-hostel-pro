import { lazy, Suspense } from "react";
import { useOutletContext } from "react-router-dom";
import type { AliasOutletContext } from "@/components/AliasResolver";
import { FrontendSkeleton } from "@/components/skeletons/FrontendSkeleton";

const BookingVilla = lazy(() => import("@/pages/BookingVilla"));

/**
 * booking.lakeze.com/{alias} 的首頁 —— 直接渲染包棟訂房頁本身。
 * （過去會轉址到 /booking/villa/{uuid}，導致 canonical 指向一個會轉址的網址。）
 * 舊的 /booking/villa/{uuid} 路由永久保留，向下相容既有已貼出的連結。
 */
export default function AliasVillaEntry() {
  const ctx = useOutletContext<AliasOutletContext | null>();
  if (!ctx?.accommodationId) return <FrontendSkeleton />;
  return (
    <Suspense fallback={<FrontendSkeleton />}>
      <BookingVilla accommodationId={ctx.accommodationId} />
    </Suspense>
  );
}
