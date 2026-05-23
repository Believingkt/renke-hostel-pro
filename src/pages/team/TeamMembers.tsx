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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "sonner";

const NORRIS_USER_ID = "1bc5761a-49a3-40ee-aa45-96ab87070c2e";

// 完整可指派角色（僅 admin 可選）
const ALL_INVITABLE_ROLES: TeamRole[] = [
  "admin",
  "closer",
  "scout",
  "scout_manager",
  "video",
  "franchise",
  "starlink",
  "kol",
  "owner",
  "finance",
];

// scout_manager 僅能指派的角色
const SCOUT_MANAGER_INVITABLE_ROLES: TeamRole[] = ["scout", "kol"];

const ROLE_LABEL: Record<TeamRole, string> = {
  super_admin: "超級管理員",
  admin: "管理員",
  closer: "成交組",
  scout: "星探",
  scout_manager: "星探主管",
  video: "影音組",
  franchise: "特許加盟",
  starlink: "星鏈",
  kol: "KOL",
  owner: "屋主",
  finance: "財務",
};

const ROLE_BADGE_CLASS: Record<TeamRole, string> = {
  super_admin: "bg-purple-100 text-purple-700 border-purple-200",
  admin: "bg-blue-100 text-blue-700 border-blue-200",
  closer: "bg-green-100 text-green-700 border-green-200",
  scout: "bg-orange-100 text-orange-700 border-orange-200",
  scout_manager: "bg-orange-100 text-orange-700 border-orange-200",
  video: "bg-cyan-100 text-cyan-700 border-cyan-200",
  franchise: "bg-amber-100 text-amber-700 border-amber-200",
  starlink: "bg-gray-100 text-gray-700 border-gray-200",
  kol: "bg-pink-100 text-pink-700 border-pink-200",
  owner: "bg-stone-200 text-stone-700 border-stone-300",
  finance: "bg-red-100 text-red-700 border-red-200",
};

interface MemberRow {
  user_id: string;
  display_name: string;
  email: string;
  is_active: boolean;
  roles: TeamRole[];
}

interface PendingInviteRow {
  id: string;
  email: string;
  display_name: string | null;
  role: TeamRole;
  created_at: string;
}

