import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/components/team/TeamContext";
import { TEAM_ROLES, type TeamRole } from "@/components/team/teamConfig";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { parseFunctionInvokeError } from "@/utils/parseFunctionError";

const NORRIS_USER_ID = "1bc5761a-49a3-40ee-aa45-96ab87070c2e";

// 完整可指派角色（僅 admin 可選）
const ALL_INVITABLE_ROLES: TeamRole[] = [
  "admin",
  "am",
  "am_manager",
  "scout_manager",
  "franchise_manager" as TeamRole,
  "scout",
  "closer",
  "closer_manager",
  // "video", // 影音組分潤已停用，不再可指派（歷史成員資料保留）
  "franchise_internal",
  "franchise_external",
  "starlink",
  // "owner", // 暫時隱藏（屋主），之後要重新開放時取消註解即可
  "finance",
  // "venue_manager", // 暫時隱藏（業主），之後要重新開放時取消註解即可
];

/** 同時只能有一人在任的全域獨佔角色 */
const EXCLUSIVE_ROLES: TeamRole[] = ["am_manager", "closer_manager"];

/** 成員清單分組排序優先序（super_admin 置頂，其餘沿用可指派角色順序） */
const ROLE_SORT_ORDER: TeamRole[] = Array.from(
  new Set<TeamRole>(["super_admin" as TeamRole, ...ALL_INVITABLE_ROLES]),
);

/** 取得成員的分組角色（優先序 index 最小者）；無角色回傳 null */
const groupRoleOf = (roles: TeamRole[]): TeamRole | null => {
  let best: TeamRole | null = null;
  let bestIdx = Number.MAX_SAFE_INTEGER;
  for (const r of roles) {
    const i = ROLE_SORT_ORDER.indexOf(r);
    if (i >= 0 && i < bestIdx) {
      bestIdx = i;
      best = r;
    }
  }
  return best;
};


const ROLE_LABEL = {
  super_admin: "超級管理員",
  admin: "管理員",
  am: "AM",
  am_manager: "AM總管",
  scout_manager: "星探主管",
  franchise_manager: "特許加盟主管",
  scout: "星探",
  closer: "成交組",
  closer_manager: "成交組主管",
  video: "影音組",
  franchise: "特許加盟內部",
  franchise_internal: "特許加盟內部",
  franchise_external: "特許加盟外部",
  starlink: "星鏈",
  
  owner: "屋主",
  finance: "財務",
  venue_manager: "業主",
} as Record<TeamRole, string>;

const ROLE_BADGE_CLASS = {
  super_admin: "bg-purple-100 text-purple-700 border-purple-200",
  admin: "bg-blue-100 text-blue-700 border-blue-200",
  am: "bg-indigo-100 text-indigo-700 border-indigo-200",
  am_manager: "bg-sky-100 text-sky-700 border-sky-200",
  scout_manager: "bg-orange-100 text-orange-700 border-orange-200",
  franchise_manager: "bg-amber-100 text-amber-700 border-amber-200",
  scout: "bg-orange-100 text-orange-700 border-orange-200",
  closer: "bg-green-100 text-green-700 border-green-200",
  closer_manager: "bg-emerald-100 text-emerald-700 border-emerald-200",
  video: "bg-cyan-100 text-cyan-700 border-cyan-200",
  franchise: "bg-amber-100 text-amber-700 border-amber-200",
  franchise_internal: "bg-amber-100 text-amber-700 border-amber-200",
  franchise_external: "bg-yellow-100 text-yellow-800 border-yellow-200",
  starlink: "bg-gray-100 text-gray-700 border-gray-200",
  
  owner: "bg-stone-200 text-stone-700 border-stone-300",
  finance: "bg-red-100 text-red-700 border-red-200",
  venue_manager: "bg-teal-100 text-teal-700 border-teal-200",
};

interface MemberRow {
  id: string; // team_member_profiles.id (PK)
  user_id: string | null;
  display_name: string;
  resigned_at?: string | null;
  email: string;
  is_active: boolean;
  roles: TeamRole[];
  managed_venue: string[] | null;
  am_managed_accommodation_ids: string[] | null;
  is_scout_team_member: boolean;
  employment_type: "fulltime" | "parttime";
  fulltime_start_yearmonth: string | null;
}

interface PendingInviteRow {
  id: string;
  email: string;
  display_name: string | null;
  role: TeamRole;
  created_at: string;
}

interface VenueOption {
  id: string;
  name: string;
}

interface ExclusiveIncumbent {
  role: TeamRole;
  userId: string;
  name: string;
}



// 受限主管角色 → 其可管理（新增/移除）的子角色
const MANAGED_CHILD_BY_MANAGER: Partial<Record<TeamRole, TeamRole>> = {
  scout_manager: "scout",
  ["closer_manager" as TeamRole]: "closer" as TeamRole,
  ["am_manager" as TeamRole]: "am" as TeamRole,
};

