import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Search, Send, Users } from "lucide-react";
import { toast } from "sonner";

interface Member {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

interface CouponDistributeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coupon: { id: string; code: string } | null;
  onDistributed?: () => void;
}

type Mode = "all" | "selected" | "filter";

export const CouponDistributeDialog = ({
  open,
  onOpenChange,
  coupon,
  onDistributed,
}: CouponDistributeDialogProps) => {
  const [mode, setMode] = useState<Mode>("all");
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");

  // Filter state
  const [filterAccommodation, setFilterAccommodation] = useState<string>("any");
  const [filterDays, setFilterDays] = useState<string>("30");
  const [accommodations, setAccommodations] = useState<{ id: string; name: string }[]>([]);
  const [filteredMemberIds, setFilteredMemberIds] = useState<string[] | null>(null);
  const [filterLoading, setFilterLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode("all");
    setSelected(new Set());
    setSearch("");
    setNote("");
    setFilteredMemberIds(null);
    loadInitial();
  }, [open]);

  const loadInitial = async () => {
    setLoading(true);
    const [membersRes, accsRes] = await Promise.all([
      supabase.from("platform_members").select("id, name, email, phone").order("created_at", { ascending: false }),
      supabase.from("accommodation_info").select("id, name").eq("is_active", true).order("name"),
    ]);
    setMembers(membersRes.data || []);
    setAccommodations(accsRes.data || []);
    setLoading(false);
  };

  const filteredMembers = useMemo(() => {
    if (!search) return members;
    const q = search.toLowerCase();
    return members.filter(m =>
      m.name?.toLowerCase().includes(q) ||
      m.email?.toLowerCase().includes(q) ||
      m.phone?.toLowerCase().includes(q)
    );
  }, [members, search]);

  const toggleAll = (checked: boolean) => {
    if (checked) setSelected(new Set(filteredMembers.map(m => m.id)));
    else setSelected(new Set());
  };

  const runFilter = async () => {
    setFilterLoading(true);
    try {
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - parseInt(filterDays || "30"));
      let query = supabase
        .from("orders")
        .select("member_id, accommodation_id")
        .not("member_id", "is", null)
        .gte("created_at", sinceDate.toISOString());
      if (filterAccommodation !== "any") {
        query = query.eq("accommodation_id", filterAccommodation);
      }
      const { data, error } = await query;
      if (error) throw error;
      const ids = Array.from(new Set((data || []).map((o: any) => o.member_id).filter(Boolean)));
      setFilteredMemberIds(ids);
      toast.success(`符合條件的會員：${ids.length} 位`);
    } catch (e: any) {
      toast.error(e.message || "篩選失敗");
    } finally {
      setFilterLoading(false);
    }
  };

  const getTargetMemberIds = (): string[] => {
    if (mode === "all") return members.map(m => m.id);
    if (mode === "selected") return Array.from(selected);
    if (mode === "filter") return filteredMemberIds || [];
    return [];
  };

  const handleSend = async () => {
    if (!coupon) return;
    const targetIds = getTargetMemberIds();
    if (targetIds.length === 0) {
      toast.error("請先選擇發送對象");
      return;
    }

    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const rows = targetIds.map(memberId => ({
        coupon_id: coupon.id,
        member_id: memberId,
        distributed_by: user?.id || null,
        distribution_note: note || null,
      }));

      // upsert with onConflict to skip duplicates (UNIQUE coupon_id+member_id)
      const { data, error } = await supabase
        .from("member_coupon_distributions")
        .upsert(rows, { onConflict: "coupon_id,member_id", ignoreDuplicates: true })
        .select("id");

      if (error) throw error;

      const inserted = data?.length || 0;
      const skipped = targetIds.length - inserted;
      toast.success(
        `成功發送 ${inserted} 張優惠券${skipped > 0 ? `（${skipped} 位會員已擁有，已跳過）` : ""}`
      );
      onDistributed?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "發送失敗");
    } finally {
      setSending(false);
    }
  };

  const targetCount = getTargetMemberIds().length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            發送優惠券
            {coupon && (
              <Badge variant="secondary" className="font-mono ml-2">{coupon.code}</Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            選擇發送對象後，優惠券將自動入帳到會員的優惠券中心。
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="all">全體會員</TabsTrigger>
              <TabsTrigger value="selected">指定會員</TabsTrigger>
              <TabsTrigger value="filter">條件篩選</TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="pt-4">
              <div className="rounded-lg border bg-muted/30 p-4 flex items-center gap-3">
                <Users className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">將發送給平台所有會員</p>
                  <p className="text-sm text-muted-foreground">共 {members.length} 位會員</p>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="selected" className="pt-4 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="搜尋會員姓名 / 手機 / Email..."
                  className="pl-10"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={
                      filteredMembers.length > 0 &&
                      filteredMembers.every(m => selected.has(m.id))
                    }
                    onCheckedChange={(c) => toggleAll(!!c)}
                  />
                  <span className="text-sm text-muted-foreground">
                    全選目前列表（{filteredMembers.length}）
                  </span>
                </div>
                <Badge variant="secondary">已選 {selected.size}</Badge>
              </div>
              <ScrollArea className="h-64 rounded border">
                <div className="divide-y">
                  {filteredMembers.map(m => (
                    <label
                      key={m.id}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={selected.has(m.id)}
                        onCheckedChange={(c) => {
                          const next = new Set(selected);
                          if (c) next.add(m.id);
                          else next.delete(m.id);
                          setSelected(next);
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{m.name || "（未設定姓名）"}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {m.email || m.phone || "—"}
                        </p>
                      </div>
                    </label>
                  ))}
                  {filteredMembers.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">查無會員</p>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="filter" className="pt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">下單民宿</Label>
                  <Select value={filterAccommodation} onValueChange={setFilterAccommodation}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">不限</SelectItem>
                      {accommodations.map(a => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">最近 N 天內下單</Label>
                  <Select value={filterDays} onValueChange={setFilterDays}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">7 天</SelectItem>
                      <SelectItem value="30">30 天</SelectItem>
                      <SelectItem value="90">90 天</SelectItem>
                      <SelectItem value="180">180 天</SelectItem>
                      <SelectItem value="365">一年</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={runFilter} disabled={filterLoading} variant="secondary" className="w-full">
                {filterLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                套用篩選
              </Button>
              {filteredMemberIds !== null && (
                <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                  符合條件的會員：<strong>{filteredMemberIds.length}</strong> 位
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}

        <div className="space-y-2">
          <Label className="text-xs">發送備註（選填）</Label>
          <Textarea
            placeholder="例如：感謝您一路支持！"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
          />
        </div>

        <DialogFooter className="gap-2 items-center">
          <div className="text-sm text-muted-foreground mr-auto">
            預計發送 <strong className="text-foreground">{targetCount}</strong> 位
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={handleSend} disabled={sending || targetCount === 0}>
            {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Send className="mr-2 h-4 w-4" />
            確認發送
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
