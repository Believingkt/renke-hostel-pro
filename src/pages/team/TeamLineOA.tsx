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
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  Tags,
  X,
  ChevronsUpDown,
  Check,
  Info,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
  event_types: string[];
  accommodation_ids: string[];
  custom_venue_names: string[];
};

type MemberProfile = {
  id: string;
  user_id: string;
  display_name: string | null;
  line_user_id: string | null;
};

type EventType = {
  id: string;
  code: string;
  label: string;
  description: string | null;
  is_active: boolean;
};

type AccommodationOption = {
  id: string;
  name: string;
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

const ALL_TABS = [
  { value: "groups", label: "群組管理", icon: Users },
  { value: "members", label: "成員 LINE 帳號", icon: UserCheck },
  { value: "events", label: "事件類型", icon: Tags },
  { value: "channels", label: "OA 設定", icon: Cable },
];

const AM_TAB_VALUES = ["groups", "events"];

export default function TeamLineOA() {
  const navigate = useNavigate();
  const { userId } = useTeam();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [isAm, setIsAm] = useState(false);
  const [tab, setTab] = useState("groups");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .in("role", ["super_admin", "admin", "am"]);
      if (!data || data.length === 0) {
        navigate("/team", { replace: true });
      } else {
        const roles = data.map((r: any) => r.role);
        const onlyAm =
          roles.includes("am") &&
          !roles.includes("super_admin") &&
          !roles.includes("admin");
        setIsAm(onlyAm);
        setAuthorized(true);
      }
    })();
  }, [userId, navigate]);

  if (!authorized) return null;

  const tabs = isAm
    ? ALL_TABS.filter((t) => AM_TAB_VALUES.includes(t.value))
    : ALL_TABS;

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader
        title="LINE OA 推播設定"
        description="管理 LINE 官方帳號、推播群組、成員綁定與事件類型"
        icon={Cable}
      />
      <Tabs value={tab} onValueChange={setTab}>
        <ResponsiveTabs tabs={tabs} value={tab} onValueChange={setTab} />
        <TabsContent value="groups" className="mt-4">
          <GroupsTab hideGroupId={isAm} />
        </TabsContent>
        <TabsContent value="events" className="mt-4">
          <EventsTab />
        </TabsContent>
        {!isAm && (
          <>
            <TabsContent value="members" className="mt-4">
              <MembersTab />
            </TabsContent>
            <TabsContent value="channels" className="mt-4">
              <ChannelsTab />
            </TabsContent>
          </>
        )}
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
type GroupFormState = {
  id?: string;
  display_name: string;
  target_id: string;
  channel_id: string | null;
  roles: string[];
  event_types: string[];
  accommodation_ids: string[];
  custom_venue_names: string[];
  is_active: boolean;
};

function emptyGroupForm(): GroupFormState {
  return {
    display_name: "",
    target_id: "",
    channel_id: null,
    roles: [],
    event_types: [],
    accommodation_ids: [],
    custom_venue_names: [],
    is_active: true,
  };
}

