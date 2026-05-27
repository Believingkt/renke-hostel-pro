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

const NORRIS_USER_ID = "1bc5761a-49a3-40ee-aa45-96ab87070c2e";

// 完整可指派角色（僅 admin 可選）
const ALL_INVITABLE_ROLES: TeamRole[] = [
  "admin",
  "scout_manager",
  "franchise_manager" as TeamRole,
  "scout",
  "closer",
  "video",
  "franchise",
  "starlink",
  "kol",
  "owner",
  "finance",
  "venue_manager",
];

// scout_manager 僅能指派的角色
const SCOUT_MANAGER_INVITABLE_ROLES: TeamRole[] = ["scout", "kol"];

const ROLE_LABEL = {
  super_admin: "超級管理員",
  admin: "管理員",
  scout_manager: "星探主管",
  franchise_manager: "特許加盟主管",
  scout: "星探",
  closer: "成交組",
  video: "影音組",
  franchise: "特許加盟",
  starlink: "星鏈",
  kol: "KOL",
  owner: "屋主",
  finance: "財務",
  venue_manager: "場域負責人",
} as Record<TeamRole, string>;

const ROLE_BADGE_CLASS = {
  super_admin: "bg-purple-100 text-purple-700 border-purple-200",
  admin: "bg-blue-100 text-blue-700 border-blue-200",
  scout_manager: "bg-orange-100 text-orange-700 border-orange-200",
  franchise_manager: "bg-amber-100 text-amber-700 border-amber-200",
  scout: "bg-orange-100 text-orange-700 border-orange-200",
  closer: "bg-green-100 text-green-700 border-green-200",
  video: "bg-cyan-100 text-cyan-700 border-cyan-200",
  franchise: "bg-amber-100 text-amber-700 border-amber-200",
  starlink: "bg-gray-100 text-gray-700 border-gray-200",
  kol: "bg-pink-100 text-pink-700 border-pink-200",
  owner: "bg-stone-200 text-stone-700 border-stone-300",
  finance: "bg-red-100 text-red-700 border-red-200",
  venue_manager: "bg-teal-100 text-teal-700 border-teal-200",
};

interface MemberRow {
  id: string; // team_member_profiles.id (PK)
  user_id: string | null;
  display_name: string;
  email: string;
  is_active: boolean;
  roles: TeamRole[];
  managed_venue: string | null;
  is_scout_team_member: boolean;
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

export default function TeamMembers() {
  const { roles: myRoles, userId: myUserId } = useTeam();
  const isAdmin = useMemo(() => myRoles.includes("super_admin") || myRoles.includes("admin"), [myRoles]);
  const isScoutManager = useMemo(() => myRoles.includes("scout_manager"), [myRoles]);
  // 僅 admin 與 scout_manager 可進入
  const canAccess = isAdmin || isScoutManager;
  // 僅 admin 可邀請任意角色 / 編輯 / 刪除
  const canEditAll = isAdmin;

  // 邀請可選角色（依當前使用者身份）
  const invitableRoles = isAdmin ? ALL_INVITABLE_ROLES : SCOUT_MANAGER_INVITABLE_ROLES;

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [pending, setPending] = useState<PendingInviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterRole, setFilterRole] = useState<"all" | TeamRole>("all");
  const [venues, setVenues] = useState<VenueOption[]>([]);

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
  const [editVenue, setEditVenue] = useState<string>("");
  const [editScoutTeam, setEditScoutTeam] = useState(false);
  const [saving, setSaving] = useState(false);
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
      .select("id, user_id, display_name, is_active, managed_venue, is_scout_team_member")
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

    let rows: MemberRow[] = (profiles ?? []).map((p) => ({
      id: p.id,
      user_id: p.user_id ?? null,
      display_name: p.display_name,
      email: p.user_id ? (emailMap.get(p.user_id) ?? "") : "",
      is_active: p.is_active ?? true,
      roles: p.user_id ? Array.from(rolesMap.get(p.user_id) ?? []) : [],
      managed_venue: (p as { managed_venue?: string | null }).managed_venue ?? null,
      is_scout_team_member: (p as { is_scout_team_member?: boolean | null }).is_scout_team_member ?? false,
    }));

    // scout_manager 僅看到有 scout 或 kol 角色的成員
    if (!isAdmin && isScoutManager) {
      rows = rows.filter((r) => r.roles.includes("scout") || r.roles.includes("kol"));
    }

    setMembers(rows);

