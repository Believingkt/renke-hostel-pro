import { useCallback, useEffect, useState } from "react";

const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000; // 10 min
const COOLDOWN_MS = 5 * 60 * 1000; // 5 min

type Record = { attempts: number[]; lockedUntil?: number };

const read = (key: string): Record => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { attempts: [] };
    const parsed = JSON.parse(raw) as Record;
    return parsed && Array.isArray(parsed.attempts) ? parsed : { attempts: [] };
  } catch {
    return { attempts: [] };
  }
};

const write = (key: string, rec: Record) => {
  try {
    localStorage.setItem(key, JSON.stringify(rec));
  } catch {
    /* ignore */
  }
};

/**
 * Client-side login throttle. Tracks failed attempts per email scope key in localStorage.
 * Returns the locked status, remaining cooldown seconds, and helpers to register attempts.
 *
 * Server-side enforcement is provided by Supabase Auth's built-in rate limiting; this
 * is an additional UX guard so the user understands why login is failing repeatedly.
 */
export function useLoginThrottle(scope: string) {
  const key = `login_throttle_v1:${scope}`;
  const [lockedUntil, setLockedUntil] = useState<number | undefined>(() => read(key).lockedUntil);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!lockedUntil) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

  const isLocked = !!lockedUntil && lockedUntil > now;
  const remainingSeconds = isLocked ? Math.ceil((lockedUntil! - now) / 1000) : 0;

  const recordFailure = useCallback(() => {
    const cur = read(key);
    const cutoff = Date.now() - ATTEMPT_WINDOW_MS;
    const recent = [...cur.attempts.filter((t) => t > cutoff), Date.now()];
    let lock: number | undefined = cur.lockedUntil;
    if (recent.length >= MAX_ATTEMPTS) {
      lock = Date.now() + COOLDOWN_MS;
    }
    const next = { attempts: recent, lockedUntil: lock };
    write(key, next);
    setLockedUntil(lock);
    return { attempts: recent.length, locked: !!lock };
  }, [key]);

  const recordSuccess = useCallback(() => {
    write(key, { attempts: [] });
    setLockedUntil(undefined);
  }, [key]);

  return { isLocked, remainingSeconds, recordFailure, recordSuccess };
}
