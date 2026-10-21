import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { Button } from "@lakeze/shared/components/ui/button";
import { Input } from "@lakeze/shared/components/ui/input";
import { Checkbox } from "@lakeze/shared/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@lakeze/shared/components/ui/card";

interface Group { id: string; name: string }
interface Member { template_id: string; group_id: string }
interface Tpl { id: string; template_name: string }

export function PricingTemplateGroupsCard({ accommodationId, canEdit }: { accommodationId: string; canEdit: boolean }) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [templates, setTemplates] = useState<Tpl[]>([]);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [g, m, t] = await Promise.all([
      supabase.from("pricing_template_groups" as any).select("id, name").eq("accommodation_id", accommodationId).order("name"),
      supabase.from("pricing_template_group_members" as any).select("template_id, group_id").eq("accommodation_id", accommodationId),
      supabase.from("pricing_templates").select("id, template_name").eq("accommodation_id", accommodationId).order("template_name"),
    ]);
    if (!g.error) setGroups((g.data || []) as unknown as Group[]);
    if (!m.error) setMembers((m.data || []) as unknown as Member[]);
    if (!t.error) setTemplates((t.data || []) as unknown as Tpl[]);
  }, [accommodationId]);

  useEffect(() => { load(); }, [load]);

  const saveGroup = async (groupId: string | null, name: string) => {
    const { error: e } = await (supabase.rpc as any)("save_pricing_template_group", {
      p_accommodation_id: accommodationId, p_group_id: groupId, p_name: name,
    });
    if (e) { setError(e.message); return false; }
    setError(null);
    toast.success(groupId ? "已更新組合名稱" : "已建立組合");
    await load();
    return true;
  };

  const saveMembers = async (groupId: string, ids: string[]) => {
    const { error: e } = await (supabase.rpc as any)("set_pricing_template_group_members", {
      p_group_id: groupId, p_template_ids: ids,
    });
    if (e) { setError(e.message); return; }
    setError(null);
    toast.success("已更新組合內容");
    await load();
  };

  return (
    <Card data-testid="template-groups-card">
      <CardHeader className="pb-3"><CardTitle className="text-base">折扣碼適用方案組合</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">只用在折扣碼，不影響房價。把常一起打折的房價方案放成一組，折扣碼選用這個組合後，組合裡的方案會自動成為折扣碼的適用方案；之後組合裡新增或移除方案，選用它的折扣碼都會自動跟著變，不用一個一個碼去改。一個方案只能放在一個組合裡。</p>
        {error && <p role="alert" className="text-sm text-destructive" data-testid="template-groups-error">{error}</p>}
        {canEdit && (
          <div className="flex gap-2">
            <Input placeholder="新組合名稱（例如：包棟方案）" value={newName} onChange={(e) => setNewName(e.target.value)} data-testid="template-group-new-name" />
            <Button onClick={async () => { if (await saveGroup(null, newName)) setNewName(""); }} data-testid="template-group-create">建立組合</Button>
          </div>
        )}
        {groups.length === 0 && <p className="text-xs text-muted-foreground">尚未建立組合</p>}
        {groups.map((g) => (
          <GroupRow key={g.id} group={g} members={members} templates={templates} groups={groups} canEdit={canEdit}
            onRename={(n) => saveGroup(g.id, n)} onSaveMembers={(ids) => saveMembers(g.id, ids)} />
        ))}
      </CardContent>
    </Card>
  );
}

function GroupRow({ group, members, templates, groups, canEdit, onRename, onSaveMembers }: {
  group: Group; members: Member[]; templates: Tpl[]; groups: Group[]; canEdit: boolean;
  onRename: (name: string) => Promise<boolean>; onSaveMembers: (ids: string[]) => void;
}) {
  const current = members.filter((m) => m.group_id === group.id).map((m) => m.template_id);
  const [name, setName] = useState(group.name);
  const [picked, setPicked] = useState<string[]>(current);
  const currentKey = current.slice().sort().join(",");
  useEffect(() => { setPicked(currentKey ? currentKey.split(",") : []); }, [currentKey]);
  useEffect(() => { setName(group.name); }, [group.name]);
  const otherGroupOf = (tid: string) => {
    const m = members.find((x) => x.template_id === tid && x.group_id !== group.id);
    return m ? groups.find((g) => g.id === m.group_id)?.name ?? "其他組合" : null;
  };

  return (
    <div className="space-y-2 rounded-md border p-3" data-testid={`template-group-${group.id}`}>
      <div className="flex gap-2">
        <Input value={name} disabled={!canEdit} onChange={(e) => setName(e.target.value)} data-testid={`template-group-name-${group.id}`} />
        {canEdit && name !== group.name && (
          <Button size="sm" variant="outline" onClick={() => onRename(name)} data-testid={`template-group-rename-${group.id}`}>改名</Button>
        )}
      </div>
      <div className="grid gap-1 sm:grid-cols-2">
        {templates.map((t) => {
          const other = otherGroupOf(t.id);
          return (
            <label key={t.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={picked.includes(t.id)}
                disabled={!canEdit || !!other}
                onCheckedChange={(c) => setPicked((p) => (c ? [...p, t.id] : p.filter((x) => x !== t.id)))}
                data-testid={`template-group-member-${group.id}-${t.id}`}
              />
              {t.template_name}
              {other && <span className="text-xs text-muted-foreground">（已屬於「{other}」）</span>}
            </label>
          );
        })}
      </div>
      {canEdit && (
        <Button size="sm" onClick={() => onSaveMembers(picked)} data-testid={`template-group-save-members-${group.id}`}>儲存組合內容</Button>
      )}
    </div>
  );
}
