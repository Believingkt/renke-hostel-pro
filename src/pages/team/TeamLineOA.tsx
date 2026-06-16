import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/components/team/TeamContext";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { ResponsiveTabs } from "@/components/ResponsiveTabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";
import { toast } from "sonner";
import {
  Cable,
  Users,
  UserCheck,
  Eye,
  EyeOff,
  Copy,
  Plus,
  Pencil,
} from "lucide-react";

type LineChannel = {
  id: string;
  channel_name: string;
  channel_access_token: string;
  channel_secret: string;
  line_oa_id: string | null;
  is_active: boolean;
};

type PushTarget = {
  id: string;
  channel_id: string | null;
  target_type: "user" | "group";
  target_id: string;
  display_name: string | null;
  roles: string[];
  team_member_id: string | null;
  is_active: boolean;
};

type MemberProfile = {
  id: string;
  user_id: string;
  display_name: string | null;
  line_user_id: string | null;
};

const WEBHOOK_URL =
  "https://dmafqwfynatdvnaeovhz.supabase.co/functions/v1/line-webhook";

const ROLE_OPTIONS = [
  "super_admin",
  "admin",
  "hotel_admin",
  "scout",
  "scout_manager",
  "closer",
  "video",
  "franchise_internal",
  "franchise_external",
  "franchise_manager",
  "starlink",
  "owner",
  "finance",
  "venue_manager",
];

const TABS = [
  { value: "channels", label: "OA 設定", icon: Cable },
  { value: "groups", label: "群組管理", icon: Users },
  { value: "members", label: "成員 LINE 帳號", icon: UserCheck },
];

export default function TeamLineOA() {
  const navigate = useNavigate();
  const { userId } = useTeam();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [tab, setTab] = useState("channels");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .in("role", ["super_admin", "hotel_admin"]);
      if (!data || data.length === 0) {
        navigate("/team", { replace: true });
      } else {
        setAuthorized(true);
      }
    })();
  }, [userId, navigate]);

  if (!authorized) return null;

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader
        title="LINE OA 推播設定"
        description="管理 LINE 官方帳號、推播群組與成員 LINE 帳號綁定"
        icon={Cable}
      />
      <Tabs value={tab} onValueChange={setTab}>
        <ResponsiveTabs tabs={TABS} value={tab} onValueChange={setTab} />
        <TabsContent value="channels" className="mt-4">
          <ChannelsTab />
        </TabsContent>
        <TabsContent value="groups" className="mt-4">
          <GroupsTab />
        </TabsContent>
        <TabsContent value="members" className="mt-4">
          <MembersTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============== Channels Tab ==============