export default function TeamMembers() {
  const { roles: myRoles, userId: myUserId } = useTeam();
  const isAdmin = useMemo(
    () => myRoles.includes("super_admin") || myRoles.includes("admin"),
    [myRoles],
  );
  const isScoutManager = useMemo(
    () => myRoles.includes("scout_manager"),
    [myRoles],
  );
  // 僅 admin 與 scout_manager 可進入
  const canAccess = isAdmin || isScoutManager;
  // 僅 admin 可邀請任意角色 / 編輯 / 刪除
  const canEditAll = isAdmin;

  // 邀請可選角色（依當前使用者身份）
  const invitableRoles = isAdmin
    ? ALL_INVITABLE_ROLES
    : SCOUT_MANAGER_INVITABLE_ROLES;

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [pending, setPending] = useState<PendingInviteRow[]>([]);
  const [loading, setLoading] = useState(true);

  // 邀請表單
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRoles, setInviteRoles] = useState<TeamRole[]>([]);
  const [inviting, setInviting] = useState(false);

  // 編輯側邊面板
  const [editTarget, setEditTarget] = useState<MemberRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editRoles, setEditRoles] = useState<TeamRole[]>([]);
  const [editActive, setEditActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const fetchMembers = useCallback(async () => {
    setLoading(true);

    // 1. 取得所有 team profiles
    const { data: profiles, error: pErr } = await supabase
      .from("team_member_profiles")
      .select("user_id, display_name, is_active")
      .order("display_name", { ascending: true });

    if (pErr) {
      toast.error(pErr.message);
      setLoading(false);
      return;
    }

    const userIds = (profiles ?? []).map((p) => p.user_id);

    // 2. 取得對應角色 (accommodation_id IS NULL)
    const { data: rolesData } = userIds.length
      ? await supabase
          .from("user_roles")
          .select("user_id, role")
          .in("user_id", userIds)
          .is("accommodation_id", null)
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
        const { data: emailRes } = await supabase.functions.invoke(
          "team-list-emails",
          { body: { user_ids: userIds } },
        );
        if (emailRes?.success && Array.isArray(emailRes.users)) {
          emailMap = new Map(
            emailRes.users.map((u: { id: string; email: string }) => [
              u.id,
              u.email,
            ]),
          );
        }
      } catch {
        // ignore
      }
    }

    let rows: MemberRow[] = (profiles ?? []).map((p) => ({
      user_id: p.user_id,
      display_name: p.display_name,
      email: emailMap.get(p.user_id) ?? "",
      is_active: p.is_active ?? true,
      roles: Array.from(rolesMap.get(p.user_id) ?? []),
    }));

    // scout_manager 僅看到有 scout 或 kol 角色的成員
    if (!isAdmin && isScoutManager) {
      rows = rows.filter(
        (r) => r.roles.includes("scout") || r.roles.includes("kol"),
      );
    }

    setMembers(rows);

    // 4. 取得 pending invites（依角色過濾）
    const { data: pendingData } = await supabase
      .from("team_pending_invites")
      .select("id, email, display_name, role, created_at")
      .order("created_at", { ascending: false });

    let pendingRows = (pendingData ?? []) as PendingInviteRow[];
    if (!isAdmin && isScoutManager) {
      pendingRows = pendingRows.filter(
        (p) => p.role === "scout" || p.role === "kol",
      );
    }
    setPending(pendingRows);

    setLoading(false);
  }, [isAdmin, isScoutManager]);

  useEffect(() => {
    if (canAccess) fetchMembers();
  }, [canAccess, fetchMembers]);

  const toggleInviteRole = (role: TeamRole) => {
    setInviteRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
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
      const { data, error } = await supabase.functions.invoke(
        "send-team-invite",
        {
          body: {
            email: targetEmail,
            display_name: inviteName.trim(),
            roles: inviteRoles,
          },
        },
      );
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? "邀請失敗");

      toast.success(
        data.isNewUser
          ? "邀請信已寄出，請通知對方查收"
          : "已將團隊角色授予既有用戶",
      );

      setInviteName("");
      setInviteEmail("");
      setInviteRoles([]);
      fetchMembers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "邀請失敗");
    } finally {
      setInviting(false);
    }
  };


  const handleCancelPending = async (email: string) => {
    if (!confirm(`確定要取消對 ${email} 的所有邀請嗎？`)) return;
    const { error } = await supabase
      .from("team_pending_invites")
      .delete()
      .eq("email", email);
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
  };

  const isNorris = editTarget?.user_id === NORRIS_USER_ID;

  const toggleEditRole = (role: TeamRole) => {
    setEditRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  };

  const handleSave = async () => {
    if (!editTarget) return;
    if (!editName.trim()) return toast.error("顯示名稱不可空白");
    setSaving(true);
    try {
      const { error: pErr } = await supabase
        .from("team_member_profiles")
        .update({
          display_name: editName.trim(),
          is_active: editActive,
        })
        .eq("user_id", editTarget.user_id);
      if (pErr) throw pErr;

      const original = new Set(editTarget.roles);
      const next = new Set(editRoles);
      const toAdd = [...next].filter((r) => !original.has(r));
      const toRemove = [...original].filter(
        (r) => !next.has(r) && r !== "super_admin",
      );

      if (toAdd.length > 0) {
        const { error } = await supabase.from("user_roles").insert(
          toAdd.map((role) => ({
            user_id: editTarget.user_id,
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
    if (editTarget.user_id === myUserId)
      return toast.error("無法移除自己");
    if (isNorris) return toast.error("此成員受系統保護");
    if (
      !confirm(
        `確定移除 ${editTarget.display_name} 嗎？將清除其團隊角色與 profile，登入帳號不受影響。`,
      )
    )
      return;
    setRemoving(true);
    try {
      // 1. 移除所有全域角色
      const { error: rErr } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", editTarget.user_id)
        .is("accommodation_id", null);
      if (rErr) throw rErr;

      // 2. 移除 team profile
      const { error: pErr } = await supabase
        .from("team_member_profiles")
        .delete()
        .eq("user_id", editTarget.user_id);
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

  if (!canAccess) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">成員管理</h2>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            您沒有權限訪問此頁面
          </CardContent>
        </Card>
      </div>
    );
  }

  // 顯示用：移除 Norris 的 super_admin 標籤（DB 已改為 admin，但保險過濾）
  const displayRoles = (m: MemberRow): TeamRole[] =>
    m.user_id === NORRIS_USER_ID
      ? m.roles.filter((r) => r !== "super_admin")
      : m.roles;

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
              <Input
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="例如：小王"
              />
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
              {invitableRoles.map((role) => (
                <label
                  key={role}
                  className="flex items-center gap-2 border rounded-md px-2 py-1.5 cursor-pointer hover:bg-muted/50"
                >
                  <Checkbox
                    checked={inviteRoles.includes(role)}
                    onCheckedChange={() => toggleInviteRole(role)}
                  />
                  <span className="text-sm">{ROLE_LABEL[role]}</span>
                </label>
              ))}
            </div>
            {!isAdmin && (
              <p className="text-xs text-muted-foreground">
                您僅能指派 星探 / KOL 角色
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              對方若尚未註冊，預設角色將暫存，首次登入時自動套用。
            </p>
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
            <CardTitle className="text-base">
              待生效邀請 ({new Set(pending.map((p) => p.email)).size})
            </CardTitle>
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
                <div
                  key={email}
                  className="border rounded-lg p-3 flex flex-wrap items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-sm">
                      {items[0].display_name || email}
                    </div>
                    <div className="text-xs text-muted-foreground">{email}</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {items.map((it) => (
                        <Badge
                          key={it.id}
                          variant="outline"
                          className={`text-xs ${ROLE_BADGE_CLASS[it.role]}`}
                        >
                          {ROLE_LABEL[it.role]}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCancelPending(email)}
                  >
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
          <CardTitle className="text-base">
            現有成員 ({members.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              載入中...
            </p>
          ) : members.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              尚無成員
            </p>
          ) : (
            <div className="space-y-2">
              {members.map((m) => {
                const Wrapper = canEditAll ? "button" : "div";
                return (
                  <Wrapper
                    key={m.user_id}
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
                          {m.user_id === myUserId && (
                            <Badge variant="secondary" className="text-xs">
                              您
                            </Badge>
                          )}
                        </div>
                        {m.email && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {m.email}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {displayRoles(m).length === 0 ? (
                          <span className="text-xs text-muted-foreground">
                            無角色
                          </span>
                        ) : (
                          displayRoles(m).map((r) => (
                            <Badge
                              key={r}
                              variant="outline"
                              className={`text-xs ${ROLE_BADGE_CLASS[r]}`}
                            >
                              {ROLE_LABEL[r]}
                            </Badge>
                          ))
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
        <Sheet
          open={!!editTarget}
          onOpenChange={(open) => !open && setEditTarget(null)}
        >
          <SheetContent
            side="right"
            className="w-full sm:max-w-md flex flex-col overflow-y-auto"
          >
            <SheetHeader>
              <SheetTitle>編輯成員</SheetTitle>
              <SheetDescription>
                修改顯示名稱、角色與啟用狀態
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-4 py-4">
              <div className="space-y-2">
                <Label>顯示名稱</Label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>

              {editTarget?.email && (
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={editTarget.email} disabled />
                </div>
              )}

              <div className="space-y-2">
                <Label>角色</Label>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_INVITABLE_ROLES.map((role) => (
                    <label
                      key={role}
                      className="flex items-center gap-2 border rounded-md px-2 py-1.5 cursor-pointer hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={editRoles.includes(role)}
                        onCheckedChange={() => toggleEditRole(role)}
                      />
                      <span className="text-sm">{ROLE_LABEL[role]}</span>
                    </label>
                  ))}
                  {editTarget?.roles.includes("super_admin") && !isNorris && (
                    <label className="flex items-center gap-2 border rounded-md px-2 py-1.5 opacity-50 cursor-not-allowed">
                      <Checkbox checked disabled />
                      <span className="text-sm">{ROLE_LABEL.super_admin}</span>
                    </label>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between border-t pt-4">
                <Label htmlFor="active-switch">啟用狀態</Label>
                <Switch
                  id="active-switch"
                  checked={editActive}
                  onCheckedChange={setEditActive}
                />
              </div>
            </div>

            <SheetFooter className="flex flex-row justify-between gap-2 pt-2 border-t">
              <Button
                variant="destructive"
                onClick={handleRemoveMember}
                disabled={
                  removing ||
                  saving ||
                  editTarget?.user_id === myUserId ||
                  isNorris
                }
              >
                {removing ? "移除中..." : "移除成員"}
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setEditTarget(null)}
                  disabled={saving || removing}
                >
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
    </div>
  );
}
