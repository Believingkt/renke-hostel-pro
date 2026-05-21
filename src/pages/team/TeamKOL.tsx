import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/components/team/TeamContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { LayoutGrid, List, Plus, AlertTriangle } from "lucide-react";

// ====== 型別 & 常數 ======
type BookingStatus =
  | "invited"
  | "booked"
  | "checked_in"
  | "cancelled"
  | "rejected"
  | "on_hold";

const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  invited: "邀約中",
  booked: "成功訂房",
  checked_in: "已入住",
  cancelled: "已取消",
  rejected: "已拒絕",
  on_hold: "暫緩",
};

const BOOKING_STATUS_CLASS: Record<BookingStatus, string> = {
  invited: "bg-blue-100 text-blue-700 border-blue-200",
  booked: "bg-green-100 text-green-700 border-green-200",
  checked_in: "bg-gray-200 text-gray-700 border-gray-300",
  cancelled: "bg-red-100 text-red-700 border-red-200",
  rejected: "bg-red-200 text-red-900 border-red-300",
  on_hold: "bg-orange-100 text-orange-700 border-orange-200",
};

const RARITY_OPTIONS = ["N", "R", "SR", "SSR", "UR"] as const;
type Rarity = (typeof RARITY_OPTIONS)[number];

const RARITY_CLASS: Record<Rarity, string> = {
  N: "bg-slate-100 text-slate-700 border-slate-200",
  R: "bg-sky-100 text-sky-700 border-sky-200",
  SR: "bg-violet-100 text-violet-700 border-violet-200",
  SSR: "bg-amber-100 text-amber-800 border-amber-300",
  UR: "bg-rose-100 text-rose-700 border-rose-300",
};

const WEEKDAYS = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

interface Accommodation {
  id: string;
  name: string;
  booking_type: string;
  short_url_alias: string | null;
}

interface Scout {
  user_id: string;
  display_name: string;
}

interface KolRow {
  id: string;
  accommodation_id: string | null;
  name: string | null;
  ig_handle: string | null;
  ig_url: string | null;
  rarity: string | null;
  scout_id: string | null;
  cid_code: string | null;
  short_url: string | null;
  lihi_url: string | null;
  invited_at: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  day_of_week: string | null;
  inventory_status: string | null;
  booking_status: string | null;
  contract_progress: string | null;
  contract_file_url: string | null;
  task_pre_stay: boolean | null;
  task_post_story: boolean | null;
  task_ig_collab: boolean | null;
  publish_url: string | null;
  publish_date: string | null;
  kol_tags: string[] | null;
  order_number: string | null;
  inventory_count: number | null;
  is_error: boolean | null;
  error_note: string | null;
  created_by: string | null;
  created_at: string | null;
  // 顯示用
  _accommodation_name?: string;
  _scout_name?: string;
}

interface FormState {
  id?: string;
  accommodation_id: string;
  name: string;
  ig_handle: string;
  ig_url: string;
  rarity: Rarity | "";
  scout_id: string;
  invited_at: string;
  check_in_date: string;
  check_out_date: string;
  day_of_week: string;
  inventory_status: string;
  booking_status: BookingStatus;
  cid_code: string;
  short_url: string;
  contract_progress: string;
  contract_file_url: string;
  task_pre_stay: boolean;
  task_post_story: boolean;
  task_ig_collab: boolean;
  publish_url: string;
  publish_date: string;
  order_number: string;
  inventory_count: string;
  kol_tags_input: string;
}

const EMPTY_FORM: FormState = {
  accommodation_id: "",
  name: "",
  ig_handle: "",
  ig_url: "",
  rarity: "",
  scout_id: "",
  invited_at: "",
  check_in_date: "",
  check_out_date: "",
  day_of_week: "",
  inventory_status: "",
  booking_status: "invited",
  cid_code: "",
  short_url: "",
  contract_progress: "",
  contract_file_url: "",
  task_pre_stay: false,
  task_post_story: false,
  task_ig_collab: false,
  publish_url: "",
  publish_date: "",
  order_number: "",
  inventory_count: "",
  kol_tags_input: "",
};

function toNullable(v: string): string | null {
  const t = v.trim();
  return t.length === 0 ? null : t;
}

function calcDayOfWeek(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return WEEKDAYS[d.getDay()] ?? "";
}