    // 4. 取得 pending invites（依角色過濾）
    const { data: pendingData } = await supabase
      .from("team_pending_invites")
      .select("id, email, display_name, role, created_at")
      .order("created_at", { ascending: false });

    let pendingRows = (pendingData ?? []) as PendingInviteRow[];
    if (!isAdmin && isScoutManager) {
      pendingRows = pendingRows.filter((p) => p.role === "scout" || p.role === "kol");
    }
    setPending(pendingRows);

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
    })();
  }, [canAccess]);

  // 主管角色 → 自動包含的子角色（勾選主管時，子角色強制取消並 disabled）
  const MANAGER_CHILD_MAP: Partial<Record<TeamRole, TeamRole>> = {
    scout_manager: "scout",
    ["franchise_manager" as TeamRole]: "franchise",
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
    const allowed = new Set(invitableRoles);
    if (inviteRoles.some((r) => !allowed.has(r))) {
      return toast.error("您沒有權限指派部分角色");
    }

    setInviting(true);
    try {
      const targetEmail = inviteEmail.trim().toLowerCase();

      // 先嘗試 lookup 既有用戶
      let targetUserId: string | null = null;
      try {
        const { data: lookup } = await supabase.functions.invoke("team-lookup-user-by-email", {
          body: { email: targetEmail },
        });
        if (lookup?.success && lookup.user?.id) {
          targetUserId = lookup.user.id as string;
        }
      } catch {
        // ignore — 視為新用戶
      }

      if (targetUserId) {
        // 既有用戶：直接套用 profile + roles
        const wantsVenueManager = inviteRoles.includes("venue_manager" as TeamRole);
        const isScoutLike = inviteRoles.includes("scout") || inviteRoles.includes("scout_manager");
        const { error: profileErr } = await supabase
          .from("team_member_profiles")
          .upsert(
            {
              user_id: targetUserId,
              display_name: inviteName.trim(),
              managed_venue: wantsVenueManager ? (inviteVenue || null) : null,
              is_scout_team_member: isScoutLike ? inviteScoutTeam : false,
            },
            { onConflict: "user_id" },
          );
        if (profileErr) throw profileErr;

        const { data: existingRoles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", targetUserId)
          .is("accommodation_id", null);
        const existSet = new Set((existingRoles ?? []).map((r) => r.role));
        const newRoles = inviteRoles.filter((r) => !existSet.has(r));
        if (newRoles.length > 0) {
          const { error: roleErr } = await supabase.from("user_roles").insert(
            newRoles.map((role) => ({
              user_id: targetUserId,
              accommodation_id: null,
              role,
            })),
          );
          if (roleErr) throw roleErr;
        }
        toast.success("已新增成員權限");
      } else {
        // 新用戶：寫入 pending invites（每個角色一筆）
        const rows = inviteRoles.map((role) => ({
          email: targetEmail,
          display_name: inviteName.trim(),
          role,
          invited_by: myUserId,
        }));
        const { error: pendingErr } = await supabase
          .from("team_pending_invites")
          .upsert(rows, { onConflict: "email,role" });
        if (pendingErr) throw pendingErr;
        toast.success("已建立邀請，對方首次登入時將自動套用角色");
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

  const openEdit = (m: MemberRow) => {
    if (!canEditAll) return; // scout_manager 無編輯權
    setEditTarget(m);
    setEditName(m.display_name);
    setEditRoles(m.roles);
    setEditActive(m.is_active);
    setEditVenue(m.managed_venue ?? "");
    setEditScoutTeam(m.is_scout_team_member);
  };

  const isNorris = editTarget?.user_id === NORRIS_USER_ID;

  const toggleEditRole = (role: TeamRole) => {
    setEditRoles((prev) => {
      const next = prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role];
      return applyManagerExclusion(next);
    });
  };


  const handleSave = async () => {
    if (!editTarget) return;
    if (!editName.trim()) return toast.error("顯示名稱不可空白");
    setSaving(true);
    try {
      const wantsVenueManager = editRoles.includes("venue_manager" as TeamRole);
      const isScoutLike = editRoles.includes("scout") || editRoles.includes("scout_manager");
      const { error: pErr } = await supabase
        .from("team_member_profiles")
        .update({
          display_name: editName.trim(),
          is_active: editActive,
          managed_venue: wantsVenueManager ? (editVenue || null) : null,
          is_scout_team_member: isScoutLike ? editScoutTeam : false,
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

      toast.success("已更新成員資料");
      setEditTarget(null);
      fetchMembers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "儲存失敗");
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

  const filteredMembers = filterRole === "all"
    ? members
    : members.filter((m) => displayRoles(m).includes(filterRole));

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
                return (
                  <label
                    key={role}
                    title={lockedByManager ? "已由主管角色包含" : undefined}
                    className={`flex items-center gap-2 border rounded-md px-2 py-1.5 ${
                      lockedByManager ? "opacity-50 cursor-not-allowed bg-muted/30" : "cursor-pointer hover:bg-muted/50"
                    }`}
                  >
                    <Checkbox
                      checked={inviteRoles.includes(role)}
                      disabled={lockedByManager}
                      onCheckedChange={() => !lockedByManager && toggleInviteRole(role)}
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
            {!isAdmin && <p className="text-xs text-muted-foreground">您僅能指派 星探 / KOL 角色</p>}
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
              現有成員 ({filterRole === "all" ? members.length : `${filteredMembers.length} / ${members.length}`})
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
              {filteredMembers.map((m) => {
                const Wrapper = canEditAll ? "button" : "div";
                return (
                  <Wrapper
                    key={m.id}
                    type={canEditAll ? "button" : undefined}
                    onClick={canEditAll ? () => openEdit(m) : undefined}
                    className={`w-full text-left border rounded-lg p-3 transition-colors ${
                      canEditAll ? "hover:bg-muted/50 cursor-pointer" : ""
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
                        {displayRoles(m).includes("venue_manager" as TeamRole) && m.managed_venue && (
                          <span className="text-xs text-muted-foreground ml-1">{m.managed_venue}</span>
                        )}
                        {(displayRoles(m).includes("scout") || displayRoles(m).includes("scout_manager")) && m.is_scout_team_member && (
                          <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200">團隊</Badge>
                        )}
                      </div>
                    </div>
                  </Wrapper>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 編輯側邊面板（僅 admin） */}
      {canEditAll && (
        <Sheet open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
          <SheetContent side="right" className="w-full sm:max-w-md flex flex-col overflow-y-auto">
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
                  <div className="grid grid-cols-2 gap-2">
                    {ALL_INVITABLE_ROLES.map((role) => {
                      const parent = CHILD_OF[role];
                      const lockedByManager = !!(parent && editRoles.includes(parent));
                      return (
                        <label
                          key={role}
                          title={lockedByManager ? "已由主管角色包含" : undefined}
                          className={`flex items-center gap-2 border rounded-md px-2 py-1.5 ${
                            lockedByManager ? "opacity-50 cursor-not-allowed bg-muted/30" : "cursor-pointer hover:bg-muted/50"
                          }`}
                        >
                          <Checkbox
                            checked={editRoles.includes(role)}
                            disabled={lockedByManager}
                            onCheckedChange={() => !lockedByManager && toggleEditRole(role)}
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
                  {editRoles.includes("venue_manager" as TeamRole) && (
                    <div className="space-y-2 pt-2">
                      <Label>負責場域</Label>
                      <Select value={editVenue} onValueChange={setEditVenue}>
                        <SelectTrigger>
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
                  {(editRoles.includes("scout") || editRoles.includes("scout_manager")) && (
                    <div className="flex items-start justify-between gap-3 border rounded-md px-3 py-2 mt-2">
                      <div className="space-y-0.5">
                        <Label htmlFor="edit-scout-team" className="cursor-pointer">參與星探團隊機制</Label>
                        <p className="text-xs text-muted-foreground">開啟後此成員將納入團隊達標獎金計算</p>
                      </div>
                      <Switch id="edit-scout-team" checked={editScoutTeam} onCheckedChange={setEditScoutTeam} />
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground border rounded-md px-3 py-2 bg-muted/30">
                  此為無帳號成員，僅供顯示管理用途，無法指派角色。
                </p>
              )}

              <div className="flex items-center justify-between border-t pt-4">
                <Label htmlFor="active-switch">啟用狀態</Label>
                <Switch id="active-switch" checked={editActive} onCheckedChange={setEditActive} />
              </div>
            </div>

            <SheetFooter className="flex flex-row justify-between gap-2 pt-2 border-t">
              <Button
                variant="destructive"
                onClick={handleRemoveMember}
                disabled={removing || saving || editTarget?.user_id === myUserId || isNorris}
              >
                {removing ? "移除中..." : "移除成員"}
              </Button>
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

      {/* 新增無帳號成員 Dialog（僅 admin） */}
      {canEditAll && (
        <Dialog open={noAccountOpen} onOpenChange={setNoAccountOpen}>
          <DialogContent className="sm:max-w-md">
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
