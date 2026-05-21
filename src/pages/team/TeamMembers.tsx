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

const INVITABLE_ROLES: TeamRole[] = [
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

export default function TeamMembers() {
  const { roles: myRoles, userId: myUserId } = useTeam();
  const canManage = useMemo(
    () =>
      myRoles.includes("super_admin") ||
      myRoles.includes("admin") ||
      myRoles.includes("scout_manager"),
    [myRoles],
  );

  const [members, setMembers] = useState<MemberRow[]>([]);
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
    if (userIds.length === 0) {
      setMembers([]);
      setLoading(false);
      return;
    }

    // 2. 取得對應角色 (accommodation_id IS NULL)
    const { data: rolesData } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", userIds)
      .is("accommodation_id", null);

    const rolesMap = new Map<string, TeamRole[]>();
    (rolesData ?? []).forEach((r) => {
      const arr = rolesMap.get(r.user_id) ?? [];
      if (TEAM_ROLES.includes(r.role as TeamRole)) {
        arr.push(r.role as TeamRole);
      }
      rolesMap.set(r.user_id, arr);
    });

    // 3. 取得 email (via profiles or auth helper) - 用 RPC/View 取不到,改從 user 自身 session 推不出
    //    改使用 admin lookup 不必要;改從 customers/auth 取不到。
    //    暫採: 透過 team-lookup-user-by-email 反查不適合批次。
    //    這裡使用 supabase.auth admin 不可,改建立簡單 view 機制需 migration。
    //    為避免新增 migration,從 admin 端使用 service-role edge function 取得;
    //    暫先以 user_id 顯示;若已有 lookup-team-members function 則使用之。
    let emailMap = new Map<string, string>();
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
      // ignore - emails 暫不顯示
    }

    const rows: MemberRow[] = (profiles ?? []).map((p) => ({
      user_id: p.user_id,
      display_name: p.display_name,
      email: emailMap.get(p.user_id) ?? "",
      is_active: p.is_active ?? true,
      roles: rolesMap.get(p.user_id) ?? [],
    }));

    setMembers(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (canManage) fetchMembers();
  }, [canManage, fetchMembers]);

  const toggleInviteRole = (role: TeamRole) => {
    setInviteRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  };

  const handleInvite = async () => {
    if (!inviteName.trim()) return toast.error("請輸入顯示名稱");
    if (!inviteEmail.trim()) return toast.error("請輸入 Email");
    if (inviteRoles.length === 0) return toast.error("請至少選擇一個角色");

    setInviting(true);
    try {
      const { data: lookup, error: lookupErr } =
        await supabase.functions.invoke("team-lookup-user-by-email", {
          body: { email: inviteEmail.trim() },
        });

      if (lookupErr || !lookup?.success) {
        toast.error("找不到此 Email,請確認對方已有 Lakeze 帳號");
        return;
      }

      const targetUserId = lookup.user.id as string;

      // upsert profile
      const { error: profileErr } = await supabase
        .from("team_member_profiles")
        .upsert(
          { user_id: targetUserId, display_name: inviteName.trim() },
          { onConflict: "user_id" },
        );
      if (profileErr) throw profileErr;

      // insert roles (NULL accommodation_id 不會觸發 unique 衝突,需先查再補)
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

  const openEdit = (m: MemberRow) => {
    setEditTarget(m);
    setEditName(m.display_name);
    setEditRoles(m.roles);
    setEditActive(m.is_active);
  };

  const isNorris = editTarget?.user_id === NORRIS_USER_ID;

  const toggleEditRole = (role: TeamRole) => {
    if (isNorris) return;
    setEditRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  };

  const handleSave = async () => {
    if (!editTarget) return;
    if (!editName.trim()) return toast.error("顯示名稱不可空白");
    setSaving(true);
    try {
      // 1. 更新 profile
      const { error: pErr } = await supabase
        .from("team_member_profiles")
        .update({
          display_name: editName.trim(),
          is_active: isNorris ? true : editActive,
        })
        .eq("user_id", editTarget.user_id);
      if (pErr) throw pErr;

      // 2. 角色 diff (Norris 不更動)
      if (!isNorris) {
        const original = new Set(editTarget.roles);
        const next = new Set(editRoles);
        const toAdd = [...next].filter((r) => !original.has(r));
        const toRemove = [...original].filter((r) => !next.has(r));

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

  if (!canManage) {
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

  return (
    <div className="space-y-6 max-w-5xl">
      <h2 className="text-2xl font-bold">成員管理</h2>

      {/* 區塊一:邀請新成員 */}
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
                placeholder="例如:小王"
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
            <Label>角色(可多選)</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
              {INVITABLE_ROLES.map((role) => (
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
          </div>

          <div className="flex justify-end">
            <Button onClick={handleInvite} disabled={inviting}>
              {inviting ? "處理中..." : "發送邀請"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 區塊二:現有成員列表 */}
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
              {members.map((m) => (
                <button
                  key={m.user_id}
                  type="button"
                  onClick={() => openEdit(m)}
                  className="w-full text-left border rounded-lg p-3 hover:bg-muted/50 transition-colors"
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
                      {m.roles.length === 0 ? (
                        <span className="text-xs text-muted-foreground">
                          無角色
                        </span>
                      ) : (
                        m.roles.map((r) => (
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
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 編輯側邊面板 */}
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
              {isNorris ? "超級管理員角色不可修改" : "修改顯示名稱、角色與啟用狀態"}
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
                {INVITABLE_ROLES.map((role) => (
                  <label
                    key={role}
                    className={`flex items-center gap-2 border rounded-md px-2 py-1.5 ${
                      isNorris
                        ? "opacity-50 cursor-not-allowed"
                        : "cursor-pointer hover:bg-muted/50"
                    }`}
                  >
                    <Checkbox
                      checked={editRoles.includes(role)}
                      disabled={isNorris}
                      onCheckedChange={() => toggleEditRole(role)}
                    />
                    <span className="text-sm">{ROLE_LABEL[role]}</span>
                  </label>
                ))}
              </div>
              {isNorris && (
                <p className="text-xs text-muted-foreground">
                  超級管理員 (Norris) 的角色受系統保護
                </p>
              )}
            </div>

            <div className="flex items-center justify-between border-t pt-4">
              <Label htmlFor="active-switch">啟用狀態</Label>
              <Switch
                id="active-switch"
                checked={editActive}
                disabled={isNorris}
                onCheckedChange={setEditActive}
              />
            </div>
          </div>

          <SheetFooter className="flex flex-row justify-end gap-2 pt-2 border-t">
            <Button
              variant="outline"
              onClick={() => setEditTarget(null)}
              disabled={saving}
            >
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "儲存中..." : "儲存"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
