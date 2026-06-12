import { useState, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

interface RoomType {
  id: string;
  name: string;
}

interface Member {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

interface ParsedOrder {
  originalOrderNumber: string;
  orderDate: string;
  guestName: string;
  guestPhone: string;
  guestEmail: string;
  checkInDate: string;
  checkOutDate: string;
  guestCount: number;
  totalPrice: number;
  paidAmount: number;
  paymentStatus: string;
  orderSource: string;
  notes: string;
  roomTypeName: string;
  matchedRoomTypeId: string | null;
  matchedMemberId: string | null;
  matchedMemberName: string | null;
  isDuplicate: boolean;
}

interface ImportOrdersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accommodationId: string;
  onSuccess: () => void;
}

const SOURCE_MAP: Record<string, string> = {
  "官網": "website",
  "Line": "line",
  "LINE": "line",
  "line": "line",
  "Agoda": "agoda",
  "Booking": "booking",
  "Trip": "trip",
  "WeChat": "manual",
  "電話": "manual",
  "現場": "manual",
};

const PAYMENT_MAP: Record<string, string> = {
  "已結清": "paid",
  "已付訂": "deposit_paid",
  "未付款": "unpaid",
  "已退款": "refunded",
};

function normalizePhone(phone: string | number): string {
  let p = String(phone).replace(/\D/g, "");
  if (p.length === 9 && p.startsWith("9")) p = "0" + p;
  return p;
}

function fuzzyMatchRoom(name: string, roomTypes: RoomType[]): string | null {
  if (!name) return null;
  const exact = roomTypes.find(r => r.name === name);
  if (exact) return exact.id;
  const partial = roomTypes.find(r => name.includes(r.name) || r.name.includes(name));
  if (partial) return partial.id;
  return null;
}

function matchMember(phone: string, email: string, members: Member[]): Member | null {
  if (!phone && !email) return null;
  const normalizedPhone = phone ? phone.replace(/\D/g, "") : "";
  if (normalizedPhone) {
    const m = members.find(m => m.phone && m.phone.replace(/\D/g, "") === normalizedPhone);
    if (m) return m;
  }
  if (email) {
    const lowerEmail = email.toLowerCase().trim();
    const m = members.find(m => m.email && m.email.toLowerCase().trim() === lowerEmail);
    if (m) return m;
  }
  return null;
}

// ============== 旅安格式相關常數與工具 ==============
const RYAN_ACCOMMODATION_ID = "4ee31aca-5641-4d05-80e2-1c67626be83d";

const RYAN_ROOM_TYPE_MAP: Record<string, string> = {
  "A區8人包棟": "0258df76-f7bb-40eb-a3e5-98e5339f32c6",
  "A區10人包棟": "bb111e1d-8127-4b38-be7b-db920b052b13",
  "A區12人包棟": "b10ecdcf-8cd8-47c7-9d17-745f1f8d0165",
  "B區16人": "bfac245a-bddf-432e-b0f3-80d2b09af8a7",
  "B5 16人包棟": "c52ae481-bc0e-444b-bf4c-095cbe01ee2a",
  "B8包棟": "533df560-7a9f-4008-b183-ea9d4147f82d",
  "乘風雙人房": "c1e50e78-5de7-40e3-894e-7ca6aab216dc",
  "山隅雙人房": "985ff2cf-629b-416d-a5af-c0030318e969",
  "和洋家庭房": "f9a1a879-d632-402f-b76c-1d9513510cbd",
};

const RYAN_ROOM_UNIT_MAP: Record<string, string> = {
  "A9": "4a44bdf3-0591-4c05-8925-7619e94d8d88",
  "B8": "9263521b-7a61-4d0d-809a-05f0c221bc6a",
  "B6-202": "5ae1ecf8-2ea0-4ad7-b862-822108aed2fd",
  "B6-302": "e7153820-bc34-4b88-928f-5ca0643ddc61",
  "A3": "cc5d5619-7a04-456c-8806-9c0b85a6a4ba",
  "A5": "1dafa138-466a-4f37-acc9-472815753121",
  "A10": "f9a6a4c5-96c2-46d6-82db-f90c2c19737d",
  "A11": "0a7d81bf-e87e-4ab7-8277-123fd1bbb869",
  "B1": "a9e36007-e0d7-455d-b084-a7bf9de47a7c",
  "B2": "bf3a829d-f0f4-4e56-b041-2ba0f5eb14bc",
  "B3": "07598157-a83f-4c09-946a-311771fdfd54",
  "B7": "e79d93fb-8b62-49f7-b0ce-a72ff467d801",
  "B6-401": "b5bf7bd5-9c49-40c4-b448-10a13bafeb29",
  "B6-402": "fc834439-409d-49cb-8274-0487d901c935",
  "B5": "24ef79cd-312c-47a6-ac61-bb91a8d67c85",
  "B6-201": "ebc91231-ed43-4e6c-ae59-c4b99df0d607",
  "B6-301": "be209a09-f99f-4892-b95b-ca8c1bd82ce1",
};

const RYAN_STATUS_MAP: Record<string, { order_status: string; payment_status: string }> = {
  "已結清": { order_status: "confirmed", payment_status: "paid" },
  "待結清": { order_status: "confirmed", payment_status: "unpaid" },
  "訂金未付": { order_status: "pending", payment_status: "unpaid" },
  "已取消": { order_status: "cancelled", payment_status: "unpaid" },
};

function ryanToDateString(v: unknown): string {
  if (!v && v !== 0) return "";
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return s.slice(0, 10);
}

function isRyanFormat(headerRow: unknown[]): boolean {
  const set = new Set(headerRow.map((h) => String(h ?? "").trim()));
  return ["訂單編號", "訂房日", "入住日", "入住房型"].every((k) => set.has(k));
}

interface RyanImportResult {
  created: number;
  updated: number;
  warnings: string[];
}

interface RyanEdgePayload {
  order: {
    order_number: string;
    guest_name: string;
    order_date: string;
    check_in_date: string;
    check_out_date: string;
    total_price: number;
    final_price: number;
    order_source: string;
    order_status: string;
    payment_status: string;
    notes: string;
    discount_code: string | null;
    room_type_id: string | null;
    accommodation_id: string;
  };
  order_rooms: Array<{
    room_type_id: string;
    room_unit_id: string | null;
    quantity: number;
    room_price: number;
  }>;
  order_meta: {
    import_source: string;
    accommodation_id: string;
  };
}

const RYAN_BATCH_SIZE = 20;

async function importRyanOrders(
  rows: Record<string, unknown>[],
  onProgress: (pct: number, statusText?: string) => void,
): Promise<RyanImportResult> {
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const r of rows) {
    const num = String(r["訂單編號"] ?? "").trim();
    if (!num) continue;
    if (!groups.has(num)) groups.set(num, []);
    groups.get(num)!.push(r);
  }

  const warnings: string[] = [];
  const payload: RyanEdgePayload[] = [];

  for (const [orderNumber, rawRows] of groups) {
    // 同訂單編號內，房號完全相同（含空字串/null）的行只保留第一筆
    const seenRoomNumbers = new Set<string>();
    const rowsInGroup: Record<string, unknown>[] = [];
    for (const r of rawRows) {
      const key = String(r["房號"] ?? "").trim();
      if (seenRoomNumbers.has(key)) continue;
      seenRoomNumbers.add(key);
      rowsInGroup.push(r);
    }

    const first = rowsInGroup[0];
    const totalPrice = rowsInGroup.reduce(
      (s, r) => s + (Number(r["客房總價"]) || 0),
      0,
    );
    const finalPrice = rowsInGroup.reduce(
      (s, r) => s + (Number(r["應收總計"]) || 0),
      0,
    );

    // 取客房總價最高那行的房型
    let pickRow = first;
    let maxPrice = -1;
    for (const r of rowsInGroup) {
      const p = Number(r["客房總價"]) || 0;
      if (p > maxPrice) {
        maxPrice = p;
        pickRow = r;
      }
    }
    if (maxPrice <= 0) pickRow = first;
    const orderLevelRoomTypeId =
      RYAN_ROOM_TYPE_MAP[String(pickRow["入住房型"] ?? "").trim()] ?? null;

    const statusKey = String(first["訂單狀態"] ?? "").trim();
    const mapped =
      RYAN_STATUS_MAP[statusKey] ?? { order_status: "pending", payment_status: "unpaid" };

    const orderType = String(first["訂單類型"] ?? "").trim();
    const projectName = String(first["專案"] ?? "").trim();
    const rawNote = String(first["備註"] ?? "").trim();

    const noteParts: string[] = [`[匯入自旅安: ${orderNumber}]`];
    if (orderType) noteParts.push(`【訂單類型：${orderType}】`);
    if (projectName) noteParts.push(`【專案：${projectName}】`);
    if (rawNote) noteParts.push(rawNote);

    let discountCode: string | null = null;
    if (rawNote) {
      const m = rawNote.match(/\[.*?:(\S+?)\]折扣/);
      if (m) discountCode = m[1];
    }

    const guestName = String(first["入住人"] ?? "").trim() || "未填";

    let skippedRoomRows = 0;
    const orderRooms: RyanEdgePayload["order_rooms"] = [];
    for (const r of rowsInGroup) {
      const rtName = String(r["入住房型"] ?? "").trim();
      const rtId = RYAN_ROOM_TYPE_MAP[rtName];
      if (!rtId) {
        skippedRoomRows++;
        continue;
      }
      const unitName = String(r["房號"] ?? "").trim();
      const unitId = RYAN_ROOM_UNIT_MAP[unitName] ?? null;
      orderRooms.push({
        room_type_id: rtId,
        room_unit_id: unitId,
        quantity: 1,
        room_price: Number(r["客房總價"]) || 0,
      });
    }
    if (skippedRoomRows > 0) {
      warnings.push(`訂單 ${orderNumber} 有 ${skippedRoomRows} 行因找不到房型對應而跳過`);
    }

    const addonAmount = rowsInGroup.reduce(
      (s, r) => s + (Number(r["其他營收(不含取消費)"]) || 0),
      0,
    );

    const finalNoteParts = [...noteParts];
    if (addonAmount !== 0) {
      finalNoteParts.push(`【其他營收：${addonAmount}】`);
    }
    const finalNotes = finalNoteParts.join("\n");

    // 同一訂單最早入住日 / 最晚退房日
    const checkInDates = rowsInGroup
      .map((r) => ryanToDateString(r["入住日"]))
      .filter((d): d is string => !!d)
      .sort();
    const checkOutDates = rowsInGroup
      .map((r) => ryanToDateString(r["退房日"]))
      .filter((d): d is string => !!d)
      .sort();
    const checkInDate = checkInDates[0] ?? ryanToDateString(first["入住日"]);
    const checkOutDate =
      checkOutDates[checkOutDates.length - 1] ?? ryanToDateString(first["退房日"]);

    payload.push({
      order: {
        order_number: orderNumber,
        guest_name: guestName,
        order_date: ryanToDateString(first["訂房日"]),
        check_in_date: checkInDate,
        check_out_date: checkOutDate,
        total_price: totalPrice,
        final_price: finalPrice,
        order_source: String(first["通路"] ?? "").trim(),
        order_status: mapped.order_status,
        payment_status: mapped.payment_status,
        notes: finalNotes,
        discount_code: discountCode,
        room_type_id: orderLevelRoomTypeId,
        accommodation_id: RYAN_ACCOMMODATION_ID,
      },
      order_rooms: orderRooms,
      order_meta: {
        import_source: "旅安",
        accommodation_id: RYAN_ACCOMMODATION_ID,
      },
    });
  }

  // 分批呼叫 Edge Function
  const batches: RyanEdgePayload[][] = [];
  for (let i = 0; i < payload.length; i += RYAN_BATCH_SIZE) {
    batches.push(payload.slice(i, i + RYAN_BATCH_SIZE));
  }

  let totalInserted = 0;
  let totalUpdated = 0;
  let processed = 0;

  if (batches.length === 0) {
    onProgress(100, "沒有可匯入的訂單");
    return { created: 0, updated: 0, warnings };
  }

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    onProgress(
      Math.round((bi / batches.length) * 100),
      `正在匯入第 ${bi + 1} 批 / 共 ${batches.length} 批（已處理 ${processed} 筆）`,
    );

    try {
      const { data, error } = await supabase.functions.invoke("import-ryoan-orders", {
        body: batch,
      });
      if (error) throw new Error(error.message || "Edge Function 呼叫失敗");

      const result = data as {
        inserted: number;
        updated: number;
        errors: Array<{ order_number: string; message: unknown }>;
      };
      totalInserted += result.inserted ?? 0;
      totalUpdated += result.updated ?? 0;
      for (const e of result.errors ?? []) {
        const msg = typeof e.message === "string"
          ? e.message
          : (() => { try { return JSON.stringify(e.message); } catch { return String(e.message); } })();
        warnings.push(`訂單 ${e.order_number} 寫入失敗：${msg}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`第 ${bi + 1} 批（${batch.length} 筆）失敗：${msg}`);
    }

    processed += batch.length;
    onProgress(
      Math.round(((bi + 1) / batches.length) * 100),
      `已完成第 ${bi + 1} 批 / 共 ${batches.length} 批（已處理 ${processed} 筆）`,
    );
  }

  return {
    created: totalInserted,
    updated: totalUpdated,
    warnings,
  };
}



export function ImportOrdersDialog({ open, onOpenChange, accommodationId, onSuccess }: ImportOrdersDialogProps) {
  const isRyoan = accommodationId === '4ee31aca-5641-4d05-80e2-1c67626be83d';
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"upload" | "preview" | "importing">("upload");
  const [parsedOrders, setParsedOrders] = useState<ParsedOrder[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [importProgress, setImportProgress] = useState(0);

  const resetState = useCallback(() => {
    setStep("upload");
    setParsedOrders([]);
    setRoomTypes([]);
    setImportProgress(0);
  }, []);

  const handleOpenChange = (open: boolean) => {
    if (!open) resetState();
    onOpenChange(open);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = "";

    try {
      // Parse XLSX first to detect format
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawAoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
      const headerRow = (rawAoa[0] ?? []) as unknown[];

      // 旅安格式偵測 → 走獨立流程
      if (isRyanFormat(headerRow)) {
        const ryanRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
        setStep("importing");
        setImportProgress(0);
        try {
          const result = await importRyanOrders(ryanRows, setImportProgress);
          handleOpenChange(false);
          const baseDesc = `新增 ${result.created} 筆、更新 ${result.updated} 筆`;
          const warnDesc = result.warnings.length
            ? `\n警告：\n${result.warnings.join("\n")}`
            : "";
          toast({
            title: "旅安匯入完成",
            description: baseDesc + warnDesc,
            variant: result.warnings.length > 0 ? "destructive" : "default",
          });
          setTimeout(() => onSuccess(), 300);
        } catch (err) {
          console.error("Ryan import error:", err);
          toast({
            title: "旅安匯入失敗",
            description: err instanceof Error ? err.message : "未知錯誤",
            variant: "destructive",
          });
          setStep("upload");
        }
        return;
      }

      // 奧丁丁原流程
      const [rtRes, existingRes, membersRes] = await Promise.all([
        supabase.from("room_types").select("id, name").eq("accommodation_id", accommodationId),
        supabase.from("orders").select("notes").eq("accommodation_id", accommodationId).not("notes", "is", null),
        supabase.from("platform_members").select("id, name, email, phone"),
      ]);
      const rts: RoomType[] = rtRes.data || [];
      setRoomTypes(rts);
      const members: Member[] = membersRes.data || [];

      // Extract existing imported order numbers from notes
      const existingImportedNumbers = new Set<string>();
      (existingRes.data || []).forEach((o: { notes: string | null }) => {
        const match = o.notes?.match(/\[匯入自奧丁丁: ([^\]]+)\]/);
        if (match) existingImportedNumbers.add(match[1]);
      });

      const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws);



      const parsed: ParsedOrder[] = rows.map(row => {
        const originalOrderNumber = String(row["訂單編號"] || "");
        const guestName = String(row["顧客"] || row["訂購人"] || "").replace(/^未填\s*/, "").trim();
        const phone = normalizePhone(row["訂購人電話"] as string | number);
        const email = String(row["訂購人信箱"] || row["Email"] || "").trim();
        const checkIn = String(row["入住時間"] || "");
        const checkOut = String(row["退房時間"] || "");
        const adults = Number(row["成人"]) || 1;
        const kids = Number(row["孩童"]) || 0;
        const price = Number(row["價格"]) || 0;
        const paid = Number(row["已收"]) || 0;
        const paymentLabel = String(row["付款狀態"] || "未付款");
        const customerSource = String(row["顧客來源"] || "");
        const notes = String(row["訂單備註"] || "");
        const roomName = String(row["房型房號"] || "");

        const matched = matchMember(phone, email, members);

        return {
          originalOrderNumber,
          orderDate: String(row["訂購日期"] || "").slice(0, 10),
          guestName,
          guestPhone: phone,
          guestEmail: email,
          checkInDate: checkIn,
          checkOutDate: checkOut,
          guestCount: adults + kids,
          totalPrice: price,
          paidAmount: paid,
          paymentStatus: PAYMENT_MAP[paymentLabel] || "unpaid",
          orderSource: SOURCE_MAP[customerSource] || "manual",
          notes: notes,
          roomTypeName: roomName,
          matchedRoomTypeId: fuzzyMatchRoom(roomName, rts),
          matchedMemberId: matched?.id || null,
          matchedMemberName: matched?.name || null,
          isDuplicate: existingImportedNumbers.has(originalOrderNumber),
        };
      });

      setParsedOrders(parsed);
      setStep("preview");
    } catch (err) {
      console.error("Parse error:", err);
      toast({ title: "檔案解析失敗", description: "請確認檔案格式是否正確", variant: "destructive" });
    }
  };

  const updateRoomTypeMapping = (index: number, roomTypeId: string) => {
    setParsedOrders(prev => prev.map((o, i) => i === index ? { ...o, matchedRoomTypeId: roomTypeId === "none" ? null : roomTypeId } : o));
  };

  const handleImport = async () => {
    const toImport = parsedOrders.filter(o => !o.isDuplicate);
    if (toImport.length === 0) {
      toast({ title: "沒有可匯入的訂單", description: "所有訂單均已存在", variant: "destructive" });
      return;
    }

    setStep("importing");
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < toImport.length; i++) {
      const o = toImport[i];
      const noteWithTag = `[匯入自奧丁丁: ${o.originalOrderNumber}]${o.notes ? "\n" + o.notes : ""}`;

      // Determine order status based on dates
      const today = new Date().toISOString().slice(0, 10);
      let orderStatus = "confirmed";
      if (o.checkOutDate <= today) orderStatus = "checked_out";
      else if (o.checkInDate <= today && o.checkOutDate > today) orderStatus = "checked_in";

      const insertData: Record<string, unknown> = {
        accommodation_id: accommodationId,
        guest_name: o.guestName || "未填",
        guest_phone: o.guestPhone || "0000000000",
        guest_email: o.guestEmail || null,
        check_in_date: o.checkInDate,
        check_out_date: o.checkOutDate,
        guest_count: o.guestCount,
        total_price: o.totalPrice,
        final_price: o.totalPrice,
        paid_amount: o.paidAmount,
        deposit_amount: 0,
        payment_status: o.paymentStatus,
        order_status: orderStatus,
        order_source: o.orderSource,
        order_date: o.orderDate || new Date().toISOString(),
        room_type_id: o.matchedRoomTypeId || null,
        member_id: o.matchedMemberId || null,
        notes: noteWithTag,
      };
      const { error } = await supabase.from("orders").insert(insertData as never);

      if (error) {
        console.error("Import error:", error);
        failCount++;
      } else {
        successCount++;
      }
      setImportProgress(Math.round(((i + 1) / toImport.length) * 100));
    }

    // Close dialog first, then refresh orders after a brief delay to avoid flicker
    handleOpenChange(false);
    toast({
      title: "匯入完成",
      description: `成功 ${successCount} 筆${failCount > 0 ? `，失敗 ${failCount} 筆` : ""}`,
      variant: failCount > 0 ? "destructive" : "default",
    });
    // Delay refresh so the dialog closing animation completes first
    setTimeout(() => {
      onSuccess();
    }, 300);
  };

  const duplicateCount = parsedOrders.filter(o => o.isDuplicate).length;
  const unmatchedCount = parsedOrders.filter(o => !o.matchedRoomTypeId && !o.isDuplicate).length;
  const memberMatchedCount = parsedOrders.filter(o => o.matchedMemberId && !o.isDuplicate).length;
  const importableCount = parsedOrders.filter(o => !o.isDuplicate).length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            匯入訂單
          </DialogTitle>
          <DialogDescription>
            {isRyoan ? '支援從旅安系統匯出的 Excel 檔案' : '支援從奧丁丁訂房系統匯出的 Excel 檔案'}
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
              <Upload className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">{isRyoan ? '選擇從旅安匯出的 .xlsx 檔案' : '選擇從奧丁丁匯出的 .xlsx 檔案'}</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleFileSelect}
            />
            <Button onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" />
              選擇檔案
            </Button>
          </div>
        )}

        {step === "preview" && (
          <div className="flex flex-1 min-h-0 flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">共 {parsedOrders.length} 筆</Badge>
              <Badge className="bg-primary/10 text-primary border-primary/20">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                可匯入 {importableCount} 筆
              </Badge>
              {duplicateCount > 0 && (
                <Badge variant="destructive">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  重複 {duplicateCount} 筆（將跳過）
                </Badge>
              )}
              {unmatchedCount > 0 && (
                <Badge className="bg-warning/10 text-warning border-warning/20">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {unmatchedCount} 筆未匹配房型
                </Badge>
              )}
              {memberMatchedCount > 0 && (
                <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  {memberMatchedCount} 筆已匹配會員
                </Badge>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[80px]">狀態</TableHead>
                    <TableHead className="min-w-[100px]">顧客</TableHead>
                    <TableHead className="min-w-[100px]">電話</TableHead>
                    <TableHead className="min-w-[90px]">入住</TableHead>
                    <TableHead className="min-w-[90px]">退房</TableHead>
                    <TableHead className="min-w-[150px]">房型對應</TableHead>
                    <TableHead className="min-w-[100px]">會員</TableHead>
                    <TableHead className="min-w-[80px] text-right">金額</TableHead>
                    <TableHead className="min-w-[80px]">來源</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedOrders.map((order, idx) => (
                    <TableRow key={idx} className={order.isDuplicate ? "opacity-50" : ""}>
                      <TableCell>
                        {order.isDuplicate ? (
                          <Badge variant="destructive" className="text-xs">重複</Badge>
                        ) : order.matchedRoomTypeId ? (
                          <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">OK</Badge>
                        ) : (
                          <Badge className="bg-warning/10 text-warning border-warning/20 text-xs">未匹配</Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{order.guestName}</TableCell>
                      <TableCell>{order.guestPhone}</TableCell>
                      <TableCell>{order.checkInDate}</TableCell>
                      <TableCell>{order.checkOutDate}</TableCell>
                      <TableCell>
                        {order.isDuplicate ? (
                          <span className="text-xs text-muted-foreground line-through">{order.roomTypeName}</span>
                        ) : (
                          <Select
                            value={order.matchedRoomTypeId || "none"}
                            onValueChange={(v) => updateRoomTypeMapping(idx, v)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="選擇房型" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">不指定（{order.roomTypeName}）</SelectItem>
                              {roomTypes.map(rt => (
                                <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell>
                        {order.matchedMemberName ? (
                          <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-xs">{order.matchedMemberName}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">${order.totalPrice.toLocaleString()}</TableCell>
                      <TableCell>
                        <span className="text-xs">{order.orderSource}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-end gap-2 border-t pt-2">
              <Button variant="outline" onClick={() => setStep("upload")}>重新選擇</Button>
              <Button onClick={handleImport} disabled={importableCount === 0}>
                確認匯入 {importableCount} 筆訂單
              </Button>
            </div>
          </div>
        )}

        {step === "importing" && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">正在匯入訂單...</p>
            <div className="w-64 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300 rounded-full"
                style={{ width: `${importProgress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">{importProgress}%</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