function ChannelsTab() {
  const [list, setList] = useState<LineChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<LineChannel> | null>(null);
  const [showTokens, setShowTokens] = useState<Record<string, boolean>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("line_oa_channels")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setList((data ?? []) as LineChannel[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    if (!editing) return;
    if (!editing.channel_name) {
      toast.error("請輸入 OA 名稱");
      return;
    }
    const payload = {
      channel_name: editing.channel_name,
      channel_access_token: editing.channel_access_token ?? "",
      channel_secret: editing.channel_secret ?? "",
      line_oa_id: editing.line_oa_id ?? null,
      is_active: editing.is_active ?? true,
    };
    let error;
    if (editing.id) {
      ({ error } = await supabase
        .from("line_oa_channels")
        .update(payload)
        .eq("id", editing.id));
    } else {
      ({ error } = await supabase.from("line_oa_channels").insert(payload));
    }
    if (error) toast.error(error.message);
    else {
      toast.success("已儲存");
      setEditing(null);
      load();
    }
  };

  const toggleActive = async (row: LineChannel) => {
    const { error } = await supabase
      .from("line_oa_channels")
      .update({ is_active: !row.is_active })
      .eq("id", row.id);
    if (error) toast.error(error.message);
    else load();
  };

  const copyWebhook = () => {
    navigator.clipboard.writeText(WEBHOOK_URL);
    toast.success("已複製 Webhook URL");
  };

  const mask = (v: string) => (v ? "•".repeat(Math.min(v.length, 24)) : "—");

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">LINE OA 設定</CardTitle>
        <Button size="sm" onClick={() => setEditing({ is_active: true })}>
          <Plus className="h-4 w-4 mr-1" /> 新增 OA
        </Button>
      </CardHeader>
      <CardContent>
        <div className="mb-4 p-3 bg-muted/50 rounded-md text-sm flex items-center gap-2 flex-wrap">
          <span className="font-medium">Webhook URL：</span>
          <code className="text-xs break-all">{WEBHOOK_URL}</code>
          <Button size="sm" variant="outline" onClick={copyWebhook}>
            <Copy className="h-3 w-3 mr-1" /> 複製
          </Button>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>OA 名稱</TableHead>
                <TableHead>Channel Access Token</TableHead>
                <TableHead>Channel Secret</TableHead>
                <TableHead>啟用</TableHead>
                <TableHead className="w-24">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? null : list.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    尚無資料
                  </TableCell>
                </TableRow>
              ) : (
                list.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.channel_name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code className="text-xs break-all">
                          {showTokens[c.id] ? c.channel_access_token || "—" : mask(c.channel_access_token)}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setShowTokens((s) => ({ ...s, [c.id]: !s[c.id] }))}
                        >
                          {showTokens[c.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code className="text-xs break-all">
                          {showSecrets[c.id] ? c.channel_secret || "—" : mask(c.channel_secret)}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setShowSecrets((s) => ({ ...s, [c.id]: !s[c.id] }))}
                        >
                          {showSecrets[c.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Switch checked={c.is_active} onCheckedChange={() => toggleActive(c)} />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => setEditing(c)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "編輯 OA" : "新增 OA"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>OA 名稱</Label>
                <Input
                  value={editing.channel_name ?? ""}
                  onChange={(e) => setEditing({ ...editing, channel_name: e.target.value })}
                  placeholder="例如：行銷團隊 OA"
                />
              </div>
              <div>
                <Label>Channel Access Token</Label>
                <Input
                  value={editing.channel_access_token ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, channel_access_token: e.target.value })
                  }
                  type="text"
                />
              </div>
              <div>
                <Label>Channel Secret</Label>
                <Input
                  value={editing.channel_secret ?? ""}
                  onChange={(e) => setEditing({ ...editing, channel_secret: e.target.value })}
                  type="text"
                />
              </div>
              <div>
                <Label>LINE OA ID（Basic ID，例如 @abc1234）</Label>
                <Input
                  value={editing.line_oa_id ?? ""}
                  onChange={(e) => setEditing({ ...editing, line_oa_id: e.target.value })}
                  placeholder="@abc1234"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  用於產生成員綁定連結。可在 LINE Official Account Manager 查看。
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={editing.is_active ?? true}
                  onCheckedChange={(v) => setEditing({ ...editing, is_active: v })}
                />
                <Label>啟用</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>取消</Button>
            <Button onClick={save}>儲存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ============== Groups Tab ==============
function GroupsTab() {
  const [list, setList] = useState<(PushTarget & { channel_name?: string })[]>([]);
  const [channels, setChannels] = useState<LineChannel[]>([]);
  const [editing, setEditing] = useState<PushTarget | null>(null);

  const load = async () => {
    const [{ data: targets }, { data: chans }] = await Promise.all([
      supabase
        .from("line_push_targets")
        .select("*")
        .eq("target_type", "group")
        .order("created_at", { ascending: false }),
      supabase.from("line_oa_channels").select("*"),
    ]);
    setChannels((chans ?? []) as LineChannel[]);
    const chanMap = new Map((chans ?? []).map((c: any) => [c.id, c.channel_name]));
    setList(
      ((targets ?? []) as PushTarget[]).map((t) => ({
        ...t,
        channel_name: t.channel_id ? chanMap.get(t.channel_id) : undefined,
      }))
    );
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    if (!editing) return;
    const { error } = await supabase
      .from("line_push_targets")
      .update({
        roles: editing.roles,
        is_active: editing.is_active,
        channel_id: editing.channel_id,
      })
      .eq("id", editing.id);
    if (error) toast.error(error.message);
    else {
      toast.success("已儲存");
      setEditing(null);
      load();
    }
  };

  const toggleRole = (role: string) => {
    if (!editing) return;
    const roles = editing.roles.includes(role)
      ? editing.roles.filter((r) => r !== role)
      : [...editing.roles, role];
    setEditing({ ...editing, roles });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">推播群組管理</CardTitle>
        <p className="text-sm text-muted-foreground">
          將 LINE OA 機器人加入群組後，系統會自動記錄群組資訊
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>群組名稱</TableHead>
                <TableHead>groupId</TableHead>
                <TableHead>使用 OA</TableHead>
                <TableHead>對應角色</TableHead>
                <TableHead>啟用</TableHead>
                <TableHead className="w-24">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    尚無群組，請將 OA 加入 LINE 群組以自動建立
                  </TableCell>
                </TableRow>
              ) : (
                list.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="font-medium">{g.display_name || "—"}</TableCell>
                    <TableCell>
                      <code className="text-xs">{g.target_id}</code>
                    </TableCell>
                    <TableCell>{g.channel_name || "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {g.roles.length === 0 ? (
                          <span className="text-muted-foreground text-xs">未設定</span>
                        ) : (
                          g.roles.map((r) => (
                            <Badge key={r} variant="secondary" className="text-xs">
                              {r}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={g.is_active ? "default" : "outline"}>
                        {g.is_active ? "啟用" : "停用"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => setEditing(g)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>編輯群組推播設定</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div>
                <Label>群組名稱</Label>
                <p className="text-sm">{editing.display_name || "—"}</p>
              </div>
              <div>
                <Label>使用 OA</Label>
                <select
                  className="w-full border rounded-md h-10 px-3 bg-background"
                  value={editing.channel_id ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, channel_id: e.target.value || null })
                  }
                >
                  <option value="">未指定</option>
                  {channels.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.channel_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>對應角色（多選）</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {ROLE_OPTIONS.map((r) => (
                    <Badge
                      key={r}
                      variant={editing.roles.includes(r) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleRole(r)}
                    >
                      {r}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={editing.is_active}
                  onCheckedChange={(v) => setEditing({ ...editing, is_active: v })}
                />
                <Label>啟用</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>取消</Button>
            <Button onClick={save}>儲存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ============== Members Tab ==============
function MembersTab() {
  const [members, setMembers] = useState<
    (MemberProfile & { roles: string[] })[]
  >([]);
  const [oaId, setOaId] = useState<string | null>(null);
  const [linkDialog, setLinkDialog] = useState<{ memberName: string; url: string } | null>(null);

  const load = async () => {
    const [{ data: profiles }, { data: chans }] = await Promise.all([
      supabase
        .from("team_member_profiles")
        .select("id, user_id, display_name, line_user_id")
        .order("display_name", { ascending: true }),
      supabase
        .from("line_oa_channels")
        .select("line_oa_id")
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(1),
    ]);

    setOaId((chans?.[0] as any)?.line_oa_id ?? null);

    const userIds = (profiles ?? []).map((p: any) => p.user_id);
    const roleMap = new Map<string, string[]>();
    if (userIds.length > 0) {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds);
      (roles ?? []).forEach((r: any) => {
        const arr = roleMap.get(r.user_id) ?? [];
        arr.push(r.role);
        roleMap.set(r.user_id, arr);
      });
    }
    setMembers(
      ((profiles ?? []) as MemberProfile[]).map((m) => ({
        ...m,
        roles: roleMap.get(m.user_id) ?? [],
      }))
    );
  };

  useEffect(() => {
    load();
  }, []);

  const generateLink = async (m: MemberProfile) => {
    if (!oaId) {
      toast.error("請先到「OA 設定」填入 LINE OA ID");
      return;
    }
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from("line_binding_tokens").insert({
      team_member_id: m.id,
      token,
      expires_at: expiresAt,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    const oa = oaId.startsWith("@") ? oaId.slice(1) : oaId;
    const url = `https://line.me/R/oaMessage/@${oa}/?${encodeURIComponent(`text=bind:${token}`)}`;
    setLinkDialog({ memberName: m.display_name || "—", url });
  };

  const unbind = async (m: MemberProfile) => {
    if (!confirm(`確定要解除 ${m.display_name || ""} 的 LINE 綁定嗎？`)) return;
    const { error } = await supabase
      .from("team_member_profiles")
      .update({ line_user_id: null })
      .eq("id", m.id);
    if (error) toast.error(error.message);
    else {
      toast.success("已解除綁定");
      load();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">成員 LINE 帳號綁定</CardTitle>
        <p className="text-sm text-muted-foreground">
          產生綁定連結傳給成員，他點開後傳送預填訊息即可完成綁定（連結 24 小時內有效）
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>姓名</TableHead>
                <TableHead>角色</TableHead>
                <TableHead>綁定狀態</TableHead>
                <TableHead className="w-48">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    尚無成員
                  </TableCell>
                </TableRow>
              ) : (
                members.map((m) => {
                  const bound = !!m.line_user_id;
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.display_name || "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {m.roles.length === 0 ? (
                            <span className="text-muted-foreground text-xs">—</span>
                          ) : (
                            m.roles.map((r, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">
                                {r}
                              </Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {bound ? (
                          <Badge className="bg-green-600 hover:bg-green-600">已綁定</Badge>
                        ) : (
                          <Badge variant="outline">未綁定</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {bound ? (
                          <Button size="sm" variant="outline" onClick={() => unbind(m)}>
                            解除綁定
                          </Button>
                        ) : (
                          <Button size="sm" onClick={() => generateLink(m)}>
                            產生綁定連結
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={!!linkDialog} onOpenChange={(o) => !o && setLinkDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>綁定連結：{linkDialog?.memberName}</DialogTitle>
          </DialogHeader>
          {linkDialog && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                請將以下連結傳給成員。成員點開後會自動帶入綁定訊息，按下傳送即可完成綁定。連結 24 小時內有效。
              </p>
              <div className="p-3 bg-muted rounded-md break-all text-xs font-mono">
                {linkDialog.url}
              </div>
              <Button
                onClick={() => {
                  navigator.clipboard.writeText(linkDialog.url);
                  toast.success("已複製連結");
                }}
                className="w-full"
              >
                <Copy className="h-4 w-4 mr-1" /> 複製連結
              </Button>
              <img
                alt="QR Code"
                className="mx-auto"
                src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(linkDialog.url)}`}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialog(null)}>關閉</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