function GroupsTab({ hideGroupId = false }: { hideGroupId?: boolean }) {
  const [list, setList] = useState<(PushTarget & { channel_name?: string })[]>([]);
  const [channels, setChannels] = useState<LineChannel[]>([]);
  const [roleOptions, setRoleOptions] = useState<string[]>(ROLE_OPTIONS);
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [accommodations, setAccommodations] = useState<AccommodationOption[]>([]);
  const [form, setForm] = useState<GroupFormState | null>(null);
  const [venueInput, setVenueInput] = useState("");

  const load = async () => {
    const [
      { data: targets },
      { data: chans },
      { data: roleRows },
      { data: evts },
      { data: accs },
    ] = await Promise.all([
      supabase
        .from("line_push_targets")
        .select("*")
        .eq("target_type", "group")
        .order("created_at", { ascending: false }),
      supabase.from("line_oa_channels").select("*"),
      supabase.from("user_roles").select("role"),
      supabase.from("line_event_types").select("*").eq("is_active", true).order("label"),
      supabase.from("accommodation_info").select("id, name").order("name").limit(1000),
    ]);
    setChannels((chans ?? []) as LineChannel[]);
    setEventTypes((evts ?? []) as EventType[]);
    setAccommodations((accs ?? []) as AccommodationOption[]);
    const chanMap = new Map((chans ?? []).map((c: any) => [c.id, c.channel_name]));
    setList(
      ((targets ?? []) as any[]).map((t) => ({
        ...t,
        event_types: t.event_types ?? [],
        accommodation_ids: t.accommodation_ids ?? [],
        custom_venue_names: t.custom_venue_names ?? [],
        channel_name: t.channel_id ? chanMap.get(t.channel_id) : undefined,
      })) as (PushTarget & { channel_name?: string })[]
    );
    const uniq = Array.from(new Set([
      ...ROLE_OPTIONS,
      ...((roleRows ?? []).map((r: any) => r.role).filter(Boolean) as string[]),
    ]));
    setRoleOptions(uniq);
  };

  useEffect(() => {
    load();
  }, []);

  const openEdit = (g: PushTarget) => {
    setForm({
      id: g.id,
      display_name: g.display_name ?? "",
      target_id: g.target_id,
      channel_id: g.channel_id,
      roles: g.roles ?? [],
      event_types: g.event_types ?? [],
      accommodation_ids: g.accommodation_ids ?? [],
      custom_venue_names: g.custom_venue_names ?? [],
      is_active: g.is_active,
    });
    setVenueInput("");
  };

  const openAdd = () => {
    setForm(emptyGroupForm());
    setVenueInput("");
  };

  const save = async () => {
    if (!form) return;
    if (!form.target_id.trim()) {
      toast.error("請輸入 groupId");
      return;
    }
    const payload: any = {
      target_type: "group",
      target_id: form.target_id.trim(),
      display_name: form.display_name.trim() || null,
      channel_id: form.channel_id,
      roles: form.roles,
      event_types: form.event_types,
      accommodation_ids: form.accommodation_ids,
      custom_venue_names: form.custom_venue_names,
      is_active: form.is_active,
    };
    if (form.id) payload.id = form.id;

    const { error } = await supabase
      .from("line_push_targets")
      .upsert(payload, { onConflict: form.id ? "id" : "target_type,target_id" });
    if (error) toast.error(error.message);
    else {
      toast.success("已儲存");
      setForm(null);
      load();
    }
  };

  const toggleItem = (key: keyof GroupFormState, value: string) => {
    if (!form) return;
    const arr = (form[key] as string[]) ?? [];
    const next = arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value];
    setForm({ ...form, [key]: next } as GroupFormState);
  };

  const addVenueTag = () => {
    if (!form) return;
    const v = venueInput.trim();
    if (!v) return;
    if (form.custom_venue_names.includes(v)) {
      setVenueInput("");
      return;
    }
    setForm({ ...form, custom_venue_names: [...form.custom_venue_names, v] });
    setVenueInput("");
  };

  const removeVenueTag = (v: string) => {
    if (!form) return;
    setForm({
      ...form,
      custom_venue_names: form.custom_venue_names.filter((x) => x !== v),
    });
  };

  const accMap = new Map(accommodations.map((a) => [a.id, a.name]));
  const evtMap = new Map(eventTypes.map((e) => [e.code, e.label]));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">推播群組管理</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            將 LINE OA 機器人加入群組後，系統會自動記錄群組資訊
          </p>
        </div>
        <Button size="sm" onClick={openAdd}>
          <Plus className="h-4 w-4 mr-1" /> 手動新增群組
        </Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>群組名稱</TableHead>
                {!hideGroupId && <TableHead>groupId</TableHead>}
                <TableHead>使用 OA</TableHead>
                <TableHead>事件</TableHead>
                <TableHead>館別</TableHead>
                <TableHead>啟用</TableHead>
                <TableHead className="w-16">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={hideGroupId ? 6 : 7} className="text-center text-muted-foreground py-8">
                    尚無群組，請將 OA 加入 LINE 群組以自動建立
                  </TableCell>
                </TableRow>
              ) : (
                list.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="font-medium">{g.display_name || "—"}</TableCell>
                    {!hideGroupId && (
                      <TableCell>
                        <code className="text-xs">{g.target_id}</code>
                      </TableCell>
                    )}
                    <TableCell>{g.channel_name || "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-[180px]">
                        {(g.event_types ?? []).length === 0 ? (
                          <span className="text-muted-foreground text-xs">—</span>
                        ) : (
                          g.event_types.map((c) => (
                            <Badge key={c} variant="secondary" className="text-xs">
                              {evtMap.get(c) ?? c}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-[180px]">
                        {(g.accommodation_ids ?? []).map((id) => (
                          <Badge key={id} variant="outline" className="text-xs">
                            {accMap.get(id) ?? id.slice(0, 6)}
                          </Badge>
                        ))}
                        {(g.custom_venue_names ?? []).map((n) => (
                          <Badge key={n} variant="outline" className="text-xs">
                            {n}
                          </Badge>
                        ))}
                        {(g.accommodation_ids ?? []).length === 0 &&
                          (g.custom_venue_names ?? []).length === 0 && (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={g.is_active ? "default" : "outline"}>
                        {g.is_active ? "啟用" : "停用"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(g)}>
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

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form?.id ? "編輯群組推播設定" : "手動新增群組"}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>群組名稱</Label>
                  <Input
                    value={form.display_name}
                    onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                    placeholder="例如：行銷團隊群組"
                  />
                </div>
                {!hideGroupId && (
                  <div>
                    <Label>groupId</Label>
                    <Input
                      value={form.target_id}
                      onChange={(e) => setForm({ ...form, target_id: e.target.value })}
                      placeholder="C..."
                    />
                  </div>
                )}
              </div>

              <div>
                <Label>使用 OA</Label>
                <select
                  className="w-full border rounded-md h-10 px-3 bg-background"
                  value={form.channel_id ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, channel_id: e.target.value || null })
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
                <Label>接收事件類型（多選）</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  勾選這個群組要接收哪些類型的通知。例如勾選「每日業績通報」，當系統發送每日業績統計時，這個群組就會收到推播訊息。
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {eventTypes.length === 0 && (
                    <span className="text-xs text-muted-foreground">尚未設定事件類型</span>
                  )}
                  {eventTypes.map((e) => (
                    <Badge
                      key={e.code}
                      variant={form.event_types.includes(e.code) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleItem("event_types", e.code)}
                    >
                      {e.label}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <Label>對應館別</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  指定這個群組接收哪些館別的通知。若不選擇，則接收所有館別的通知（適合內部工作群等不分館別的群組）。可同時選擇「已建立館別」與新增「自訂館別名稱」。
                </p>
                <div className="mt-2">
                  <VenuePicker
                    accommodations={accommodations}
                    selectedIds={form.accommodation_ids}
                    selectedCustom={form.custom_venue_names}
                    onChangeIds={(ids) =>
                      setForm({ ...form, accommodation_ids: ids })
                    }
                    onChangeCustom={(names) =>
                      setForm({ ...form, custom_venue_names: names })
                    }
                  />
                </div>
              </div>





              <div className="flex items-center gap-2">
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                />
                <Label>啟用</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>取消</Button>
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
  const [defaultChannelId, setDefaultChannelId] = useState<string | null>(null);
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [targetsByLineId, setTargetsByLineId] = useState<Record<string, PushTarget>>({});
  const [linkDialog, setLinkDialog] = useState<{ memberName: string; url: string } | null>(null);

  const load = async () => {
    const [{ data: profiles }, { data: chans }, { data: evts }] = await Promise.all([
      supabase
        .from("team_member_profiles")
        .select("id, user_id, display_name, line_user_id")
        .order("display_name", { ascending: true }),
      supabase
        .from("line_oa_channels")
        .select("id, line_oa_id")
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(1),
      supabase
        .from("line_event_types")
        .select("*")
        .eq("is_active", true)
        .order("label"),
    ]);

    setOaId((chans?.[0] as any)?.line_oa_id ?? null);
    setDefaultChannelId((chans?.[0] as any)?.id ?? null);
    setEventTypes((evts ?? []) as EventType[]);

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

    const lineUserIds = (profiles ?? [])
      .map((p: any) => p.line_user_id)
      .filter(Boolean) as string[];
    const tMap: Record<string, PushTarget> = {};
    if (lineUserIds.length > 0) {
      const { data: targets } = await supabase
        .from("line_push_targets")
        .select("*")
        .eq("target_type", "user")
        .in("target_id", lineUserIds);
      (targets ?? []).forEach((t: any) => {
        tMap[t.target_id] = {
          ...t,
          event_types: t.event_types ?? [],
          accommodation_ids: t.accommodation_ids ?? [],
          custom_venue_names: t.custom_venue_names ?? [],
        };
      });
    }
    setTargetsByLineId(tMap);

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

  const evtMap = new Map(eventTypes.map((e) => [e.code, e.label]));


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
                <TableHead>
                  <span className="inline-flex items-center gap-1">
                    個人化通知能力
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          當您是該訂單的成交人/該折扣碼的負責星探時，系統會自動推播通知給您，無需另外設定
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </span>
                </TableHead>
                <TableHead className="w-48">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    尚無成員
                  </TableCell>
                </TableRow>
              ) : (
                members.map((m) => {
                  const bound = !!m.line_user_id;
                  const target = m.line_user_id ? targetsByLineId[m.line_user_id] : undefined;
                  const events = target?.event_types ?? [];
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
                        {(() => {
                          const caps: { icon: string; label: string }[] = [];
                          if (m.roles.includes("closer")) caps.push({ icon: "💰", label: "訂單金額異動通知" });
                          if (m.roles.includes("scout")) caps.push({ icon: "🎯", label: "KOL訂單通知" });
                          if (caps.length === 0) {
                            return <span className="text-muted-foreground text-xs">—</span>;
                          }
                          return (
                            <div className="flex flex-wrap gap-1">
                              {caps.map((c) => (
                                <Badge key={c.label} variant="secondary" className="text-xs">
                                  {c.icon} {c.label}
                                </Badge>
                              ))}
                            </div>
                          );
                        })()}
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


// ============== Events Tab ==============
function EventsTab() {
  const [list, setList] = useState<EventType[]>([]);
  const [editing, setEditing] = useState<Partial<EventType> | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("line_event_types")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) toast.error(error.message);
    else setList((data ?? []) as EventType[]);
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    if (!editing) return;
    if (!editing.code?.trim() || !editing.label?.trim()) {
      toast.error("請輸入事件代碼與中文名稱");
      return;
    }
    const payload = {
      code: editing.code.trim(),
      label: editing.label.trim(),
      description: editing.description ?? null,
      is_active: editing.is_active ?? true,
    };
    let error;
    if (editing.id) {
      ({ error } = await supabase
        .from("line_event_types")
        .update(payload)
        .eq("id", editing.id));
    } else {
      ({ error } = await supabase.from("line_event_types").insert(payload));
    }
    if (error) toast.error(error.message);
    else {
      toast.success("已儲存");
      setEditing(null);
      load();
    }
  };

  const toggleActive = async (row: EventType) => {
    const { error } = await supabase
      .from("line_event_types")
      .update({ is_active: !row.is_active })
      .eq("id", row.id);
    if (error) toast.error(error.message);
    else load();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">事件類型管理</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            管理 LINE 推播可用的事件類型，群組可選擇要接收哪些事件
          </p>
        </div>
        <Button size="sm" onClick={() => setEditing({ is_active: true })}>
          <Plus className="h-4 w-4 mr-1" /> 新增事件
        </Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>事件代碼</TableHead>
                <TableHead>中文名稱</TableHead>
                <TableHead>說明</TableHead>
                <TableHead>啟用</TableHead>
                <TableHead className="w-24">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    尚無資料
                  </TableCell>
                </TableRow>
              ) : (
                list.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <code className="text-xs">{e.code}</code>
                    </TableCell>
                    <TableCell className="font-medium">{e.label}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {e.description || "—"}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={e.is_active}
                        onCheckedChange={() => toggleActive(e)}
                      />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => setEditing(e)}>
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
            <DialogTitle>{editing?.id ? "編輯事件" : "新增事件"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>事件代碼（英文，唯一）</Label>
                <Input
                  value={editing.code ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, code: e.target.value })
                  }
                  placeholder="例如：kol_order"
                  disabled={!!editing.id}
                />
              </div>
              <div>
                <Label>中文名稱</Label>
                <Input
                  value={editing.label ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, label: e.target.value })
                  }
                  placeholder="例如：KOL 訂單通知"
                />
              </div>
              <div>
                <Label>說明</Label>
                <Textarea
                  value={editing.description ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, description: e.target.value })
                  }
                  rows={3}
                />
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

function VenuePicker({
  accommodations,
  selectedIds,
  selectedCustom,
  onChangeIds,
  onChangeCustom,
}: {
  accommodations: { id: string; name: string }[];
  selectedIds: string[];
  selectedCustom: string[];
  onChangeIds: (ids: string[]) => void;
  onChangeCustom: (names: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const total = selectedIds.length + selectedCustom.length;
  const summary = total === 0 ? "全部館別" : `已選擇 ${total} 個館別`;

  const kw = search.trim().toLowerCase();
  const filteredAcc = accommodations.filter((a) =>
    !kw ? true : a.name.toLowerCase().includes(kw)
  );
  const filteredCustom = selectedCustom.filter((n) =>
    !kw ? true : n.toLowerCase().includes(kw)
  );

  const exactExists =
    !!search.trim() &&
    (accommodations.some((a) => a.name === search.trim()) ||
      selectedCustom.includes(search.trim()));

  const toggleId = (id: string) => {
    onChangeIds(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id]
    );
  };
  const toggleCustom = (n: string) => {
    onChangeCustom(
      selectedCustom.includes(n)
        ? selectedCustom.filter((x) => x !== n)
        : [...selectedCustom, n]
    );
  };
  const addCustom = () => {
    const v = search.trim();
    if (!v || exactExists) return;
    onChangeCustom([...selectedCustom, v]);
    setSearch("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-between font-normal"
        >
          <span className={total === 0 ? "text-muted-foreground" : ""}>
            {summary}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="p-2 border-b">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜尋或輸入新自訂館別"
            className="h-8"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
          />
        </div>
        {total > 0 && (
          <div className="flex flex-wrap gap-1 p-2 border-b">
            {selectedIds.map((id) => {
              const a = accommodations.find((x) => x.id === id);
              return (
                <Badge key={id} variant="default" className="gap-1">
                  {a?.name ?? id}
                  <button type="button" onClick={() => toggleId(id)}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              );
            })}
            {selectedCustom.map((n) => (
              <Badge key={n} variant="secondary" className="gap-1">
                {n}
                <button type="button" onClick={() => toggleCustom(n)}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        <div className="max-h-[240px] overflow-y-auto p-1">
          {filteredAcc.length === 0 && filteredCustom.length === 0 && !search && (
            <div className="px-2 py-3 text-xs text-muted-foreground text-center">
              無館別
            </div>
          )}



          {filteredAcc.map((a) => {
            const checked = selectedIds.includes(a.id);
            return (
              <button
                type="button"
                key={a.id}
                onClick={() => toggleId(a.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-accent text-left"
              >
                <Checkbox checked={checked} className="pointer-events-none" />
                <span className="flex-1">{a.name}</span>
              </button>
            );
          })}

          {filteredCustom.map((n) => (
            <button
              type="button"
              key={`c-${n}`}
              onClick={() => toggleCustom(n)}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-accent text-left"
            >
              <Checkbox checked className="pointer-events-none" />
              <span className="flex-1">{n}</span>
              <Badge variant="outline" className="text-[10px] px-1 py-0">
                未建立
              </Badge>
            </button>
          ))}

          {search.trim() && !exactExists && (
            <button
              type="button"
              onClick={addCustom}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-accent text-left border-t mt-1"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="flex-1">
                新增自訂館別「{search.trim()}」
              </span>
              <Badge variant="outline" className="text-[10px] px-1 py-0">
                未建立
              </Badge>
            </button>
          )}
        </div>
        <div className="p-2 border-t flex justify-end">
          <Button size="sm" onClick={() => setOpen(false)}>
            完成
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