export default function TeamMembers() {
  const { roles: myRoles, userId: myUserId } = useTeam();
  const isAdmin = useMemo(() => myRoles.includes("super_admin") || myRoles.includes("admin"), [myRoles]);
  const isScoutManager = useMemo(() => myRoles.includes("scout_manager"), [myRoles]);
  const isCloserManager = useMemo(() => myRoles.includes("closer_manager" as TeamRole), [myRoles]);
  const isAmManager = useMemo(() => myRoles.includes("am_manager" as TeamRole), [myRoles]);
  // 登入者目前持有的受限主管角色可管理的子角色（聯集）
  const managedChildRoles: TeamRole[] = useMemo(
    () =>
      (Object.entries(MANAGED_CHILD_BY_MANAGER) as [TeamRole, TeamRole][])
        .filter(([mgr]) => myRoles.includes(mgr))
        .map(([, child]) => child),
    [myRoles],
  );
  const isRestrictedManager = isScoutManager || isCloserManager || isAmManager;
  // admin 與受限主管（星探主管／成交組主管／AM總管）可進入
  const canAccess = isAdmin || isCloserManager || isAmManager || isScoutManager;
  // 僅 admin 可邀請任意角色 / 編輯 / 刪除
  const canEditAll = isAdmin;

  // 邀請可選角色（依當前使用者身份）— 受限主管在 UI 顯示完整清單但僅可勾對應子角色
  const invitableRoles = ALL_INVITABLE_ROLES;
  const managedChildLabel = managedChildRoles.map((r) => ROLE_LABEL[r]).join("、");
  const enabledInviteRoles: Set<TeamRole> = isAdmin
    ? new Set(ALL_INVITABLE_ROLES)
    : new Set<TeamRole>(managedChildRoles);

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [pending, setPending] = useState<PendingInviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterRole, setFilterRole] = useState<"all" | TeamRole>("all");
  const [venues, setVenues] = useState<VenueOption[]>([]);
  const [accommodations, setAccommodations] = useState<VenueOption[]>([]);

  // 邀請表單
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRoles, setInviteRoles] = useState<TeamRole[]>([]);
  const [inviteVenue, setInviteVenue] = useState<string>("");
  const [inviteScoutTeam, setInviteScoutTeam] = useState(false);
  const [inviting, setInviting] = useState(false);

  // 編輯側邊面板
  const [editTarget, setEditTarget] = useState<MemberRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editRoles, setEditRoles] = useState<TeamRole[]>([]);
  const [editActive, setEditActive] = useState(true);
  const [editResignedAt, setEditResignedAt] = useState("");
  const [editVenues, setEditVenues] = useState<string[]>([]);
  const [editAmAccommodations, setEditAmAccommodations] = useState<string[]>([]);
  const [editScoutTeam, setEditScoutTeam] = useState(false);
  const [editFulltime, setEditFulltime] = useState(false);
  const getCurrentTaipeiYM = () => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Taipei", year: "numeric", month: "numeric" }).formatToParts(new Date());
    const y = parts.find((p) => p.type === "year")?.value ?? String(new Date().getFullYear());
    const m = parts.find((p) => p.type === "month")?.value ?? String(new Date().getMonth() + 1);
    return { year: Number(y), month: Number(m) };
  };
  const [editFulltimeStartYear, setEditFulltimeStartYear] = useState<number>(() => getCurrentTaipeiYM().year);
  const [editFulltimeStartMonth, setEditFulltimeStartMonth] = useState<number>(() => getCurrentTaipeiYM().month);
  const [saving, setSaving] = useState(false);
  const [exclusiveConflicts, setExclusiveConflicts] = useState<ExclusiveIncumbent[] | null>(null);
  const [removing, setRemoving] = useState(false);

  // 新增無帳號成員
  const [noAccountOpen, setNoAccountOpen] = useState(false);
  const [noAccountName, setNoAccountName] = useState("");
  const [creatingNoAccount, setCreatingNoAccount] = useState(false);

  const fetchMembers = useCallback(async () => {
    setLoading(true);

    // 1. 取得所有 team profiles
    const { data: profiles, error: pErr } = await supabase
      .from("team_member_profiles")
      .select("id, user_id, display_name, is_active, managed_venue, am_managed_accommodation_ids, is_scout_team_member, employment_type, fulltime_start_yearmonth, resigned_at")
      .order("display_name", { ascending: true });

    if (pErr) {
      toast.error(pErr.message);
      setLoading(false);
      return;
    }

    const userIds = (profiles ?? []).map((p) => p.user_id).filter((id): id is string => !!id);

    // 2. 取得對應角色 (accommodation_id IS NULL)
    const { data: rolesData } = userIds.length
      ? await supabase.from("user_roles").select("user_id, role").in("user_id", userIds).is("accommodation_id", null)
      : { data: [] as { user_id: string; role: string }[] };

    const rolesMap = new Map<string, Set<TeamRole>>();
    (rolesData ?? []).forEach((r) => {
      if (!TEAM_ROLES.includes(r.role as TeamRole)) return;
      const set = rolesMap.get(r.user_id) ?? new Set<TeamRole>();
      set.add(r.role as TeamRole);
      rolesMap.set(r.user_id, set);
    });

    // 3. 取得 email
    let emailMap = new Map<string, string>();
    if (userIds.length > 0) {
      try {
        const { data: emailRes } = await supabase.functions.invoke("team-list-emails", { body: { user_ids: userIds } });
        if (emailRes?.success && Array.isArray(emailRes.users)) {
          emailMap = new Map(emailRes.users.map((u: { id: string; email: string }) => [u.id, u.email]));
        }
      } catch {
        // ignore
      }
    }

    const rows: MemberRow[] = (profiles ?? []).map((p) => ({
      id: p.id,
      user_id: p.user_id ?? null,
      display_name: p.display_name,
      email: p.user_id ? (emailMap.get(p.user_id) ?? "") : "",
      is_active: p.is_active ?? true,
      resigned_at: ((p as { resigned_at?: string | null }).resigned_at ?? null),
      roles: p.user_id ? Array.from(rolesMap.get(p.user_id) ?? []) : [],
      managed_venue: (p as { managed_venue?: string[] | null }).managed_venue ?? null,
      am_managed_accommodation_ids:
        (p as { am_managed_accommodation_ids?: string[] | null }).am_managed_accommodation_ids ?? null,
      is_scout_team_member: (p as { is_scout_team_member?: boolean | null }).is_scout_team_member ?? false,
      employment_type: ((p as { employment_type?: string | null }).employment_type === "fulltime"
        ? "fulltime"
        : "parttime") as "fulltime" | "parttime",
      fulltime_start_yearmonth: (p as { fulltime_start_yearmonth?: string | null }).fulltime_start_yearmonth ?? null,
    }));

    // 3.5 取得「特許加盟外部銷售業務」profile IDs
    // 這些成員多為無帳號（user_id = null），且 franchise_external_orders 有 RLS 限制
    // 改用 SECURITY DEFINER RPC 確保所有後台角色都能取得完整名單後過濾
    const { data: extSales } = await supabase.rpc("get_franchise_external_member_ids");
    const externalSalesIds = new Set<string>(
      (extSales ?? [])
        .map((r: { profile_id: string | null }) => r.profile_id as string)
        .filter(Boolean),
    );
    rows.forEach((r) => {
      if (externalSalesIds.has(r.id) && !r.roles.includes("franchise_external")) {
        r.roles = [...r.roles, "franchise_external"];
      }
    });

    setMembers(rows);

    // 4. 取得 pending invites
    const { data: pendingData } = await supabase
      .from("team_pending_invites")
      .select("id, email, display_name, role, created_at")
      .order("created_at", { ascending: false });

    setPending((pendingData ?? []) as PendingInviteRow[]);

    setLoading(false);
  }, [isAdmin, isScoutManager]);

  useEffect(() => {
    if (canAccess) fetchMembers();
  }, [canAccess, fetchMembers]);

  useEffect(() => {
    if (!canAccess) return;
    (async () => {
      const [kolRes, accRes] = await Promise.all([
        supabase.from("kol_venues").select("id, name").eq("is_active", true),
        supabase.from("accommodation_info").select("id, name").eq("is_active", true),
      ]);
      const names = new Set<string>();
      const merged: VenueOption[] = [];
      for (const row of [...(kolRes.data ?? []), ...(accRes.data ?? [])]) {
        const name = (row as { name?: string | null }).name;
        const id = (row as { id?: string }).id;
        if (!name || names.has(name)) continue;
        names.add(name);
        merged.push({ id: id ?? name, name } as VenueOption);
      }
      merged.sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
      setVenues(merged);

      const accList: VenueOption[] = (accRes.data ?? [])
        .map((row) => ({ id: (row as { id: string }).id, name: (row as { name: string }).name }))
        .filter((a) => !!a.name)
        .sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
      setAccommodations(accList);
    })();
  }, [canAccess]);

  // 主管角色 → 自動包含的子角色（勾選主管時，子角色強制取消並 disabled）
  const MANAGER_CHILD_MAP: Partial<Record<TeamRole, TeamRole>> = {
    scout_manager: "scout",
    ["franchise_manager" as TeamRole]: "franchise",
    ["closer_manager" as TeamRole]: "closer" as TeamRole,
    ["am_manager" as TeamRole]: "am" as TeamRole,
  };
  const CHILD_OF: Partial<Record<TeamRole, TeamRole>> = Object.fromEntries(
    Object.entries(MANAGER_CHILD_MAP).map(([m, c]) => [c as string, m as TeamRole]),
  ) as Partial<Record<TeamRole, TeamRole>>;

  const applyManagerExclusion = (roles: TeamRole[]): TeamRole[] => {
    let next = [...roles];
    for (const [mgr, child] of Object.entries(MANAGER_CHILD_MAP)) {
      if (next.includes(mgr as TeamRole)) next = next.filter((r) => r !== child);
    }
    return next;
  };

  const toggleInviteRole = (role: TeamRole) => {
    setInviteRoles((prev) => {
      const next = prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role];
      return applyManagerExclusion(next);
    });
  };


  const handleInvite = async () => {
    if (!inviteName.trim()) return toast.error("請輸入顯示名稱");
    if (!inviteEmail.trim()) return toast.error("請輸入 Email");
    if (inviteRoles.length === 0) return toast.error("請至少選擇一個角色");

    // 角色權限檢查
    const allowed = enabledInviteRoles;
    if (inviteRoles.some((r) => !allowed.has(r))) {
      return toast.error("您沒有權限指派部分角色");
    }

    setInviting(true);
    try {
      const targetEmail = inviteEmail.trim().toLowerCase();

      // 由 Edge Function 統一建立/更新帳號、角色與邀請信，避免前端先寫入成功後又顯示寄信失敗的雙 Toast。
      const { data: inviteRes, error: inviteErr } = await supabase.functions.invoke(
        "send-team-invite",
        {
          body: {
            email: targetEmail,
            display_name: inviteName.trim(),
            roles: inviteRoles,
          },
        },
      );
      if (inviteErr) {
        const parsed = await parseFunctionInvokeError(inviteErr);
        throw new Error(parsed.message);
      }
      if (!inviteRes?.success) {
        throw new Error(inviteRes?.error ?? "邀請失敗");
      }

      const targetUserId = inviteRes.user?.id as string | undefined;
      if (!targetUserId) {
        throw new Error("邀請已送出，但無法確認成員資料");
      }

      const wantsVenueManager = inviteRoles.includes("venue_manager" as TeamRole);
      const isScoutLike = inviteRoles.includes("scout") || inviteRoles.includes("scout_manager");
      if (wantsVenueManager || isScoutLike) {
        const profilePayload: Record<string, unknown> = {
          user_id: targetUserId,
          display_name: inviteName.trim(),
        };
        if (wantsVenueManager) {
          profilePayload.managed_venue = inviteVenue ? [inviteVenue] : null;
        }
        if (isScoutLike) {
          profilePayload.is_scout_team_member = inviteScoutTeam;
        }
        const { error: profileErr } = await supabase
          .from("team_member_profiles")
          .upsert(profilePayload as never, { onConflict: "user_id" });
        if (profileErr) throw profileErr;
      }

      if (inviteRes.emailSent) {
        toast.success(inviteRes.isNewUser ? "已建立邀請並寄出設定密碼信" : "已新增成員權限並寄出通知信");
      } else if (inviteRes.emailError) {
        toast.error(`邀請已建立，但通知信未寄出：${inviteRes.emailError}`);
      } else {
        toast.success(inviteRes.isNewUser ? "已建立邀請" : "已新增成員權限");
      }

      setInviteName("");
      setInviteEmail("");
      setInviteRoles([]);
      setInviteVenue("");
      setInviteScoutTeam(false);
      fetchMembers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "邀請失敗");
    } finally {
      setInviting(false);
    }
  };

  const handleCancelPending = async (email: string) => {
    if (!confirm(`確定要取消對 ${email} 的所有邀請嗎？`)) return;
    const { error } = await supabase.from("team_pending_invites").delete().eq("email", email);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("已取消邀請");
    fetchMembers();
  };

  const canEditMember = (m: MemberRow): boolean => {
    if (isAdmin) return true;
    if (isRestrictedManager) {
      if (!m.user_id) return false;
      if (m.user_id === myUserId) return false;
      return managedChildRoles.some((r) => m.roles.includes(r));
    }
    return false;
  };

  const openEdit = (m: MemberRow) => {
    if (!canEditMember(m)) return;
    setEditTarget(m);
    setEditName(m.display_name);
    setEditRoles(m.roles);
    setEditActive(m.is_active);
    setEditResignedAt(m.resigned_at ? String(m.resigned_at).slice(0, 10) : "");
    setEditVenues(m.managed_venue ?? []);
    setEditAmAccommodations(m.am_managed_accommodation_ids ?? []);
    setEditScoutTeam(m.is_scout_team_member);
    setEditFulltime(m.employment_type === "fulltime");
    const cur = getCurrentTaipeiYM();
    if (m.fulltime_start_yearmonth && /^\d{4}-\d{2}$/.test(m.fulltime_start_yearmonth)) {
      const [y, mo] = m.fulltime_start_yearmonth.split("-").map(Number);
      setEditFulltimeStartYear(y);
      setEditFulltimeStartMonth(mo);
    } else {
      setEditFulltimeStartYear(cur.year);
      setEditFulltimeStartMonth(cur.month);
    }
  };

  const isNorris = editTarget?.user_id === NORRIS_USER_ID;
  const wantsAM = editRoles.includes("am" as TeamRole);

  const toggleEditRole = (role: TeamRole) => {
    setEditRoles((prev) => {
      const next = prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role];
      return applyManagerExclusion(next);
    });
  };


  const handleSave = async () => {
    if (!editTarget) return;
    if (!editName.trim()) return toast.error("顯示名稱不可空白");

    // 一致性檢查：避免因表單預設值意外覆寫「正職起始月份」
    const nextFulltimeYM =
      editRoles.includes("scout") && editFulltime
        ? `${editFulltimeStartYear}-${String(editFulltimeStartMonth).padStart(2, "0")}`
        : null;
    const prevFulltimeYM = editTarget.fulltime_start_yearmonth ?? null;
    if (prevFulltimeYM && nextFulltimeYM !== prevFulltimeYM) {
      const target = nextFulltimeYM ?? "（清除，改為兼職）";
      const ok = window.confirm(
        `「正職起始月份」將由 ${prevFulltimeYM} 變更為 ${target}。\n此設定會影響稀有度獎金與底薪試算，確定要變更嗎？`,
      );
      if (!ok) return;
    }

    // 獨佔角色（AM總管／成交組主管）：新指派前先確認是否已有現任者
    if (canEditAll && editTarget.user_id) {
      const newlyExclusive = EXCLUSIVE_ROLES.filter(
        (r) => editRoles.includes(r) && !editTarget.roles.includes(r),
      );
      if (newlyExclusive.length > 0) {
        const { data, error } = await supabase
          .from("user_roles")
          .select("user_id, role")
          .is("accommodation_id", null)
          .in("role", newlyExclusive)
          .neq("user_id", editTarget.user_id);
        if (error) {
          toast.error(error.message);
          return;
        }
        const incumbents = (data ?? []).map((row) => ({
          role: row.role as TeamRole,
          userId: row.user_id as string,
          name:
            members.find((m) => m.user_id === row.user_id)?.display_name ?? "（未知成員）",
        }));
        if (incumbents.length > 0) {
          setExclusiveConflicts(incumbents);
          return;
        }
      }
    }

    await performSave([]);
  };

  const performSave = async (incumbentsToRemove: ExclusiveIncumbent[]) => {
    if (!editTarget) return;
    const nextFulltimeYM =
      editRoles.includes("scout") && editFulltime
        ? `${editFulltimeStartYear}-${String(editFulltimeStartMonth).padStart(2, "0")}`
        : null;

    setSaving(true);
    try {
      // 先移除舊任者的獨佔角色，再走原本流程新增
      for (const inc of incumbentsToRemove) {
        const { error } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", inc.userId)
          .is("accommodation_id", null)
          .eq("role", inc.role);
        if (error) throw error;
      }

      if (!canEditAll && isRestrictedManager) {
        // 受限主管僅能改 display_name、is_scout_team_member，以及自己可管理的子角色勾選
        const nextHasScout = editRoles.includes("scout") && managedChildRoles.includes("scout");
        const { error: pErr } = await supabase
          .from("team_member_profiles")
          .update({
            display_name: editName.trim(),
            is_scout_team_member: nextHasScout ? editScoutTeam : false,
            employment_type: nextHasScout && editFulltime ? "fulltime" : "parttime",
            fulltime_start_yearmonth: nextHasScout ? nextFulltimeYM : null,
          })
          .eq("id", editTarget.id);
        if (pErr) throw pErr;

        // 依登入者可管理的子角色動態處理新增/移除（不碰其他 role）
        if (editTarget.user_id) {
          for (const childRole of managedChildRoles) {
            const originalHas = editTarget.roles.includes(childRole);
            const nextHas = editRoles.includes(childRole);
            if (originalHas && !nextHas) {
              const { error } = await supabase
                .from("user_roles")
                .delete()
                .eq("user_id", editTarget.user_id)
                .is("accommodation_id", null)
                .eq("role", childRole);
              if (error) throw error;
            } else if (!originalHas && nextHas) {
              const { error } = await supabase.from("user_roles").insert({
                user_id: editTarget.user_id,
                accommodation_id: null,
                role: childRole,
              });
              if (error) throw error;
            }
          }
        }
      } else {
        const wantsVenueManager = editRoles.includes("venue_manager" as TeamRole);
        const isScoutLike = editRoles.includes("scout") || editRoles.includes("scout_manager");
        const { error: pErr } = await supabase
          .from("team_member_profiles")
          .update({
            display_name: editName.trim(),
            is_active: editActive,
            resigned_at: editResignedAt || null,
            managed_venue: wantsVenueManager && editVenues.length > 0 ? editVenues : null,
            am_managed_accommodation_ids:
              editRoles.includes("am" as TeamRole) && editAmAccommodations.length > 0 ? editAmAccommodations : null,
            is_scout_team_member: isScoutLike ? editScoutTeam : false,
            employment_type: editRoles.includes("scout") && editFulltime ? "fulltime" : "parttime",
            fulltime_start_yearmonth: nextFulltimeYM,
          })
          .eq("id", editTarget.id);
        if (pErr) throw pErr;

        // 無帳號成員：不處理 user_roles
        if (editTarget.user_id) {
          const original = new Set(editTarget.roles);
          const next = new Set(editRoles);
          const toAdd = [...next].filter((r) => !original.has(r));
          const toRemove = [...original].filter((r) => !next.has(r) && r !== "super_admin");

          if (toAdd.length > 0) {
            const { error } = await supabase.from("user_roles").insert(
              toAdd.map((role) => ({
                user_id: editTarget.user_id!,
                accommodation_id: null,
                role,
              })),
            );
            if (error) throw error;
          }

          for (const role of toRemove) {
            const { error } = await supabase
              .from("user_roles")
              .delete()
              .eq("user_id", editTarget.user_id)
              .is("accommodation_id", null)
              .eq("role", role);
            if (error) throw error;
          }
        }
      }

      toast.success("已更新成員資料");
      setExclusiveConflicts(null);
      setEditTarget(null);
      fetchMembers();
    } catch (err) {
      toast.error((err as any)?.message || "儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!editTarget) return;
    if (editTarget.user_id && editTarget.user_id === myUserId) return toast.error("無法移除自己");
    if (isNorris) return toast.error("此成員受系統保護");
    const confirmMsg = editTarget.user_id
      ? `確定移除 ${editTarget.display_name} 嗎？將清除其團隊角色與 profile，登入帳號不受影響。`
      : `確定移除無帳號成員 ${editTarget.display_name} 嗎？`;
    if (!confirm(confirmMsg)) return;
    setRemoving(true);
    try {
      // 1. 移除所有全域角色（僅有帳號成員）
      if (editTarget.user_id) {
        const { error: rErr } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", editTarget.user_id)
          .is("accommodation_id", null);
        if (rErr) throw rErr;
      }

      // 2. 移除 team profile
      const { error: pErr } = await supabase.from("team_member_profiles").delete().eq("id", editTarget.id);
      if (pErr) throw pErr;

      toast.success("已移除成員");
      setEditTarget(null);
      fetchMembers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "移除失敗");
    } finally {
      setRemoving(false);
    }
  };

  const handleCreateNoAccount = async () => {
    if (!noAccountName.trim()) return toast.error("請輸入顯示名稱");
    setCreatingNoAccount(true);
    try {
      const { error } = await supabase
        .from("team_member_profiles")
        .insert({ user_id: null, display_name: noAccountName.trim() });
      if (error) throw error;
      toast.success("已建立無帳號成員");
      setNoAccountName("");
      setNoAccountOpen(false);
      fetchMembers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "建立失敗");
    } finally {
      setCreatingNoAccount(false);
    }
  };



  if (!canAccess) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">成員管理</h2>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">您沒有權限訪問此頁面</CardContent>
        </Card>
      </div>
    );
  }

  // 顯示用：移除 Norris 的 super_admin 標籤（DB 已改為 admin，但保險過濾）
  const displayRoles = (m: MemberRow): TeamRole[] =>
    m.user_id === NORRIS_USER_ID ? m.roles.filter((r) => r !== "super_admin") : m.roles;

  // 特許加盟外部銷售業務不顯示在成員列表（仍寫入 DB 以供發放管理使用）
  const visibleMembers = members.filter((m) => !displayRoles(m).includes("franchise_external"));
  const filteredMembers = filterRole === "all"
    ? visibleMembers
    : visibleMembers.filter((m) => displayRoles(m).includes(filterRole));

  // 依角色分組排序（同組內維持 display_name 排序）
  const sortedMembers = [...filteredMembers].sort((a, b) => {
    const ra = groupRoleOf(displayRoles(a));
    const rb = groupRoleOf(displayRoles(b));
    const ia = ra ? ROLE_SORT_ORDER.indexOf(ra) : Number.MAX_SAFE_INTEGER;
    const ib = rb ? ROLE_SORT_ORDER.indexOf(rb) : Number.MAX_SAFE_INTEGER;
    if (ia !== ib) return ia - ib;
    return (a.display_name ?? "").localeCompare(b.display_name ?? "", "zh-Hant");
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <h2 className="text-2xl font-bold">成員管理</h2>

      {/* 區塊一：邀請新成員 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">邀請新成員</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>顯示名稱</Label>
              <Input value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="例如：小王" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="user@example.com"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>預設角色（可多選）</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
              {invitableRoles.map((role) => {
                const parent = CHILD_OF[role];
                const lockedByManager = !!(parent && inviteRoles.includes(parent));
                const lockedByRole = !enabledInviteRoles.has(role);
                const disabled = lockedByManager || lockedByRole;
                return (
                  <label
                    key={role}
                    title={
                      lockedByManager
                        ? "已由主管角色包含"
                        : lockedByRole
                        ? `您僅能指派 ${managedChildLabel} 角色`
                        : undefined
                    }
                    className={`flex items-center gap-2 border rounded-md px-2 py-1.5 ${
                      disabled ? "opacity-50 cursor-not-allowed bg-muted/30" : "cursor-pointer hover:bg-muted/50"
                    }`}
                  >
                    <Checkbox
                      checked={inviteRoles.includes(role)}
                      disabled={disabled}
                      onCheckedChange={() => !disabled && toggleInviteRole(role)}
                    />
                    <span className="text-sm">{ROLE_LABEL[role]}</span>
                    {lockedByManager && <span className="text-[10px] text-muted-foreground">已含於主管</span>}
                  </label>
                );
              })}

            </div>
            {inviteRoles.includes("venue_manager" as TeamRole) && (
              <div className="space-y-2 pt-2">
                <Label>負責場域</Label>
                <Select value={inviteVenue} onValueChange={setInviteVenue}>
                  <SelectTrigger className="w-full sm:w-[260px]">
                    <SelectValue placeholder="選擇負責場域" />
                  </SelectTrigger>
                  <SelectContent>
                    {venues.map((v) => (
                      <SelectItem key={v.id} value={v.name}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {(inviteRoles.includes("scout") || inviteRoles.includes("scout_manager")) && (
              <div className="flex items-start justify-between gap-3 border rounded-md px-3 py-2 mt-2">
                <div className="space-y-0.5">
                  <Label htmlFor="invite-scout-team" className="cursor-pointer">參與星探團隊機制</Label>
                  <p className="text-xs text-muted-foreground">開啟後此成員將納入團隊達標獎金計算</p>
                </div>
                <Switch id="invite-scout-team" checked={inviteScoutTeam} onCheckedChange={setInviteScoutTeam} />
              </div>
              )}
            {!isAdmin && isRestrictedManager && <p className="text-xs text-muted-foreground">您僅能指派 {managedChildLabel} 角色</p>}
            <p className="text-xs text-muted-foreground">對方若尚未註冊，預設角色將暫存，首次登入時自動套用。</p>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleInvite} disabled={inviting}>
              {inviting ? "處理中..." : "發送邀請"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 區塊二：待生效邀請 */}
      {pending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">待生效邀請 ({new Set(pending.map((p) => p.email)).size})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Array.from(
                pending.reduce((acc, p) => {
                  const arr = acc.get(p.email) ?? [];
                  arr.push(p);
                  acc.set(p.email, arr);
                  return acc;
                }, new Map<string, PendingInviteRow[]>()),
              ).map(([email, items]) => (
                <div key={email} className="border rounded-lg p-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm">{items[0].display_name || email}</div>
                    <div className="text-xs text-muted-foreground">{email}</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {items.map((it) => (
                        <Badge key={it.id} variant="outline" className={`text-xs ${ROLE_BADGE_CLASS[it.role]}`}>
                          {ROLE_LABEL[it.role]}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleCancelPending(email)}>
                    取消邀請
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 區塊三：現有成員列表 */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">
              現有成員 ({filterRole === "all" ? visibleMembers.length : `${filteredMembers.length} / ${visibleMembers.length}`})
            </CardTitle>
            <div className="flex items-center gap-2">
              {canEditAll && (
                <Button variant="outline" size="sm" onClick={() => setNoAccountOpen(true)}>
                  <UserPlus className="mr-1" />
                  新增無帳號成員
                </Button>
              )}
              <Select value={filterRole} onValueChange={(v) => setFilterRole(v as "all" | TeamRole)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="篩選角色" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  {ALL_INVITABLE_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">載入中...</p>
          ) : filteredMembers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">尚無成員</p>
          ) : (
            <div className="space-y-2">
              {sortedMembers.map((m, idx) => {
                const editable = canEditMember(m);
                const gRole = groupRoleOf(displayRoles(m));
                const prevGRole = idx > 0 ? groupRoleOf(displayRoles(sortedMembers[idx - 1])) : undefined;
                const showGroupHeader = filterRole === "all" && (idx === 0 || gRole !== prevGRole);
                const groupLabel = gRole ? ROLE_LABEL[gRole] : "未設定角色";
                const Wrapper = editable ? "button" : "div";
                return (
                  <div key={m.id}>
                  {showGroupHeader && (
                    <div className="pt-3 pb-1 text-xs font-semibold text-muted-foreground">
                      {groupLabel}
                    </div>
                  )}
                  <Wrapper
                    type={editable ? "button" : undefined}
                    onClick={editable ? () => openEdit(m) : undefined}
                    className={`w-full text-left border rounded-lg p-3 transition-colors ${
                      editable ? "hover:bg-muted/50 cursor-pointer" : ""
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{m.display_name}</span>
                          {!m.is_active && (
                            <Badge variant="outline" className="text-xs">
                              已停用
                            </Badge>
                          )}
                          {!m.user_id && (
                            <Badge variant="outline" className="text-xs bg-slate-100 text-slate-700 border-slate-200">
                              無帳號
                            </Badge>
                          )}
                          {m.user_id && m.user_id === myUserId && (
                            <Badge variant="secondary" className="text-xs">
                              您
                            </Badge>
                          )}
                        </div>
                        {m.email && <p className="text-xs text-muted-foreground mt-0.5">{m.email}</p>}
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        {!m.user_id ? null : displayRoles(m).length === 0 ? (
                          <span className="text-xs text-muted-foreground">無角色</span>
                        ) : (
                          displayRoles(m).map((r) => (
                            <Badge key={r} variant="outline" className={`text-xs ${ROLE_BADGE_CLASS[r]}`}>
                              {ROLE_LABEL[r]}
                            </Badge>
                          ))
                        )}
                        {displayRoles(m).includes("venue_manager" as TeamRole) && m.managed_venue && m.managed_venue.length > 0 && (
                          <span className="text-xs text-muted-foreground ml-1">{m.managed_venue.join(", ")}</span>
                        )}
                        {displayRoles(m).includes("am" as TeamRole) &&
                          m.am_managed_accommodation_ids &&
                          m.am_managed_accommodation_ids.length > 0 && (
                            <span className="text-xs text-muted-foreground ml-1">
                              {m.am_managed_accommodation_ids
                                .map((id) => accommodations.find((a) => a.id === id)?.name)
                                .filter(Boolean)
                                .join(", ")}
                            </span>
                          )}
                        {(displayRoles(m).includes("scout") || displayRoles(m).includes("scout_manager")) && m.is_scout_team_member && (
                          <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200">團隊</Badge>
                        )}
                      </div>
                    </div>
                  </Wrapper>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 編輯側邊面板 */}
      {(canEditAll || isRestrictedManager) && (
        <Sheet open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
          <SheetContent side="right" className="w-full sm:max-w-md flex flex-col overflow-y-auto overflow-x-hidden">
            <SheetHeader>
              <SheetTitle>編輯成員</SheetTitle>
              <SheetDescription>修改顯示名稱、角色與啟用狀態</SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-4 py-4">
              <div className="space-y-2">
                <Label>顯示名稱</Label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>

              {editTarget?.email && (
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={editTarget.email} disabled />
                </div>
              )}

              {editTarget?.user_id ? (
                <div className="space-y-2">
                  <Label>角色</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {ALL_INVITABLE_ROLES.map((role) => {
                      const parent = CHILD_OF[role];
                      const lockedByManager = !!(parent && editRoles.includes(parent));
                      const lockedByRestrictedManager =
                        !canEditAll && isRestrictedManager && !managedChildRoles.includes(role);
                      const disabled = lockedByManager || lockedByRestrictedManager;
                      return (
                        <label
                          key={role}
                          title={
                            lockedByManager
                              ? "已由主管角色包含"
                              : lockedByRestrictedManager
                              ? `您僅能調整 ${managedChildLabel} 角色`
                              : undefined
                          }
                          className={`flex items-center gap-2 border rounded-md px-2 py-1.5 ${
                            disabled ? "opacity-50 cursor-not-allowed bg-muted/30" : "cursor-pointer hover:bg-muted/50"
                          }`}
                        >
                          <Checkbox
                            checked={editRoles.includes(role)}
                            disabled={disabled}
                            onCheckedChange={() => !disabled && toggleEditRole(role)}
                          />
                          <span className="text-sm">{ROLE_LABEL[role]}</span>
                          {lockedByManager && <span className="text-[10px] text-muted-foreground">已含於主管</span>}
                        </label>
                      );
                    })}

                    {editTarget?.roles.includes("super_admin") && !isNorris && (
                      <label className="flex items-center gap-2 border rounded-md px-2 py-1.5 opacity-50 cursor-not-allowed">
                        <Checkbox checked disabled />
                        <span className="text-sm">{ROLE_LABEL.super_admin}</span>
                      </label>
                    )}
                  </div>
                  {editRoles.includes("venue_manager" as TeamRole) && canEditAll && (
                    <div className="space-y-2 pt-2">
                      <Label>負責場域（可多選）</Label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto border rounded-md p-2">
                        {venues.map((v) => {
                          const checked = editVenues.includes(v.name);
                          return (
                            <label
                              key={v.id}
                              className="flex items-center gap-2 border rounded-md px-2 py-1.5 cursor-pointer hover:bg-muted/50"
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() =>
                                  setEditVenues((prev) =>
                                    prev.includes(v.name)
                                      ? prev.filter((n) => n !== v.name)
                                      : [...prev, v.name],
                                  )
                                }
                              />
                              <span className="text-sm">{v.name}</span>
                            </label>
                          );
                        })}
                      </div>
                      {editVenues.length === 0 && (
                        <p className="text-xs text-muted-foreground">尚未選擇，儲存後將清空負責場域</p>
                      )}
                    </div>
                  )}
                  {wantsAM && canEditAll && (
                    <div className="space-y-2 pt-2">
                      <Label>管理場域（可多選）</Label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto border rounded-md p-2">
                        {(() => {
                          const travelIds = accommodations
                            .filter((a) => a.name.startsWith("旅行日"))
                            .map((a) => a.id);
                          const allTravelChecked =
                            travelIds.length > 0 &&
                            travelIds.every((id) => editAmAccommodations.includes(id));
                          if (travelIds.length === 0) return null;
                          return (
                            <label className="flex items-center gap-2 border rounded-md px-2 py-1.5 cursor-pointer bg-muted/30 hover:bg-muted/50 sm:col-span-2">
                              <Checkbox
                                checked={allTravelChecked}
                                onCheckedChange={() =>
                                  setEditAmAccommodations((prev) =>
                                    allTravelChecked
                                      ? prev.filter((id) => !travelIds.includes(id))
                                      : Array.from(new Set([...prev, ...travelIds])),
                                  )
                                }
                              />
                              <span className="text-sm font-medium">旅行日（全系列）</span>
                            </label>
                          );
                        })()}
                        {accommodations.map((acc) => (
                          <label
                            key={acc.id}
                            className="flex items-center gap-2 border rounded-md px-2 py-1.5 cursor-pointer hover:bg-muted/50"
                          >
                            <Checkbox
                              checked={editAmAccommodations.includes(acc.id)}
                              onCheckedChange={() =>
                                setEditAmAccommodations((prev) =>
                                  prev.includes(acc.id)
                                    ? prev.filter((id) => id !== acc.id)
                                    : [...prev, acc.id],
                                )
                              }
                            />
                            <span className="text-sm">
                              {acc.name}
                              {acc.name.startsWith("旅行日") && (
                                <span className="ml-1 text-xs text-muted-foreground">
                                  （不列入 AM績效獎金與AM場域獎金計算）
                                </span>
                              )}
                            </span>
                          </label>
                        ))}
                      </div>
                      {editAmAccommodations.length === 0 && (
                        <p className="text-xs text-muted-foreground">尚未選擇，儲存後將清空管理場域</p>
                      )}
                    </div>
                  )}
                  {(editRoles.includes("scout") || editRoles.includes("scout_manager")) && (
                    <div className="flex items-start justify-between gap-3 border rounded-md px-3 py-2 mt-2">
                      <div className="space-y-0.5">
                        <Label htmlFor="edit-scout-team" className="cursor-pointer">參與星探團隊機制</Label>
                        <p className="text-xs text-muted-foreground">開啟後此成員將納入團隊達標獎金計算</p>
                      </div>
                      <Switch id="edit-scout-team" checked={editScoutTeam} onCheckedChange={setEditScoutTeam} />
                    </div>
                  )}
                  {editRoles.includes("scout") && (
                    <div className="border rounded-md px-3 py-2 mt-2 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-0.5">
                          <Label htmlFor="edit-fulltime" className="cursor-pointer">正職星探</Label>
                          <p className="text-xs text-muted-foreground">開啟 = 正職（fulltime），關閉 = 兼職（parttime）</p>
                        </div>
                        <Switch id="edit-fulltime" checked={editFulltime} onCheckedChange={setEditFulltime} />
                      </div>
                      {editFulltime && (
                        <div className="flex items-center justify-between gap-3 pt-2 border-t">
                          <Label className="text-sm">正職起始月份</Label>
                          <div className="flex items-center gap-2">
                            <Select value={String(editFulltimeStartYear)} onValueChange={(v) => setEditFulltimeStartYear(Number(v))}>
                              <SelectTrigger className="w-[90px] h-8"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {Array.from({ length: 6 }, (_, i) => getCurrentTaipeiYM().year - 3 + i).map((y) => (
                                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <span className="text-sm text-muted-foreground">年</span>
                            <Select value={String(editFulltimeStartMonth)} onValueChange={(v) => setEditFulltimeStartMonth(Number(v))}>
                              <SelectTrigger className="w-[80px] h-8"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                                  <SelectItem key={m} value={String(m)}>{m}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <span className="text-sm text-muted-foreground">月</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground border rounded-md px-3 py-2 bg-muted/30">
                  此為無帳號成員，僅供顯示管理用途，無法指派角色。
                </p>
              )}

              {canEditAll && (
                <div className="space-y-3 border-t pt-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="active-switch">啟用狀態</Label>
                    <Switch id="active-switch" checked={editActive} onCheckedChange={setEditActive} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="resigned-at">離職生效日</Label>
                    <Input
                      id="resigned-at"
                      type="date"
                      value={editResignedAt}
                      onChange={(e) => setEditResignedAt(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      留白＝在職。離職生效日之後的資料月不列入成交組績效均分與管理職獎金；
                      個人歸屬的訂單分潤（如成交大師個人分潤）仍依原成交人計算。
                    </p>
                  </div>
                </div>
              )}

            </div>

            <SheetFooter className="flex flex-row justify-between gap-2 pt-2 border-t">
              {canEditAll ? (
                <Button
                  variant="destructive"
                  onClick={handleRemoveMember}
                  disabled={removing || saving || editTarget?.user_id === myUserId || isNorris}
                >
                  {removing ? "移除中..." : "移除成員"}
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditTarget(null)} disabled={saving || removing}>
                  取消
                </Button>
                <Button onClick={handleSave} disabled={saving || removing}>
                  {saving ? "儲存中..." : "儲存"}
                </Button>
              </div>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      )}

      {/* 獨佔角色交接確認 */}
      <Dialog
        open={!!exclusiveConflicts}
        onOpenChange={(open) => {
          if (!open) setExclusiveConflicts(null);
        }}
      >
        <DialogContent className="sm:max-w-md overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>此角色已有現任者</DialogTitle>
            <DialogDescription>此角色同時只能有一人在任，確認後將自動移除舊任者的角色。</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2 text-sm">
            {(exclusiveConflicts ?? []).map((inc) => (
              <p key={`${inc.role}-${inc.userId}`}>
                將把 <span className="font-semibold">{inc.name}</span> 的{" "}
                <span className="font-semibold">{ROLE_LABEL[inc.role]}</span> 移除，改由{" "}
                <span className="font-semibold">{editTarget?.display_name}</span> 擔任，確定要這樣設定嗎？
              </p>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExclusiveConflicts(null)} disabled={saving}>
              取消
            </Button>
            <Button onClick={() => performSave(exclusiveConflicts ?? [])} disabled={saving}>
              {saving ? "儲存中..." : "確認變更"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* 新增無帳號成員 Dialog（僅 admin） */}
      {canEditAll && (
        <Dialog open={noAccountOpen} onOpenChange={setNoAccountOpen}>
          <DialogContent className="sm:max-w-md overflow-x-hidden">
            <DialogHeader>
              <DialogTitle>新增無帳號成員</DialogTitle>
              <DialogDescription>
                建立純顯示/管理用的成員資料，不會建立登入帳號，也無法被指派角色或於其他模組中選取。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label>顯示名稱</Label>
              <Input
                value={noAccountName}
                onChange={(e) => setNoAccountName(e.target.value)}
                placeholder="例如：小王"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNoAccountOpen(false)} disabled={creatingNoAccount}>
                取消
              </Button>
              <Button onClick={handleCreateNoAccount} disabled={creatingNoAccount}>
                {creatingNoAccount ? "建立中..." : "建立"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
