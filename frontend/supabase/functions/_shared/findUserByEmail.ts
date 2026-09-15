// Robust admin lookup of an auth user by email.
//
// GoTrue's /admin/users endpoint ignores an `email=` query param (it only
// supports `filter=`), so the old `?email=` lookup ALWAYS returned page 1 of
// all users and usually missed the match — the caller then tried createUser()
// and got 422 `email_exists`, surfacing as "建立帳號失敗" (non-2xx) on the
// client. This helper tries `filter=`, then falls back to paginated scanning.

export interface FoundUser {
  id: string;
  metadata: Record<string, unknown>;
}

async function fetchUsers(
  supabaseUrl: string,
  serviceRoleKey: string,
  query: string,
): Promise<any[]> {
  const resp = await fetch(`${supabaseUrl}/auth/v1/admin/users?${query}`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });
  if (!resp.ok) return [];
  const body = await resp.json();
  return Array.isArray(body?.users) ? body.users : [];
}

export async function findUserByEmail(
  supabaseUrl: string,
  serviceRoleKey: string,
  email: string,
): Promise<FoundUser | null> {
  const target = email.toLowerCase();
  const pick = (users: any[]) => {
    const m = users.find((u: any) => (u.email || "").toLowerCase() === target);
    return m?.id
      ? { id: m.id as string, metadata: (m.raw_user_meta_data || m.user_metadata || {}) as Record<string, unknown> }
      : null;
  };

  try {
    const filtered = await fetchUsers(
      supabaseUrl,
      serviceRoleKey,
      `filter=${encodeURIComponent(email)}&per_page=50`,
    );
    const hit = pick(filtered);
    if (hit) return hit;
  } catch (err) {
    console.warn("[findUserByEmail] filter lookup failed", err);
  }

  // Fallback: paginated scan (bounded).
  try {
    for (let page = 1; page <= 20; page++) {
      const users = await fetchUsers(supabaseUrl, serviceRoleKey, `page=${page}&per_page=200`);
      if (!users.length) break;
      const hit = pick(users);
      if (hit) return hit;
      if (users.length < 200) break;
    }
  } catch (err) {
    console.warn("[findUserByEmail] paginated lookup failed", err);
  }

  return null;
}