// ====== 主元件 ======
export default function TeamKOL() {
  const { roles, userId } = useTeam();
  const isManager =
    roles.includes("super_admin") ||
    roles.includes("admin") ||
    roles.includes("scout_manager");

  const [tab, setTab] = useState("invitations");
  const [prefill, setPrefill] = useState<InvitationPrefill | null>(null);

  const handleConvertFromProspect = (p: InvitationPrefill) => {
    setPrefill(p);
    setTab("invitations");
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">KOL 星探管理</h1>
        <p className="text-sm text-muted-foreground">
          管理 KOL 邀約、潛在名單與邀約目標
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="invitations">正式邀約</TabsTrigger>
          <TabsTrigger value="prospects">潛在名單</TabsTrigger>
          <TabsTrigger value="targets">邀約目標</TabsTrigger>
        </TabsList>

        <TabsContent value="invitations" className="mt-4">
          <InvitationsTab
            currentUserId={userId}
            isManager={isManager}
            prefill={prefill}
            onPrefillConsumed={() => setPrefill(null)}
          />
        </TabsContent>

        <TabsContent value="prospects" className="mt-4">
          <ProspectsTab
            currentUserId={userId}
            isManager={isManager}
            onConvert={handleConvertFromProspect}
          />
        </TabsContent>

        <TabsContent value="targets" className="mt-4">
          <TargetsTab isManager={isManager} currentUserId={userId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface InvitationPrefill {
  name: string;
  ig_handle: string;
  ig_url: string;
  scout_id: string;
  prospect_id: string;
}


// ====== Tab 一：正式邀約 ======
function InvitationsTab({
  currentUserId,
  isManager,
  prefill,
  onPrefillConsumed,
}: {
  currentUserId: string;
  isManager: boolean;
  prefill?: InvitationPrefill | null;
  onPrefillConsumed?: () => void;
}) {
  const [prospectLink, setProspectLink] = useState<string | null>(null);
  const [rows, setRows] = useState<KolRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [scouts, setScouts] = useState<Scout[]>([]);

  const [search, setSearch] = useState("");
  const [filterAcc, setFilterAcc] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"card" | "table">("card");
  const [showInvalid, setShowInvalid] = useState(false);

  // Sheet 表單
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [dupWarning, setDupWarning] = useState<string | null>(null);

  // 填錯 Dialog
  const [errorTarget, setErrorTarget] = useState<KolRow | null>(null);
  const [errorReason, setErrorReason] = useState("");
  const [reportingError, setReportingError] = useState(false);

  // 載入下拉資料
  useEffect(() => {
    (async () => {
      const [accRes, scoutRes] = await Promise.all([
        supabase
          .from("accommodation_info")
          .select("id, name, booking_type, short_url_alias")
          .order("name"),
        supabase
          .from("user_roles")
          .select("user_id, team_member_profiles!inner(user_id, display_name)")
          .eq("role", "scout"),
      ]);
      if (accRes.data) setAccommodations(accRes.data as Accommodation[]);
      if (scoutRes.data) {
        const seen = new Set<string>();
        const list: Scout[] = [];
        for (const r of scoutRes.data as any[]) {
          const uid = r.user_id;
          const dn = r.team_member_profiles?.display_name ?? uid;
          if (!seen.has(uid)) {
            seen.add(uid);
            list.push({ user_id: uid, display_name: dn });
          }
        }
        list.sort((a, b) => a.display_name.localeCompare(b.display_name));
        setScouts(list);
      }
    })();
  }, []);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("kol_profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (!showInvalid) q = q.eq("is_error", false);
    const { data, error } = await q;
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    // 取 scout 姓名
    const scoutIds = Array.from(
      new Set((data ?? []).map((r) => r.scout_id).filter(Boolean) as string[]),
    );
    let scoutMap = new Map<string, string>();
    if (scoutIds.length > 0) {
      const { data: profs } = await supabase
        .from("team_member_profiles")
        .select("user_id, display_name")
        .in("user_id", scoutIds);
      profs?.forEach((p) =>
        scoutMap.set(p.user_id, p.display_name ?? p.user_id),
      );
    }
    const accMap = new Map(accommodations.map((a) => [a.id, a.name]));
    const enriched = (data ?? []).map((r) => ({
      ...r,
      _accommodation_name: r.accommodation_id
        ? accMap.get(r.accommodation_id) ?? "-"
        : "-",
      _scout_name: r.scout_id ? scoutMap.get(r.scout_id) ?? "-" : "-",
    })) as KolRow[];
    setRows(enriched);
    setLoading(false);
  }, [showInvalid, accommodations]);

  useEffect(() => {
    if (accommodations.length > 0) fetchRows();
  }, [fetchRows, accommodations.length]);

  // 篩選
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filterAcc !== "all" && r.accommodation_id !== filterAcc) return false;
      if (filterStatus !== "all" && r.booking_status !== filterStatus)
        return false;
      if (s) {
        const a = (r.name ?? "").toLowerCase();
        const b = (r.ig_handle ?? "").toLowerCase();
        if (!a.includes(s) && !b.includes(s)) return false;
      }
      return true;
    });
  }, [rows, search, filterAcc, filterStatus]);

  // 入住日期 → 自動計算星期幾 & kpi_eligible（前端只算 day_of_week，kpi_eligible 寫入時帶上）
  useEffect(() => {
    if (form.check_in_date) {
      const dow = calcDayOfWeek(form.check_in_date);
      if (dow !== form.day_of_week) {
        setForm((f) => ({ ...f, day_of_week: dow }));
      }
    }
  }, [form.check_in_date]); // eslint-disable-line

  // ig_handle 即時重複檢查
  useEffect(() => {
    const ig = form.ig_handle.trim();
    if (!ig) {
      setDupWarning(null);
      return;
    }
    const handle = setTimeout(async () => {
      let q = supabase
        .from("kol_profiles")
        .select(
          "id, scout_id, invited_at, booking_status, team_member_profiles:scout_id(display_name)",
        )
        .eq("ig_handle", ig)
        .eq("is_error", false);
      if (editingId) q = q.neq("id", editingId);
      const { data } = await q.limit(1);
      if (data && data.length > 0) {
        const d: any = data[0];
        const sn =
          d.team_member_profiles?.display_name ?? d.scout_id ?? "未知";
        const stLabel =
          BOOKING_STATUS_LABEL[d.booking_status as BookingStatus] ??
          (d.booking_status ?? "-");
        setDupWarning(
          `此 KOL 已有邀約紀錄：${sn} 於 ${d.invited_at ?? "-"}，狀態：${stLabel}`,
        );
      } else {
        setDupWarning(null);
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [form.ig_handle, editingId]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDupWarning(null);
    setProspectLink(null);
    setSheetOpen(true);
  };

  // 從潛在名單轉入時，自動開啟 Sheet 並預填
  useEffect(() => {
    if (!prefill) return;
    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      name: prefill.name,
      ig_handle: prefill.ig_handle,
      ig_url: prefill.ig_url,
      scout_id: prefill.scout_id,
    });
    setProspectLink(prefill.prospect_id);
    setDupWarning(null);
    setSheetOpen(true);
    onPrefillConsumed?.();
  }, [prefill, onPrefillConsumed]);

  const openEdit = (row: KolRow) => {
    if (!canEditRow(row)) {
      toast.error("您沒有權限編輯這筆紀錄");
      return;
    }
    setEditingId(row.id);
    setForm({
      id: row.id,
      accommodation_id: row.accommodation_id ?? "",
      name: row.name ?? "",
      ig_handle: row.ig_handle ?? "",
      ig_url: row.ig_url ?? "",
      rarity: (row.rarity as Rarity) ?? "",
      scout_id: row.scout_id ?? "",
      invited_at: row.invited_at ?? "",
      check_in_date: row.check_in_date ?? "",
      check_out_date: row.check_out_date ?? "",
      day_of_week: row.day_of_week ?? "",
      inventory_status: row.inventory_status ?? "",
      booking_status: (row.booking_status as BookingStatus) ?? "invited",
      cid_code: row.cid_code ?? "",
      short_url: row.short_url ?? "",
      contract_progress: row.contract_progress ?? "",
      contract_file_url: row.contract_file_url ?? "",
      task_pre_stay: !!row.task_pre_stay,
      task_post_story: !!row.task_post_story,
      task_ig_collab: !!row.task_ig_collab,
      publish_url: row.publish_url ?? "",
      publish_date: row.publish_date ?? "",
      order_number: row.order_number ?? "",
      inventory_count:
        row.inventory_count != null ? String(row.inventory_count) : "",
      kol_tags_input: (row.kol_tags ?? []).join(", "),
    });
    setDupWarning(null);
    setSheetOpen(true);
  };

  const canEditRow = (row: KolRow) =>
    isManager || row.created_by === currentUserId;

  const canReportError = (row: KolRow) =>
    row.created_by === currentUserId || isManager;

  const handleSave = async () => {
    if (!form.accommodation_id) {
      toast.error("請選擇館別");
      return;
    }
    if (!form.name.trim()) {
      toast.error("請輸入 KOL 名稱");
      return;
    }
    if (!form.ig_handle.trim()) {
      toast.error("請輸入 IG 帳號");
      return;
    }

    setSaving(true);
    const kpiEligible = !!form.check_in_date;
    const kpiMonth = form.check_in_date
      ? form.check_in_date.slice(0, 7) + "-01"
      : null;
    const tags = form.kol_tags_input
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const payload: Record<string, any> = {
      accommodation_id: form.accommodation_id,
      name: form.name.trim(),
      ig_handle: form.ig_handle.trim(),
      ig_url: toNullable(form.ig_url),
      rarity: form.rarity || null,
      scout_id: form.scout_id || null,
      invited_at: form.invited_at || null,
      check_in_date: form.check_in_date || null,
      check_out_date: form.check_out_date || null,
      day_of_week: form.day_of_week || null,
      inventory_status: toNullable(form.inventory_status),
      booking_status: form.booking_status,
      cid_code: toNullable(form.cid_code),
      short_url: toNullable(form.short_url),
      contract_progress: toNullable(form.contract_progress),
      contract_file_url: toNullable(form.contract_file_url),
      task_pre_stay: form.task_pre_stay,
      task_post_story: form.task_post_story,
      task_ig_collab: form.task_ig_collab,
      publish_url: toNullable(form.publish_url),
      publish_date: form.publish_date || null,
      order_number: toNullable(form.order_number),
      inventory_count: form.inventory_count
        ? parseInt(form.inventory_count, 10)
        : null,
      kol_tags: tags.length > 0 ? tags : null,
      kpi_eligible: kpiEligible,
      kpi_month: kpiMonth,
    };

    let err;
    if (editingId) {
      ({ error: err } = await supabase
        .from("kol_profiles")
        .update(payload)
        .eq("id", editingId));
    } else {
      payload.created_by = currentUserId;
      payload.is_error = false;
      ({ error: err } = await supabase.from("kol_profiles").insert(payload));
    }
    setSaving(false);
    if (err) {
      toast.error(err.message);
      return;
    }
    toast.success(editingId ? "已更新邀約" : "已新增邀約");
    setSheetOpen(false);
    fetchRows();
  };

  const handleReportError = async () => {
    if (!errorTarget) return;
    if (!errorReason.trim()) {
      toast.error("請填寫填錯原因");
      return;
    }
    setReportingError(true);
    const { error } = await supabase
      .from("kol_profiles")
      .update({
        is_error: true,
        error_note: errorReason.trim(),
        corrected_by: currentUserId,
        corrected_at: new Date().toISOString(),
      })
      .eq("id", errorTarget.id);
    setReportingError(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("已標記為填錯");
    setErrorTarget(null);
    setErrorReason("");
    fetchRows();
  };

  // 表單上選定的館別 booking_type
  const selectedAcc = accommodations.find(
    (a) => a.id === form.accommodation_id,
  );
  const showCid = selectedAcc?.booking_type !== "short_url";
  const showShortUrl = selectedAcc?.booking_type === "short_url";
  const shortUrlPrefix = selectedAcc?.short_url_alias
    ? `https://liker.land/${selectedAcc.short_url_alias}/`
    : "";

  return (
    <div className="space-y-4">
      {/* 篩選列 */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="搜尋 KOL 名稱或 IG 帳號"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
        <Select value={filterAcc} onValueChange={setFilterAcc}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="館別" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部館別</SelectItem>
            {accommodations.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="狀態" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部狀態</SelectItem>
            {(Object.keys(BOOKING_STATUS_LABEL) as BookingStatus[]).map((k) => (
              <SelectItem key={k} value={k}>
                {BOOKING_STATUS_LABEL[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isManager && (
          <label className="flex items-center gap-1 text-sm text-muted-foreground">
            <Checkbox
              checked={showInvalid}
              onCheckedChange={(v) => setShowInvalid(!!v)}
            />
            含無效記錄
          </label>
        )}

        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-md border">
            <Button
              size="sm"
              variant={viewMode === "card" ? "secondary" : "ghost"}
              onClick={() => setViewMode("card")}
              className="rounded-r-none"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant={viewMode === "table" ? "secondary" : "ghost"}
              onClick={() => setViewMode("table")}
              className="rounded-l-none"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
          <Button onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" />
            新增邀約
          </Button>
        </div>
      </div>

      {/* 結果 */}
      {loading ? null : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            尚無資料
          </CardContent>
        </Card>
      ) : viewMode === "card" ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((r) => (
            <Card
              key={r.id}
              className="cursor-pointer transition hover:border-primary/40"
              onClick={() => openEdit(r)}
            >
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{r.name ?? "未命名"}</div>
                    <div className="text-xs text-muted-foreground">
                      @{r.ig_handle ?? "-"}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {r.rarity && (
                      <Badge
                        variant="outline"
                        className={RARITY_CLASS[r.rarity as Rarity]}
                      >
                        {r.rarity}
                      </Badge>
                    )}
                    {r.is_error && (
                      <Badge variant="outline" className="bg-red-100 text-red-700 border-red-300">
                        填錯
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div>館別：{r._accommodation_name}</div>
                  {r.check_in_date && <div>入住：{r.check_in_date}</div>}
                  <div>邀約人：{r._scout_name}</div>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <Badge
                    variant="outline"
                    className={
                      BOOKING_STATUS_CLASS[r.booking_status as BookingStatus] ??
                      ""
                    }
                  >
                    {BOOKING_STATUS_LABEL[r.booking_status as BookingStatus] ??
                      r.booking_status ??
                      "-"}
                  </Badge>
                  {canReportError(r) && !r.is_error && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        setErrorTarget(r);
                        setErrorReason("");
                      }}
                    >
                      <AlertTriangle className="mr-1 h-3.5 w-3.5" />
                      回報填錯
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>KOL 名稱</TableHead>
                <TableHead>IG 帳號</TableHead>
                <TableHead>稀有度</TableHead>
                <TableHead>館別</TableHead>
                <TableHead>入住日期</TableHead>
                <TableHead>邀約人</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    {r.name ?? "-"}
                    {r.is_error && (
                      <Badge
                        variant="outline"
                        className="ml-2 bg-red-100 text-red-700 border-red-300"
                      >
                        填錯
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>@{r.ig_handle ?? "-"}</TableCell>
                  <TableCell>
                    {r.rarity && (
                      <Badge
                        variant="outline"
                        className={RARITY_CLASS[r.rarity as Rarity]}
                      >
                        {r.rarity}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{r._accommodation_name}</TableCell>
                  <TableCell>{r.check_in_date ?? "-"}</TableCell>
                  <TableCell>{r._scout_name}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        BOOKING_STATUS_CLASS[
                          r.booking_status as BookingStatus
                        ] ?? ""
                      }
                    >
                      {BOOKING_STATUS_LABEL[
                        r.booking_status as BookingStatus
                      ] ??
                        r.booking_status ??
                        "-"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openEdit(r)}
                    >
                      編輯
                    </Button>
                    {canReportError(r) && !r.is_error && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setErrorTarget(r);
                          setErrorReason("");
                        }}
                      >
                        填錯
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* 新增/編輯 Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{editingId ? "編輯邀約" : "新增邀約"}</SheetTitle>
          </SheetHeader>

          <div className="mt-4 space-y-4">
            <Field label="館別 *">
              <Select
                value={form.accommodation_id}
                onValueChange={(v) =>
                  setForm({ ...form, accommodation_id: v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="選擇館別" />
                </SelectTrigger>
                <SelectContent>
                  {accommodations.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="KOL 名稱 *">
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
              <Field label="IG 帳號 *">
                <Input
                  value={form.ig_handle}
                  onChange={(e) =>
                    setForm({ ...form, ig_handle: e.target.value })
                  }
                />
              </Field>
            </div>

            {dupWarning && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
                ⚠️ {dupWarning}（仍可繼續新增）
              </div>
            )}

            <Field label="IG 網址">
              <Input
                value={form.ig_url}
                onChange={(e) => setForm({ ...form, ig_url: e.target.value })}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="稀有度">
                <Select
                  value={form.rarity || "none"}
                  onValueChange={(v) =>
                    setForm({
                      ...form,
                      rarity: v === "none" ? "" : (v as Rarity),
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">未設定</SelectItem>
                    {RARITY_OPTIONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="邀約人">
                <Select
                  value={form.scout_id || "none"}
                  onValueChange={(v) =>
                    setForm({ ...form, scout_id: v === "none" ? "" : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="選擇邀約人" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">未指定</SelectItem>
                    {scouts.map((s) => (
                      <SelectItem key={s.user_id} value={s.user_id}>
                        {s.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Field label="邀約日期">
                <Input
                  type="date"
                  value={form.invited_at}
                  onChange={(e) =>
                    setForm({ ...form, invited_at: e.target.value })
                  }
                />
              </Field>
              <Field label="入住日期">
                <Input
                  type="date"
                  value={form.check_in_date}
                  onChange={(e) =>
                    setForm({ ...form, check_in_date: e.target.value })
                  }
                />
              </Field>
              <Field label="退房日期">
                <Input
                  type="date"
                  value={form.check_out_date}
                  onChange={(e) =>
                    setForm({ ...form, check_out_date: e.target.value })
                  }
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="星期幾（自動）">
                <Input value={form.day_of_week} readOnly />
              </Field>
              <Field label="庫存狀態">
                <Input
                  value={form.inventory_status}
                  onChange={(e) =>
                    setForm({ ...form, inventory_status: e.target.value })
                  }
                />
              </Field>
            </div>

            <Field label="訂房狀態">
              <Select
                value={form.booking_status}
                onValueChange={(v) =>
                  setForm({ ...form, booking_status: v as BookingStatus })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(BOOKING_STATUS_LABEL) as BookingStatus[]).map(
                    (k) => (
                      <SelectItem key={k} value={k}>
                        {BOOKING_STATUS_LABEL[k]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </Field>

            {showCid && (
              <Field label="折扣碼 / CID">
                <Input
                  value={form.cid_code}
                  onChange={(e) =>
                    setForm({ ...form, cid_code: e.target.value })
                  }
                />
              </Field>
            )}

            {showShortUrl && (
              <Field label="短網址後綴">
                <Input
                  value={form.short_url}
                  onChange={(e) =>
                    setForm({ ...form, short_url: e.target.value })
                  }
                />
                {shortUrlPrefix && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    完整網址：{shortUrlPrefix}
                    {form.short_url || form.cid_code}
                  </p>
                )}
              </Field>
            )}

            <Field label="合約進度">
              <Input
                value={form.contract_progress}
                onChange={(e) =>
                  setForm({ ...form, contract_progress: e.target.value })
                }
              />
            </Field>

            <Field label="合約檔案連結">
              <Input
                value={form.contract_file_url}
                onChange={(e) =>
                  setForm({ ...form, contract_file_url: e.target.value })
                }
              />
            </Field>

            <Field label="任務完成">
              <div className="space-y-2">
                {[
                  { k: "task_pre_stay" as const, label: "入住前四件套" },
                  { k: "task_post_story" as const, label: "入住後限動" },
                  { k: "task_ig_collab" as const, label: "IG 協作" },
                ].map(({ k, label }) => (
                  <label key={k} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={!!form[k]}
                      onCheckedChange={(v) =>
                        setForm({ ...form, [k]: !!v } as FormState)
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="發布連結">
                <Input
                  value={form.publish_url}
                  onChange={(e) =>
                    setForm({ ...form, publish_url: e.target.value })
                  }
                />
              </Field>
              <Field label="發布日期">
                <Input
                  type="date"
                  value={form.publish_date}
                  onChange={(e) =>
                    setForm({ ...form, publish_date: e.target.value })
                  }
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="訂單編號">
                <Input
                  value={form.order_number}
                  onChange={(e) =>
                    setForm({ ...form, order_number: e.target.value })
                  }
                />
              </Field>
              <Field label="佔用庫存間數">
                <Input
                  type="number"
                  value={form.inventory_count}
                  onChange={(e) =>
                    setForm({ ...form, inventory_count: e.target.value })
                  }
                />
              </Field>
            </div>

            <Field label="KOL 標籤（以逗號分隔）">
              <Input
                value={form.kol_tags_input}
                onChange={(e) =>
                  setForm({ ...form, kol_tags_input: e.target.value })
                }
                placeholder="例如：美食, 親子, 寵物"
              />
            </Field>
          </div>

          <SheetFooter className="mt-6">
            <Button
              variant="outline"
              onClick={() => setSheetOpen(false)}
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

      {/* 填錯 Dialog */}
      <Dialog
        open={!!errorTarget}
        onOpenChange={(o) => !o && setErrorTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>回報填錯</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            將標記「{errorTarget?.name}」此筆紀錄為填錯，請填寫原因：
          </p>
          <Textarea
            value={errorReason}
            onChange={(e) => setErrorReason(e.target.value)}
            placeholder="例如：誤填入住日期、KOL 名稱錯誤..."
            rows={4}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setErrorTarget(null)}
              disabled={reportingError}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleReportError}
              disabled={reportingError}
            >
              {reportingError ? "送出中..." : "確認回報"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
