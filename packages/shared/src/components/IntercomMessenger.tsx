/**
 * Intercom Messenger（Fin 客服）：App 最外層掛一次。
 * 沒有 VITE_INTERCOM_APP_ID → 直接回 null，不載任何 script、不打任何請求。
 */
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { useAccommodation } from "@lakeze/shared/contexts/AccommodationContext";
import { isNativeApp } from "@lakeze/shared/lib/appMode";
import {
  buildIntercomSettings,
  classifyIntercomRoute,
  clearIntercomHashCache,
  fetchIntercomUserHash,
  getIntercomAppId,
  intercomCall,
  loadIntercomScript,
  type IntercomIdentity,
} from "@lakeze/shared/lib/intercom";

export function IntercomMessenger() {
  const appId = getIntercomAppId();
  if (!appId) return null;
  return <IntercomBooter appId={appId} />;
}

function useSessionUser(): User | null | undefined {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") clearIntercomHashCache();
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);
  return user;
}

async function loadDisplayName(user: User, staff: boolean): Promise<string | undefined> {
  const { data } = staff
    ? await supabase.from("profiles").select("name").eq("id", user.id).maybeSingle()
    : await supabase.from("platform_members").select("name").eq("user_id", user.id).maybeSingle();
  return (data as { name?: string | null } | null)?.name || undefined;
}

function IntercomBooter({ appId }: { appId: string }) {
  const { pathname } = useLocation();
  const { currentAccommodationId } = useAccommodation();
  const user = useSessionUser();
  const role = classifyIntercomRoute(pathname);
  const staff = role !== "guest";
  const userId = user?.id ?? null;
  const accId = role === "owner" ? currentAccommodationId : null;
  const identityKey = user === undefined ? null : `${userId ?? "anon"}|${role}|${accId ?? ""}`;
  const bootedKey = useRef<string | null>(null);

  // 身分（登入／登出／切帳號／前後台切換）改變 → shutdown 再重新 boot
  useEffect(() => {
    if (identityKey === null) return; // session 尚未讀到
    let cancelled = false;
    (async () => {
      let identity: IntercomIdentity | null = null;
      if (user) {
        const [userHash, name] = await Promise.all([fetchIntercomUserHash(user.id), loadDisplayName(user, staff)]);
        identity = { user_id: user.id, email: user.email ?? undefined, name, ...(userHash ? { user_hash: userHash } : {}) };
        if (!userHash) identity = null; // 驗證失敗時以匿名 boot，避免未驗證身分
      }
      if (cancelled) return;
      loadIntercomScript(appId);
      if (bootedKey.current !== null) {
        console.info("[Intercom] shutdown");
        intercomCall("shutdown");
      }
      const settings = buildIntercomSettings({ appId, native: isNativeApp(), role, identity, accommodationId: accId });
      window.intercomSettings = settings;
      console.info("[Intercom] boot", { user_id: identity?.user_id ?? null, role: identity ? role : "anonymous" });
      intercomCall("boot", settings);
      bootedKey.current = identityKey;
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identityKey, appId]);

  // 同一身分下的路由切換 → update
  useEffect(() => {
    if (bootedKey.current && bootedKey.current === identityKey) intercomCall("update", { last_request_at: Math.floor(Date.now() / 1000) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}

export default IntercomMessenger;
