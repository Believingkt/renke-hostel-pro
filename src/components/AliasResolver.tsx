import { useEffect, useState } from "react";
import { useParams, Outlet, Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { FrontendSkeleton } from "@/components/skeletons/FrontendSkeleton";

const BOOKING_DOMAINS = ["booking.lakeze.com", "www.booking.lakeze.com"];

/**
 * AliasResolver
 * 路由：/:alias/*
 * 任務：將 URL 中的 short_url_alias 解析為 accommodation_id，
 *       存入 sessionStorage 與 localStorage，供下層元件 / context 讀取。
 *       解析失敗則重導向 /booking。
 */
export function AliasResolver() {
  const { alias } = useParams<{ alias: string }>();
  const location = useLocation();
  const [status, setStatus] = useState<"loading" | "ready" | "notfound">("loading");
  const [resolvedId, setResolvedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!alias) {
      setStatus("notfound");
      return;
    }

    (async () => {
      const { data, error } = await supabase
        .from("accommodation_info")
        .select("id, short_url_alias")
        .eq("short_url_alias", alias)
        .maybeSingle();

      if (cancelled) return;

      if (error || !data) {
        setStatus("notfound");
        return;
      }

      try {
        sessionStorage.setItem("alias_accommodation_id", data.id);
        sessionStorage.setItem("alias_short_url_alias", data.short_url_alias || "");
        localStorage.setItem("lastSelectedAccommodation", data.id);
      } catch {
        /* silent */
      }
      setStatus("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [alias]);

  if (status === "loading") {
    return <FrontendSkeleton />;
  }

  if (status === "notfound") {
    return <Navigate to="/booking" replace />;
  }

  return <Outlet />;
}
