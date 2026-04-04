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

interface ParsedOrder {
  originalOrderNumber: string;
  orderDate: string;
  guestName: string;
  guestPhone: string;
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

export function ImportOrdersDialog({ open, onOpenChange, accommodationId, onSuccess }: ImportOrdersDialogProps) {
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
      // Load room types & existing order numbers in parallel
      const [rtRes, existingRes] = await Promise.all([
        supabase.from("room_types").select("id, name").eq("accommodation_id", accommodationId),
        supabase.from("orders").select("notes").eq("accommodation_id", accommodationId).not("notes", "is", null),
      ]);
      const rts: RoomType[] = rtRes.data || [];
      setRoomTypes(rts);

      // Extract existing imported order numbers from notes
      const existingImportedNumbers = new Set<string>();
      (existingRes.data || []).forEach((o: { notes: string | null }) => {
        const match = o.notes?.match(/\[匯入自奧丁丁: ([^\]]+)\]/);
        if (match) existingImportedNumbers.add(match[1]);
      });

      // Parse XLSX
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws);

      const parsed: ParsedOrder[] = rows.map(row => {
        const originalOrderNumber = String(row["訂單編號"] || "");
        const guestName = String(row["顧客"] || row["訂購人"] || "").replace(/^未填\s*/, "").trim();
        const phone = normalizePhone(row["訂購人電話"] as string | number);
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

        return {
          originalOrderNumber,
          orderDate: String(row["訂購日期"] || "").slice(0, 10),
          guestName,
          guestPhone: phone,
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

    toast({
      title: "匯入完成",
      description: `成功 ${successCount} 筆${failCount > 0 ? `，失敗 ${failCount} 筆` : ""}`,
      variant: failCount > 0 ? "destructive" : "default",
    });
    onSuccess();
    handleOpenChange(false);
  };

  const duplicateCount = parsedOrders.filter(o => o.isDuplicate).length;
  const unmatchedCount = parsedOrders.filter(o => !o.matchedRoomTypeId && !o.isDuplicate).length;
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
            支援從奧丁丁訂房系統匯出的 Excel 檔案
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
              <Upload className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">選擇從奧丁丁匯出的 .xlsx 檔案</p>
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
          <>
            {/* Summary badges */}
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
            </div>

            <ScrollArea className="flex-1 min-h-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[80px]">狀態</TableHead>
                    <TableHead className="min-w-[100px]">顧客</TableHead>
                    <TableHead className="min-w-[100px]">電話</TableHead>
                    <TableHead className="min-w-[90px]">入住</TableHead>
                    <TableHead className="min-w-[90px]">退房</TableHead>
                    <TableHead className="min-w-[150px]">房型對應</TableHead>
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
                      <TableCell className="text-right">${order.totalPrice.toLocaleString()}</TableCell>
                      <TableCell>
                        <span className="text-xs">{order.orderSource}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setStep("upload")}>重新選擇</Button>
              <Button onClick={handleImport} disabled={importableCount === 0}>
                確認匯入 {importableCount} 筆訂單
              </Button>
            </div>
          </>
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
