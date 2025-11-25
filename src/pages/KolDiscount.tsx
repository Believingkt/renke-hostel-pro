import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, Copy, Pencil, Check, Pause, X, Eye, Calendar as CalendarIcon, GripVertical, Code, DollarSign, Ticket, Tag } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useSubdomain } from "@/hooks/use-subdomain";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { TableSkeleton } from "@/components/skeletons/TableSkeleton";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CommissionRecordsDialog } from "@/components/CommissionRecordsDialog";
import { IntegratedCodeDetailsDialog } from "@/components/IntegratedCodeDetailsDialog";

interface DiscountCode {
  id: string;
  accommodation_id: string;
  name: string;
  code: string;
  discount_type: "percentage" | "amount";
  discount_value: number;
  usage_limit: number;
  used_count: number;
  valid_from: string;
  valid_until: string | null;
  is_active: boolean;
  min_order_amount: number;
  applicable_room_types: string[];
  applicable_date_from: string | null;
  applicable_date_to: string | null;
  display_order: number;
  commission_rate: number;
  created_at: string;
  updated_at: string;
}

const KolDiscount = () => {
  const navigate = useNavigate();
  const { accommodationId } = useSubdomain();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<DiscountCode | null>(null);
  const [name, setName] = useState("");
  const [discountType, setDiscountType] = useState<"percentage" | "amount">("percentage");
  const [discountValue, setDiscountValue] = useState("");
  const [usageLimit, setUsageLimit] = useState("");
  const [validFrom, setValidFrom] = useState<Date>(new Date());
  const [validUntil, setValidUntil] = useState<Date | undefined>();
  const [minOrderAmount, setMinOrderAmount] = useState("");
  const [selectedRoomTypes, setSelectedRoomTypes] = useState<string[]>([]);
  const [applicableDateFrom, setApplicableDateFrom] = useState<Date | undefined>();
  const [applicableDateTo, setApplicableDateTo] = useState<Date | undefined>();
  const [roomTypes, setRoomTypes] = useState<Array<{ id: string; name: string }>>([]);
  const [discountCodes, setDiscountCodes] = useState<DiscountCode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [apiDocOpen, setApiDocOpen] = useState(false);
  const [commissionRate, setCommissionRate] = useState("");
  const [integratedDetailsOpen, setIntegratedDetailsOpen] = useState(false);
  const [selectedCodeForCommission, setSelectedCodeForCommission] = useState<DiscountCode | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "expired" | "full">("all");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (accommodationId) {
      fetchDiscountCodes();
      fetchRoomTypes();
    }
  }, [accommodationId]);

  const fetchRoomTypes = async () => {
    if (!accommodationId) return;

    try {
      const { data, error } = await supabase
        .from("room_types")
        .select("id, name")
        .eq("accommodation_id", accommodationId)
        .order("display_order");

      if (error) throw error;
      setRoomTypes(data || []);
    } catch (error) {
      console.error("Error fetching room types:", error);
    }
  };

  const fetchDiscountCodes = async () => {
    if (!accommodationId) return;

    try {
      const { data, error } = await supabase
        .from("discount_codes")
        .select("*")
        .eq("accommodation_id", accommodationId)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: false });

      if (error) throw error;
      setDiscountCodes((data || []) as DiscountCode[]);
    } catch (error) {
      console.error("Error fetching discount codes:", error);
      toast({
        title: "載入失敗",
        description: "無法載入網紅導購列表",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const generateCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const handleSubmit = async () => {
    if (!accommodationId) {
      toast({
        title: "系統錯誤",
        description: "無法取得住宿資訊",
        variant: "destructive",
      });
      return;
    }

    if (!name.trim()) {
      toast({
        title: "請填寫折扣碼名稱",
        variant: "destructive",
      });
      return;
    }

    if (!discountValue || parseFloat(discountValue) <= 0) {
      toast({
        title: "請填寫有效的折扣值",
        description: "折扣值必須大於 0",
        variant: "destructive",
      });
      return;
    }

    if (!usageLimit || parseInt(usageLimit) <= 0) {
      toast({
        title: "請填寫有效的使用次數上限",
        description: "使用次數上限必須大於 0",
        variant: "destructive",
      });
      return;
    }

    const code = generateCode();

    try {
      const { error } = await supabase.from("discount_codes").insert({
        accommodation_id: accommodationId,
        name,
        code,
        discount_type: discountType,
        discount_value: parseFloat(discountValue),
        usage_limit: parseInt(usageLimit),
        valid_from: validFrom.toISOString(),
        valid_until: validUntil?.toISOString() || null,
        min_order_amount: minOrderAmount ? parseInt(minOrderAmount) : 0,
        applicable_room_types: selectedRoomTypes,
        applicable_date_from: applicableDateFrom?.toISOString().split('T')[0] || null,
        applicable_date_to: applicableDateTo?.toISOString().split('T')[0] || null,
        commission_rate: commissionRate ? parseFloat(commissionRate) : 0,
      });

      if (error) throw error;

      toast({
        title: "折扣碼新增成功",
        description: `折扣碼：${code}`,
      });

      setOpen(false);
      setName("");
      setDiscountValue("");
      setUsageLimit("");
      setDiscountType("percentage");
      setValidFrom(new Date());
      setValidUntil(undefined);
      setMinOrderAmount("");
      setSelectedRoomTypes([]);
      setApplicableDateFrom(undefined);
      setApplicableDateTo(undefined);
      setCommissionRate("");
      fetchDiscountCodes();
    } catch (error) {
      console.error("Error creating discount code:", error);
      toast({
        title: "新增失敗",
        description: "無法新增網紅導購",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from("discount_codes")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "折扣碼已刪除",
      });
      fetchDiscountCodes();
    } catch (error) {
      console.error("Error deleting discount code:", error);
      toast({
        title: "刪除失敗",
        variant: "destructive",
      });
    }
  };

  const handleCopyCodeText = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
    toast({
      title: "已複製折扣碼",
      description: code,
    });
  };

  const handleCopyReferralLink = (code: string) => {
    const referralLink = `https://sensaninn.lakeze.com/booking?ref=${code}`;
    navigator.clipboard.writeText(referralLink);
    setCopiedLink(code);
    setTimeout(() => setCopiedLink(null), 2000);
    toast({
      title: "已複製推薦連結",
      description: "推薦連結已複製到剪貼簿",
    });
  };

  const formatDiscount = (type: "percentage" | "amount", value: number) => {
    return type === "percentage" ? `${value}%` : `NT$ ${value}`;
  };

  const handleOpenEdit = (code: DiscountCode) => {
    setEditingCode(code);
    setName(code.name);
    setDiscountType(code.discount_type);
    setDiscountValue(code.discount_value.toString());
    setUsageLimit(code.usage_limit.toString());
    setValidFrom(new Date(code.valid_from));
    setValidUntil(code.valid_until ? new Date(code.valid_until) : undefined);
    setMinOrderAmount(code.min_order_amount > 0 ? code.min_order_amount.toString() : "");
    setSelectedRoomTypes(code.applicable_room_types || []);
    setApplicableDateFrom(code.applicable_date_from ? new Date(code.applicable_date_from) : undefined);
    setApplicableDateTo(code.applicable_date_to ? new Date(code.applicable_date_to) : undefined);
    setCommissionRate(code.commission_rate?.toString() || "0");
    setEditOpen(true);
  };

  const handleUpdateCode = async () => {
    if (!editingCode) {
      toast({
        title: "系統錯誤",
        description: "無法取得折扣碼資訊",
        variant: "destructive",
      });
      return;
    }

    if (!name.trim()) {
      toast({
        title: "請填寫折扣碼名稱",
        variant: "destructive",
      });
      return;
    }

    if (!discountValue || parseFloat(discountValue) <= 0) {
      toast({
        title: "請填寫有效的折扣值",
        description: "折扣值必須大於 0",
        variant: "destructive",
      });
      return;
    }

    if (!usageLimit || parseInt(usageLimit) <= 0) {
      toast({
        title: "請填寫有效的使用次數上限",
        description: "使用次數上限必須大於 0",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from("discount_codes")
        .update({
          name,
          discount_type: discountType,
          discount_value: parseFloat(discountValue),
          usage_limit: parseInt(usageLimit),
          valid_from: validFrom.toISOString(),
          valid_until: validUntil?.toISOString() || null,
          min_order_amount: minOrderAmount ? parseInt(minOrderAmount) : 0,
          applicable_room_types: selectedRoomTypes,
          applicable_date_from: applicableDateFrom?.toISOString().split('T')[0] || null,
          applicable_date_to: applicableDateTo?.toISOString().split('T')[0] || null,
          commission_rate: commissionRate ? parseFloat(commissionRate) : 0,
        })
        .eq("id", editingCode.id);

      if (error) throw error;

      toast({
        title: "折扣碼更新成功",
      });

      setEditOpen(false);
      setEditingCode(null);
      setName("");
      setDiscountValue("");
      setUsageLimit("");
      setDiscountType("percentage");
      setValidFrom(new Date());
      setValidUntil(undefined);
      setMinOrderAmount("");
      setSelectedRoomTypes([]);
      setApplicableDateFrom(undefined);
      setApplicableDateTo(undefined);
      setCommissionRate("");
      fetchDiscountCodes();
    } catch (error) {
      console.error("Error updating discount code:", error);
      toast({
        title: "更新失敗",
        description: "無法更新網紅導購",
        variant: "destructive",
      });
    }
  };

  const handleDialogClose = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      // 清除表單
      setName("");
      setDiscountValue("");
      setUsageLimit("");
      setDiscountType("percentage");
      setValidFrom(new Date());
      setValidUntil(undefined);
      setMinOrderAmount("");
      setSelectedRoomTypes([]);
      setApplicableDateFrom(undefined);
      setApplicableDateTo(undefined);
      setCommissionRate("");
    }
  };

  const toggleActive = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from("discount_codes")
        .update({ is_active: !currentStatus })
        .eq("id", id);

      if (error) throw error;

      toast({
        title: currentStatus ? "折扣碼已停用" : "折扣碼已啟用",
      });
      fetchDiscountCodes();
    } catch (error) {
      console.error("Error toggling status:", error);
      toast({
        title: "更新失敗",
        variant: "destructive",
      });
    }
  };

  const getCodeStatus = (code: DiscountCode): "inactive" | "pending" | "expired" | "full" | "active" => {
    if (!code.is_active) {
      return "inactive";
    }
    
    const now = new Date();
    const validFrom = new Date(code.valid_from);
    const validUntil = code.valid_until ? new Date(code.valid_until) : null;

    if (now < validFrom) {
      return "pending";
    }
    
    if (validUntil && now > validUntil) {
      return "expired";
    }
    
    if (code.used_count >= code.usage_limit) {
      return "full";
    }

    return "active";
  };

  const getStatusBadge = (code: DiscountCode) => {
    const status = getCodeStatus(code);
    
    switch (status) {
      case "inactive":
        return <Badge variant="secondary">已停用</Badge>;
      case "pending":
        return <Badge variant="secondary">未生效</Badge>;
      case "expired":
        return <Badge variant="destructive">已過期</Badge>;
      case "full":
        return <Badge variant="destructive">已達上限</Badge>;
      case "active":
        return <Badge variant="default" className="bg-green-600">有效</Badge>;
    }
  };

  const getFilteredDiscountCodes = () => {
    if (filterStatus === "all") {
      return discountCodes;
    }

    return discountCodes.filter((code) => {
      const status = getCodeStatus(code);
      
      switch (filterStatus) {
        case "active":
          return status === "active";
        case "expired":
          return status === "expired";
        case "full":
          return status === "full";
        default:
          return true;
      }
    });
  };

  const filteredCodes = getFilteredDiscountCodes();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = discountCodes.findIndex((code) => code.id === active.id);
    const newIndex = discountCodes.findIndex((code) => code.id === over.id);

    const newOrder = arrayMove(discountCodes, oldIndex, newIndex);
    setDiscountCodes(newOrder);

    // 更新資料庫中的排序
    try {
      const updates = newOrder.map((code, index) => ({
        id: code.id,
        display_order: index + 1,
      }));

      for (const update of updates) {
        await supabase
          .from("discount_codes")
          .update({ display_order: update.display_order })
          .eq("id", update.id);
      }

      toast({
        title: "排序已更新",
      });
    } catch (error) {
      console.error("Error updating order:", error);
      toast({
        title: "排序更新失敗",
        variant: "destructive",
      });
      // 恢復原始順序
      fetchDiscountCodes();
    }
  };

  // Sortable Row Component
  const SortableRow = ({ item }: { item: DiscountCode }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: item.id });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    };

    return (
      <TableRow ref={setNodeRef} style={style} key={item.id}>
        <TableCell>
          <button
            className="cursor-grab active:cursor-grabbing touch-none"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-5 w-5 text-muted-foreground" />
          </button>
        </TableCell>
        <TableCell className="font-medium">{item.name}</TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <code className="px-2 py-1 bg-muted rounded text-sm font-mono">
              {item.code}
            </code>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8 transition-all",
                copiedCode === item.code && "bg-success/10"
              )}
              onClick={() => handleCopyCodeText(item.code)}
            >
              {copiedCode === item.code ? (
                <Check className="h-4 w-4 text-success animate-scale-in" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </TableCell>
        <TableCell>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 gap-1.5 transition-all -ml-4",
              copiedLink === item.code && "bg-success/10 text-success"
            )}
            onClick={() => handleCopyReferralLink(item.code)}
          >
            {copiedLink === item.code ? (
              <>
                已複製
                <Check className="h-4 w-4 animate-scale-in" />
              </>
            ) : (
              <>
                複製連結
                <Copy className="h-4 w-4" />
              </>
            )}
          </Button>
        </TableCell>
        <TableCell>
          {formatDiscount(item.discount_type, item.discount_value)}
        </TableCell>
        <TableCell>{item.used_count} 次</TableCell>
        <TableCell>
          <span>{item.usage_limit} 次</span>
        </TableCell>
        <TableCell>
          <div className="text-sm space-y-1">
            <div>{format(new Date(item.valid_from), "yyyy/MM/dd")}</div>
            {item.valid_until && (
              <div className="text-muted-foreground">
                至 {format(new Date(item.valid_until), "yyyy/MM/dd")}
              </div>
            )}
            {!item.valid_until && (
              <div className="text-muted-foreground">無期限</div>
            )}
          </div>
        </TableCell>
        <TableCell>
          {getStatusBadge(item)}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => handleOpenEdit(item)}
              title="編輯"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                setSelectedCodeForCommission(item);
                setIntegratedDetailsOpen(true);
              }}
              title="查看詳情"
            >
              <Eye className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 group"
              onClick={() => toggleActive(item.id, item.is_active)}
              title={item.is_active ? "停用" : "啟用"}
            >
              {item.is_active ? (
                <Pause className="h-4 w-4 text-orange-500 group-hover:text-white transition-colors" />
              ) : (
                <Check className="h-4 w-4 text-green-600 group-hover:text-white transition-colors" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="group"
              onClick={() => handleDelete(item.id)}
            >
              <Trash2 className="h-4 w-4 text-destructive group-hover:text-white transition-colors" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="網紅導購" icon={Ticket} />
        <TableSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="網紅導購"
        icon={Ticket}
        action={
          <>
            <Button 
              variant="outline" 
              className="gap-2"
              onClick={() => setApiDocOpen(true)}
            >
              <Code className="h-4 w-4" />
              <span className="hidden sm:inline">API 文件</span>
            </Button>
            <Dialog open={open} onOpenChange={handleDialogClose}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  新增折扣碼
                </Button>
              </DialogTrigger>
          <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>新增折扣碼</DialogTitle>
              <DialogDescription>
                填寫折扣碼資訊，系統將自動生成折扣碼
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">名稱</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：春季促銷、網紅合作"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="discountType">折扣類型</Label>
                <Select
                  value={discountType}
                  onValueChange={(value) =>
                    setDiscountType(value as "percentage" | "amount")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">百分比</SelectItem>
                    <SelectItem value="amount">固定金額</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="discountValue">
                  折扣值 {discountType === "percentage" ? "(%)" : "(NT$)"}
                </Label>
                <Input
                  id="discountValue"
                  type="number"
                  min="1"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  placeholder={
                    discountType === "percentage" ? "例如：10" : "例如：500"
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="usageLimit">使用次數上限</Label>
                <Input
                  id="usageLimit"
                  type="number"
                  min="1"
                  value={usageLimit}
                  onChange={(e) => setUsageLimit(e.target.value)}
                  placeholder="例如：100"
                />
              </div>
              <div className="grid gap-2">
                <Label>生效日期</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("justify-start text-left font-normal")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(validFrom, "yyyy/MM/dd")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={validFrom}
                      onSelect={(date) => date && setValidFrom(date)}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="grid gap-2">
                <Label>到期日期（選填）</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "justify-start text-left font-normal",
                        !validUntil && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {validUntil ? format(validUntil, "yyyy/MM/dd") : "無期限"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={validUntil}
                      onSelect={setValidUntil}
                      initialFocus
                      disabled={(date) => date < validFrom}
                      className="pointer-events-auto"
                    />
                    {validUntil && (
                      <div className="p-3 border-t">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full"
                          onClick={() => setValidUntil(undefined)}
                        >
                          清除到期日期
                        </Button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
              
              <Separator className="my-2" />
              <p className="text-sm font-medium">適用條件（選填）</p>
              
              <div className="grid gap-2">
                <Label htmlFor="minOrderAmount">最低消費金額 (NT$)</Label>
                <Input
                  id="minOrderAmount"
                  type="number"
                  min="0"
                  value={minOrderAmount}
                  onChange={(e) => setMinOrderAmount(e.target.value)}
                  placeholder="例如：1000（0 表示無限制）"
                />
              </div>
              
              <div className="grid gap-2">
                <Label>適用房型（不選表示全部房型適用）</Label>
                <div className="border rounded-md p-3 max-h-40 overflow-y-auto space-y-2">
                  {roomTypes.map((room) => (
                    <div key={room.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`room-${room.id}`}
                        checked={selectedRoomTypes.includes(room.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedRoomTypes([...selectedRoomTypes, room.id]);
                          } else {
                            setSelectedRoomTypes(selectedRoomTypes.filter(id => id !== room.id));
                          }
                        }}
                      />
                      <Label htmlFor={`room-${room.id}`} className="cursor-pointer">
                        {room.name}
                      </Label>
                    </div>
                  ))}
        </div>
      </div>
              
              <div className="grid gap-2">
                <Label>適用入住日期範圍（選填）</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "justify-start text-left font-normal text-sm",
                          !applicableDateFrom && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {applicableDateFrom ? format(applicableDateFrom, "yyyy/MM/dd") : "開始日期"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={applicableDateFrom}
                        onSelect={setApplicableDateFrom}
                        initialFocus
                        className="pointer-events-auto"
                      />
                      {applicableDateFrom && (
                        <div className="p-3 border-t">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full"
                            onClick={() => setApplicableDateFrom(undefined)}
                          >
                            清除
                          </Button>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                  
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "justify-start text-left font-normal text-sm",
                          !applicableDateTo && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {applicableDateTo ? format(applicableDateTo, "yyyy/MM/dd") : "結束日期"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={applicableDateTo}
                        onSelect={setApplicableDateTo}
                        initialFocus
                        disabled={(date) => applicableDateFrom ? date < applicableDateFrom : false}
                        className="pointer-events-auto"
                      />
                      {applicableDateTo && (
                        <div className="p-3 border-t">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full"
                            onClick={() => setApplicableDateTo(undefined)}
                          >
                            清除
                          </Button>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>
            
            <Separator className="my-2" />
            <p className="text-sm font-medium">網紅佣金設定</p>
            
            <div className="grid gap-2">
              <Label htmlFor="commissionRate">佣金率 (%)</Label>
              <Input
                id="commissionRate"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={commissionRate}
                onChange={(e) => setCommissionRate(e.target.value)}
                placeholder="例如：10（表示 10%）"
              />
              <p className="text-xs text-muted-foreground">
                佣金將根據折扣金額計算，例如折扣 1000 元且佣金率 10%，則佣金為 100 元
              </p>
            </div>
            <DialogFooter>
              <Button onClick={handleSubmit}>新增</Button>
            </DialogFooter>
            </DialogContent>
          </Dialog>
          </>
        }
      />

      {/* Edit Discount Code Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>編輯折扣碼</DialogTitle>
            <DialogDescription>
              修改折扣碼資訊（折扣碼本身無法修改）
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>折扣碼（不可修改）</Label>
              <code className="px-3 py-2 bg-muted rounded text-sm font-mono">
                {editingCode?.code}
              </code>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-name">名稱</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：春季促銷、網紅合作"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-discountType">折扣類型</Label>
              <Select
                value={discountType}
                onValueChange={(value) =>
                  setDiscountType(value as "percentage" | "amount")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">百分比</SelectItem>
                  <SelectItem value="amount">固定金額</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-discountValue">
                折扣值 {discountType === "percentage" ? "(%)" : "(NT$)"}
              </Label>
              <Input
                id="edit-discountValue"
                type="number"
                min="1"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                placeholder={
                  discountType === "percentage" ? "例如：10" : "例如：500"
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-usageLimit">使用次數上限</Label>
              <Input
                id="edit-usageLimit"
                type="number"
                min="1"
                value={usageLimit}
                onChange={(e) => setUsageLimit(e.target.value)}
                placeholder="例如：100"
              />
            </div>
            <div className="grid gap-2">
              <Label>生效日期</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("justify-start text-left font-normal")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(validFrom, "yyyy/MM/dd")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={validFrom}
                    onSelect={(date) => date && setValidFrom(date)}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="grid gap-2">
              <Label>到期日期（選填）</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "justify-start text-left font-normal",
                      !validUntil && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {validUntil ? format(validUntil, "yyyy/MM/dd") : "無期限"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={validUntil}
                    onSelect={setValidUntil}
                    initialFocus
                    disabled={(date) => date < validFrom}
                    className="pointer-events-auto"
                  />
                  {validUntil && (
                    <div className="p-3 border-t">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full"
                        onClick={() => setValidUntil(undefined)}
                      >
                        清除到期日期
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>
            
            <Separator className="my-2" />
            <p className="text-sm font-medium">適用條件（選填）</p>
            
            <div className="grid gap-2">
              <Label htmlFor="edit-minOrderAmount">最低消費金額 (NT$)</Label>
              <Input
                id="edit-minOrderAmount"
                type="number"
                min="0"
                value={minOrderAmount}
                onChange={(e) => setMinOrderAmount(e.target.value)}
                placeholder="例如：1000（0 表示無限制）"
              />
            </div>
            
            <div className="grid gap-2">
              <Label>適用房型（不選表示全部房型適用）</Label>
              <div className="border rounded-md p-3 max-h-40 overflow-y-auto space-y-2">
                {roomTypes.map((room) => (
                  <div key={room.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`edit-room-${room.id}`}
                      checked={selectedRoomTypes.includes(room.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedRoomTypes([...selectedRoomTypes, room.id]);
                        } else {
                          setSelectedRoomTypes(selectedRoomTypes.filter(id => id !== room.id));
                        }
                      }}
                    />
                    <Label htmlFor={`edit-room-${room.id}`} className="cursor-pointer">
                      {room.name}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="grid gap-2">
              <Label>適用入住日期範圍（選填）</Label>
              <div className="grid grid-cols-2 gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "justify-start text-left font-normal text-sm",
                        !applicableDateFrom && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {applicableDateFrom ? format(applicableDateFrom, "yyyy/MM/dd") : "開始日期"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={applicableDateFrom}
                      onSelect={setApplicableDateFrom}
                      initialFocus
                      className="pointer-events-auto"
                    />
                    {applicableDateFrom && (
                      <div className="p-3 border-t">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full"
                          onClick={() => setApplicableDateFrom(undefined)}
                        >
                          清除
                        </Button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
                
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "justify-start text-left font-normal text-sm",
                        !applicableDateTo && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {applicableDateTo ? format(applicableDateTo, "yyyy/MM/dd") : "結束日期"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={applicableDateTo}
                      onSelect={setApplicableDateTo}
                      initialFocus
                      disabled={(date) => applicableDateFrom ? date < applicableDateFrom : false}
                      className="pointer-events-auto"
                    />
                    {applicableDateTo && (
                      <div className="p-3 border-t">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full"
                          onClick={() => setApplicableDateTo(undefined)}
                        >
                          清除
                        </Button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
          
          <Separator className="my-2" />
          <p className="text-sm font-medium">網紅佣金設定</p>
          
          <div className="grid gap-2">
            <Label htmlFor="edit-commissionRate">佣金率 (%)</Label>
            <Input
              id="edit-commissionRate"
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={commissionRate}
              onChange={(e) => setCommissionRate(e.target.value)}
              placeholder="例如：10（表示 10%）"
            />
            <p className="text-xs text-muted-foreground">
              佣金將根據折扣金額計算，例如折扣 1000 元且佣金率 10%，則佣金為 100 元
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              取消
            </Button>
            <Button onClick={handleUpdateCode}>更新</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Filter Buttons */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={filterStatus === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterStatus("all")}
            className="h-9"
          >
            全部
            <Badge variant="secondary" className="ml-2 bg-muted">
              {discountCodes.length}
            </Badge>
          </Button>
          <Button
            variant={filterStatus === "active" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterStatus("active")}
            className="h-9"
          >
            進行中
            <Badge variant="secondary" className="ml-2 bg-muted">
              {discountCodes.filter(code => getCodeStatus(code) === "active").length}
            </Badge>
          </Button>
          <Button
            variant={filterStatus === "expired" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterStatus("expired")}
            className="h-9"
          >
            已到期
            <Badge variant="secondary" className="ml-2 bg-muted">
              {discountCodes.filter(code => getCodeStatus(code) === "expired").length}
            </Badge>
          </Button>
          <Button
            variant={filterStatus === "full" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterStatus("full")}
            className="h-9"
          >
            已額滿
            <Badge variant="secondary" className="ml-2 bg-muted">
              {discountCodes.filter(code => getCodeStatus(code) === "full").length}
            </Badge>
          </Button>
        </div>
      </Card>

      <Card>
        <CardContent className="p-0">
          {/* Desktop table view */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>名稱</TableHead>
                  <TableHead>折扣碼</TableHead>
                  <TableHead>推薦連結</TableHead>
                  <TableHead>折扣</TableHead>
                  <TableHead>已使用</TableHead>
                  <TableHead>使用上限</TableHead>
                  <TableHead>有效期</TableHead>
                  <TableHead>狀態</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCodes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-64 text-center align-middle"></TableCell>
                  </TableRow>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={filteredCodes.map(code => code.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {filteredCodes.map((item) => (
                        <SortableRow key={item.id} item={item} />
                      ))}
                    </SortableContext>
                  </DndContext>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile card view */}
          <div className="md:hidden space-y-4 p-4">
            {filteredCodes.length === 0 ? (
              <div className="h-64"></div>
            ) : (
              filteredCodes.map((item) => (
                <Card key={item.id} className="overflow-hidden">
                  <CardContent className="p-4">
                    {/* Header: Name and Status */}
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <h3 className="font-semibold text-base leading-tight flex-1">{item.name}</h3>
                      {getStatusBadge(item)}
                    </div>

                    {/* Discount Code Section */}
                    <div className="mb-4 p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs font-medium text-muted-foreground mb-2">折扣碼</p>
                      <div className="flex items-center gap-2">
                        <code className="px-3 py-1.5 bg-background rounded-md text-sm font-mono font-semibold flex-1">
                          {item.code}
                        </code>
                        <Button
                          variant="outline"
                          size="sm"
                          className={cn(
                            "h-8 shrink-0 transition-all",
                            copiedCode === item.code && "bg-success/10 text-success border-success/20"
                          )}
                          onClick={() => handleCopyCodeText(item.code)}
                        >
                          {copiedCode === item.code ? (
                            <>
                              <Check className="h-3.5 w-3.5 mr-1 animate-scale-in" />
                              已複製
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5 mr-1" />
                              複製
                            </>
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Referral Link Section */}
                    <div className="mb-4">
                      <p className="text-xs font-medium text-muted-foreground mb-2">推薦連結</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          "w-full gap-1.5 transition-all",
                          copiedLink === item.code && "bg-success/10 text-success border-success/20"
                        )}
                        onClick={() => handleCopyReferralLink(item.code)}
                      >
                        {copiedLink === item.code ? (
                          <>
                            已複製推薦連結
                            <Check className="h-3.5 w-3.5 animate-scale-in" />
                          </>
                        ) : (
                          <>
                            複製推薦連結
                            <Copy className="h-3.5 w-3.5" />
                          </>
                        )}
                      </Button>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="p-3 bg-muted/30 rounded-lg">
                        <p className="text-xs font-medium text-muted-foreground mb-1">折扣金額</p>
                        <p className="text-sm font-semibold">{formatDiscount(item.discount_type, item.discount_value)}</p>
                      </div>
                      <div className="p-3 bg-muted/30 rounded-lg">
                        <p className="text-xs font-medium text-muted-foreground mb-1">使用情況</p>
                        <p className="text-sm font-semibold">{item.used_count} / {item.usage_limit}</p>
                      </div>
                    </div>

                    {/* Validity Period */}
                    <div className="mb-4">
                      <p className="text-xs font-medium text-muted-foreground mb-1">有效期限</p>
                      <p className="text-sm">
                        {format(new Date(item.valid_from), "yyyy/MM/dd")}
                        {item.valid_until && ` - ${format(new Date(item.valid_until), "yyyy/MM/dd")}`}
                        {!item.valid_until && " - 無期限"}
                      </p>
                    </div>

                    {/* Usage Limit Display */}
                    <div className="mb-4 pb-4 border-b">
                      <p className="text-xs font-medium text-muted-foreground mb-2">使用上限</p>
                      <p className="text-sm font-medium">{item.usage_limit} 次</p>
                    </div>

                    {/* Action Buttons - Two Rows */}
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 text-xs"
                          onClick={() => {
                            setSelectedCodeForCommission(item);
                            setIntegratedDetailsOpen(true);
                          }}
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" />
                          查看詳情
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 text-xs"
                          onClick={() => handleOpenEdit(item)}
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1" />
                          編輯
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant={item.is_active ? "outline" : "default"}
                          size="sm"
                          className="h-9 text-xs"
                          onClick={() => toggleActive(item.id, item.is_active)}
                        >
                          {item.is_active ? (
                            <>
                              <Pause className="h-3.5 w-3.5 mr-1" />
                              停用
                            </>
                          ) : (
                            <>
                              <Check className="h-3.5 w-3.5 mr-1" />
                              啟用
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 text-xs group"
                          onClick={() => handleDelete(item.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1 text-destructive group-hover:text-white transition-colors" />
                          <span className="text-destructive group-hover:text-white transition-colors">刪除</span>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* API Documentation Dialog */}
      <Dialog open={apiDocOpen} onOpenChange={setApiDocOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>網紅 API 使用說明</DialogTitle>
            <DialogDescription>
              透過以下 API 端點，網紅可以在自己的網站查詢訂單和佣金數據
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Base URL */}
            <div>
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <Code className="h-4 w-4" />
                API Base URL
              </h3>
              <code className="block p-3 bg-muted rounded text-sm font-mono break-all">
                https://sensaninn.lakeze.com/functions/v1/kol-api
              </code>
            </div>

            <Separator />

            {/* Endpoint 1: Query Orders */}
            <div>
              <h3 className="font-semibold mb-2">1. 查詢訂單列表</h3>
              <div className="space-y-2">
                <div>
                  <Label className="text-xs text-muted-foreground">端點</Label>
                  <code className="block p-2 bg-muted rounded text-sm font-mono">
                    GET /orders?code=YOUR_DISCOUNT_CODE
                  </code>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">範例請求</Label>
                  <pre className="p-3 bg-muted rounded text-xs font-mono overflow-x-auto">
{`fetch('https://sensaninn.lakeze.com/functions/v1/kol-api/orders?code=SPRING2024')
  .then(res => res.json())
  .then(data => console.log(data));`}
                  </pre>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">回應範例</Label>
                  <pre className="p-3 bg-muted rounded text-xs font-mono overflow-x-auto">
{`{
  "success": true,
  "discount_code": "SPRING2024",
  "orders": [
    {
      "id": "...",
      "order_number": "20240115001",
      "order_date": "2024-01-15T10:30:00",
      "check_in_date": "2024-02-01",
      "check_out_date": "2024-02-03",
      "guest_name": "王小明",
      "guest_count": 2,
      "order_status": "confirmed",
      "payment_status": "paid",
      "total_price": 5000,
      "discount_amount": 500,
      "final_price": 4500,
      "paid_amount": 4500,
      "room_types": {
        "name": "標準雙人房"
      }
    }
  ]
}`}
                  </pre>
                </div>
              </div>
            </div>

            <Separator />

            {/* Endpoint 2: Query Statistics */}
            <div>
              <h3 className="font-semibold mb-2">2. 查詢統計數據</h3>
              <div className="space-y-2">
                <div>
                  <Label className="text-xs text-muted-foreground">端點</Label>
                  <code className="block p-2 bg-muted rounded text-sm font-mono">
                    GET /stats?code=YOUR_DISCOUNT_CODE
                  </code>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">範例請求</Label>
                  <pre className="p-3 bg-muted rounded text-xs font-mono overflow-x-auto">
{`fetch('https://sensaninn.lakeze.com/functions/v1/kol-api/stats?code=SPRING2024')
  .then(res => res.json())
  .then(data => console.log(data));`}
                  </pre>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">回應範例</Label>
                  <pre className="p-3 bg-muted rounded text-xs font-mono overflow-x-auto">
{`{
  "success": true,
  "discount_code": "SPRING2024",
  "discount_info": {
    "name": "春季促銷",
    "discount_type": "percentage",
    "discount_value": 10,
    "used_count": 25,
    "usage_limit": 100,
    "is_active": true
  },
  "statistics": {
    "total_orders": 25,
    "confirmed_orders": 23,
    "total_revenue": 115000,
    "total_discount": 11500,
    "estimated_commission": 1150,
    "commission_rate": 0.1
  }
}`}
                  </pre>
                </div>
              </div>
            </div>

            <Separator />

            {/* Endpoint 3: Query Commission */}
            <div>
              <h3 className="font-semibold mb-2">3. 查詢佣金記錄</h3>
              <div className="space-y-2">
                <div>
                  <Label className="text-xs text-muted-foreground">端點</Label>
                  <code className="block p-2 bg-muted rounded text-sm font-mono">
                    GET /commission?code=YOUR_DISCOUNT_CODE
                  </code>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">範例請求</Label>
                  <pre className="p-3 bg-muted rounded text-xs font-mono overflow-x-auto">
{`fetch('https://sensaninn.lakeze.com/functions/v1/kol-api/commission?code=SPRING2024')
  .then(res => res.json())
  .then(data => console.log(data));`}
                  </pre>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">回應範例</Label>
                  <pre className="p-3 bg-muted rounded text-xs font-mono overflow-x-auto">
{`{
  "success": true,
  "discount_code": "SPRING2024",
  "commission_statistics": {
    "total_records": 23,
    "total_commission": 1150,
    "pending_commission": 230,
    "approved_commission": 460,
    "paid_commission": 460,
    "commission_rate": 10
  },
  "commission_records": [
    {
      "id": "...",
      "order_number": "20240115001",
      "guest_name": "王小明",
      "check_in_date": "2024-02-01",
      "order_status": "confirmed",
      "order_total": 5000,
      "discount_amount": 500,
      "commission_rate": 10,
      "commission_amount": 50,
      "settlement_status": "paid",
      "settlement_date": "2024-01-20T10:00:00Z",
      "payment_date": "2024-01-25T15:30:00Z",
      "created_at": "2024-01-15T14:30:00Z"
    }
  ]
}`}
                  </pre>
                </div>
              </div>
            </div>

            <Separator />

            {/* Error Handling */}
            <div>
              <h3 className="font-semibold mb-2">錯誤處理</h3>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">完整錯誤處理範例（JavaScript）</Label>
                  <pre className="p-3 bg-muted rounded text-xs font-mono overflow-x-auto">
{`async function getOrderData(discountCode) {
  try {
    const response = await fetch(
      \`https://sensaninn.lakeze.com/functions/v1/kol-api/orders?code=\${discountCode}\`
    );
    
    if (!response.ok) {
      throw new Error(\`HTTP error! status: \${response.status}\`);
    }
    
    const data = await response.json();
    
    if (!data.success) {
      console.error('API 錯誤:', data.error);
      return null;
    }
    
    return data.orders;
  } catch (error) {
    console.error('請求失敗:', error);
    // 顯示友善的錯誤訊息給用戶
    alert('無法載入訂單資料，請稍後再試');
    return null;
  }
}`}
                  </pre>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">錯誤回應格式</Label>
                  <pre className="p-3 bg-muted rounded text-xs font-mono overflow-x-auto">
{`{
  "success": false,
  "error": "折扣碼無效或已停用"
}`}
                  </pre>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">常見錯誤碼</Label>
                  <div className="space-y-2 text-xs text-muted-foreground">
                    <div className="p-2 bg-muted rounded">
                      <strong>400 Bad Request</strong> - 缺少必要參數（code）
                    </div>
                    <div className="p-2 bg-muted rounded">
                      <strong>404 Not Found</strong> - 折扣碼不存在
                    </div>
                    <div className="p-2 bg-muted rounded">
                      <strong>500 Internal Server Error</strong> - 伺服器錯誤，請稍後重試
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* More Examples */}
            <div>
              <h3 className="font-semibold mb-2">其他程式語言範例</h3>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Python 範例</Label>
                  <pre className="p-3 bg-muted rounded text-xs font-mono overflow-x-auto">
{`import requests

def get_stats(discount_code):
    url = f"https://sensaninn.lakeze.com/functions/v1/kol-api/stats"
    params = {"code": discount_code}
    
    try:
        response = requests.get(url, params=params)
        response.raise_for_status()
        data = response.json()
        
        if data.get("success"):
            return data.get("statistics")
        else:
            print(f"錯誤: {data.get('error')}")
            return None
    except requests.exceptions.RequestException as e:
        print(f"請求失敗: {e}")
        return None`}
                  </pre>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">PHP 範例</Label>
                  <pre className="p-3 bg-muted rounded text-xs font-mono overflow-x-auto">
{`<?php
function getCommissionData($discountCode) {
    $url = "https://sensaninn.lakeze.com/functions/v1/kol-api/commission";
    $url .= "?code=" . urlencode($discountCode);
    
    $response = file_get_contents($url);
    if ($response === false) {
        return null;
    }
    
    $data = json_decode($response, true);
    
    if ($data['success']) {
        return $data['commission_records'];
    } else {
        error_log("API 錯誤: " . $data['error']);
        return null;
    }
}
?>`}
                  </pre>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">jQuery 範例</Label>
                  <pre className="p-3 bg-muted rounded text-xs font-mono overflow-x-auto">
{`$.ajax({
  url: 'https://sensaninn.lakeze.com/functions/v1/kol-api/stats',
  method: 'GET',
  data: { code: 'SPRING2024' },
  success: function(data) {
    if (data.success) {
      console.log('統計數據:', data.statistics);
      // 更新頁面內容
      $('#total-orders').text(data.statistics.total_orders);
      $('#total-revenue').text('NT$ ' + data.statistics.total_revenue);
    } else {
      console.error('錯誤:', data.error);
    }
  },
  error: function(xhr, status, error) {
    console.error('請求失敗:', error);
    alert('無法載入數據，請稍後再試');
  }
});`}
                  </pre>
                </div>
              </div>
            </div>

            <Separator />

            {/* Best Practices */}
            <div>
              <h3 className="font-semibold mb-2">最佳實踐建議</h3>
              <div className="space-y-2 text-sm">
                <div className="p-3 bg-muted rounded">
                  <strong className="text-foreground">1. 實作快取機制</strong>
                  <p className="text-xs text-muted-foreground mt-1">
                    建議快取統計數據 5-10 分鐘，減少伺服器負擔並提升頁面載入速度
                  </p>
                  <pre className="mt-2 p-2 bg-background rounded text-xs font-mono overflow-x-auto">
{`// 使用 localStorage 快取
const CACHE_KEY = 'kol_stats_cache';
const CACHE_DURATION = 5 * 60 * 1000; // 5 分鐘

function getCachedStats(code) {
  const cached = localStorage.getItem(CACHE_KEY + code);
  if (cached) {
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp < CACHE_DURATION) {
      return data;
    }
  }
  return null;
}

function setCachedStats(code, data) {
  localStorage.setItem(CACHE_KEY + code, JSON.stringify({
    data: data,
    timestamp: Date.now()
  }));
}`}
                  </pre>
                </div>

                <div className="p-3 bg-muted rounded">
                  <strong className="text-foreground">2. 友善的錯誤提示</strong>
                  <p className="text-xs text-muted-foreground mt-1">
                    向用戶顯示清楚的錯誤訊息，而不是技術性的錯誤代碼
                  </p>
                </div>

                <div className="p-3 bg-muted rounded">
                  <strong className="text-foreground">3. 載入狀態指示</strong>
                  <p className="text-xs text-muted-foreground mt-1">
                    在請求期間顯示載入動畫，提升用戶體驗
                  </p>
                </div>

                <div className="p-3 bg-muted rounded">
                  <strong className="text-foreground">4. 定期重試機制</strong>
                  <p className="text-xs text-muted-foreground mt-1">
                    網路暫時失敗時，自動重試 2-3 次後再顯示錯誤
                  </p>
                </div>

                <div className="p-3 bg-muted rounded">
                  <strong className="text-foreground">5. 資料驗證</strong>
                  <p className="text-xs text-muted-foreground mt-1">
                    檢查 API 回應的資料結構是否正確，避免程式錯誤
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Notes */}
            <div className="space-y-2">
              <h3 className="font-semibold">注意事項</h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                <li>API 端點不需要身份驗證，但需要提供有效的折扣碼</li>
                <li>回應格式為 JSON</li>
                <li>佣金根據折扣碼設定的佣金率自動計算</li>
                <li>結算狀態：pending（待結算）、approved（已核准）、paid（已付款）、cancelled（已取消）</li>
                <li>建議在外部網站實作快取機制，避免頻繁請求</li>
                <li>API 支援 CORS，可直接從瀏覽器調用</li>
                <li>請妥善保管您的折扣碼，避免洩露給非授權人員</li>
                <li>API 回應時間通常在 100-500ms 之間</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setApiDocOpen(false)}>關閉</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Integrated Details Dialog */}
      {selectedCodeForCommission && (
        <IntegratedCodeDetailsDialog
          open={integratedDetailsOpen}
          onOpenChange={setIntegratedDetailsOpen}
          discountCodeId={selectedCodeForCommission.id}
          discountCodeName={selectedCodeForCommission.name}
          discountCode={selectedCodeForCommission.code}
          accommodationId={accommodationId || ''}
        />
      )}
    </div>
  );
};

export default KolDiscount;
