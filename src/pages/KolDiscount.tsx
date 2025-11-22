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
import { Plus, Trash2, Copy, Pencil, Check, X, Eye, Calendar as CalendarIcon, GripVertical, Files, Code, DollarSign, Ticket, Tag } from "lucide-react";
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
  const [copyingFrom, setCopyingFrom] = useState<DiscountCode | null>(null);
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
  const [editingLimitId, setEditingLimitId] = useState<string | null>(null);
  const [editingLimitValue, setEditingLimitValue] = useState("");
  const [discountCodes, setDiscountCodes] = useState<DiscountCode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [apiDocOpen, setApiDocOpen] = useState(false);
  const [commissionRate, setCommissionRate] = useState("");
  const [commissionRecordsOpen, setCommissionRecordsOpen] = useState(false);
  const [selectedCodeForCommission, setSelectedCodeForCommission] = useState<DiscountCode | null>(null);
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
        description: "無法載入折扣代碼列表",
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
        description: "無法新增折扣代碼",
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
    toast({
      title: "已複製折扣碼",
      description: code,
    });
  };

  const handleCopyReferralLink = (code: string) => {
    const referralLink = `${window.location.origin}/booking?ref=${code}`;
    navigator.clipboard.writeText(referralLink);
    toast({
      title: "已複製推薦連結",
      description: "推薦連結已複製到剪貼簿",
    });
  };

  const formatDiscount = (type: "percentage" | "amount", value: number) => {
    return type === "percentage" ? `${value}%` : `NT$ ${value}`;
  };

  const handleEditLimit = (id: string, currentLimit: number) => {
    setEditingLimitId(id);
    setEditingLimitValue(currentLimit.toString());
  };

  const handleSaveLimit = async (id: string) => {
    const newLimit = parseInt(editingLimitValue);
    if (isNaN(newLimit) || newLimit < 1) {
      toast({
        title: "請輸入有效的數字",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from("discount_codes")
        .update({ usage_limit: newLimit })
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "使用次數已更新",
      });
      setEditingLimitId(null);
      fetchDiscountCodes();
    } catch (error) {
      console.error("Error updating usage limit:", error);
      toast({
        title: "更新失敗",
        variant: "destructive",
      });
    }
  };

  const handleCancelEdit = () => {
    setEditingLimitId(null);
    setEditingLimitValue("");
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
        description: "無法更新折扣代碼",
        variant: "destructive",
      });
    }
  };

  const handleCopyCode = (code: DiscountCode) => {
    setCopyingFrom(code);
    setName(`${code.name} (副本)`);
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
    setOpen(true);
  };

  const handleDialogClose = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      // 清除複製狀態和表單
      setCopyingFrom(null);
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

  const getStatusBadge = (code: DiscountCode) => {
    if (!code.is_active) {
      return <Badge variant="secondary">已停用</Badge>;
    }
    
    const now = new Date();
    const validFrom = new Date(code.valid_from);
    const validUntil = code.valid_until ? new Date(code.valid_until) : null;

    if (now < validFrom) {
      return <Badge variant="secondary">未生效</Badge>;
    }
    
    if (validUntil && now > validUntil) {
      return <Badge variant="destructive">已過期</Badge>;
    }
    
    if (code.used_count >= code.usage_limit) {
      return <Badge variant="destructive">已達上限</Badge>;
    }

    return <Badge variant="default" className="bg-green-600">有效</Badge>;
  };

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
              className="h-8 w-8"
              onClick={() => handleCopyCodeText(item.code)}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2 max-w-xs">
            <code className="px-2 py-1 bg-muted rounded text-xs font-mono truncate flex-1">
              {`${window.location.origin}/booking?ref=${item.code}`}
            </code>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => handleCopyReferralLink(item.code)}
              title="複製推薦連結"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </TableCell>
        <TableCell>
          {formatDiscount(item.discount_type, item.discount_value)}
        </TableCell>
        <TableCell>{item.used_count} 次</TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            {editingLimitId === item.id ? (
              <>
                <Input
                  type="number"
                  min="1"
                  value={editingLimitValue}
                  onChange={(e) => setEditingLimitValue(e.target.value)}
                  className="w-20 h-8"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handleSaveLimit(item.id)}
                >
                  <Check className="h-4 w-4 text-success" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleCancelEdit}
                >
                  <X className="h-4 w-4 text-destructive" />
                </Button>
              </>
            ) : (
              <>
                <span>{item.usage_limit} 次</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handleEditLimit(item.id, item.usage_limit)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
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
              onClick={() => handleCopyCode(item)}
              title="複製"
            >
              <Files className="h-4 w-4" />
            </Button>
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
              onClick={() => navigate(`/admin/discount-codes/${item.code}/orders`)}
              title="查看訂單"
            >
              <Eye className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                setSelectedCodeForCommission(item);
                setCommissionRecordsOpen(true);
              }}
              title="查看佣金"
            >
              <DollarSign className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => toggleActive(item.id, item.is_active)}
              title={item.is_active ? "停用" : "啟用"}
            >
              {item.is_active ? (
                <X className="h-4 w-4 text-orange-500" />
              ) : (
                <Check className="h-4 w-4 text-green-600" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleDelete(item.id)}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="折扣代碼" icon={Ticket} />
        <TableSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="折扣代碼"
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
              <DialogTitle>{copyingFrom ? "複製折扣碼" : "新增折扣碼"}</DialogTitle>
              <DialogDescription>
                {copyingFrom 
                  ? `複製自：${copyingFrom.code}，系統將自動生成新的折扣碼`
                  : "填寫折扣碼資訊，系統將自動生成折扣碼"
                }
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
                {discountCodes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="p-0">
                      <EmptyState
                        icon={Tag}
                        title="尚無折扣碼"
                        description="建立專屬折扣碼，追蹤推廣成效與佣金"
                        action={{
                          label: "新增第一個折扣碼",
                          onClick: () => setOpen(true)
                        }}
                        className="border-0 shadow-none"
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={discountCodes.map(code => code.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {discountCodes.map((item) => (
                        <SortableRow key={item.id} item={item} />
                      ))}
                    </SortableContext>
                  </DndContext>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile card view */}
          <div className="md:hidden space-y-3 p-4">
            {discountCodes.length === 0 ? (
              <EmptyState
                icon={Tag}
                title="尚無折扣碼"
                description="建立專屬折扣碼，追蹤推廣成效與佣金"
                action={{
                  label: "新增第一個折扣碼",
                  onClick: () => setOpen(true)
                }}
              />
            ) : (
              discountCodes.map((item) => (
                <Card key={item.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 space-y-2 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium">{item.name}</p>
                          {getStatusBadge(item)}
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">折扣碼</p>
                          <div className="flex items-center gap-2">
                            <code className="px-2 py-1 bg-muted rounded text-sm font-mono">
                              {item.code}
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleCopyCodeText(item.code)}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">推薦連結</p>
                          <div className="flex items-center gap-2">
                            <code className="px-2 py-1 bg-muted rounded text-xs font-mono truncate flex-1">
                              {`${window.location.origin}/booking?ref=${item.code}`}
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0"
                              onClick={() => handleCopyReferralLink(item.code)}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">折扣</p>
                            <p>{formatDiscount(item.discount_type, item.discount_value)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">已使用</p>
                            <p>{item.used_count} / {item.usage_limit}</p>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">有效期</p>
                          <p className="text-sm">
                            {format(new Date(item.valid_from), "yyyy/MM/dd")}
                            {item.valid_until && ` - ${format(new Date(item.valid_until), "yyyy/MM/dd")}`}
                            {!item.valid_until && " - 無期限"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">使用上限</p>
                          <div className="flex items-center gap-2">
                            {editingLimitId === item.id ? (
                              <>
                                <Input
                                  type="number"
                                  min="1"
                                  value={editingLimitValue}
                                  onChange={(e) => setEditingLimitValue(e.target.value)}
                                  className="w-20 h-8"
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleSaveLimit(item.id)}
                                >
                                  <Check className="h-4 w-4 text-success" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={handleCancelEdit}
                                >
                                  <X className="h-4 w-4 text-destructive" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <p className="text-sm">{item.usage_limit} 次</p>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleEditLimit(item.id, item.usage_limit)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0 h-8 w-8"
                          onClick={() => handleCopyCode(item)}
                          title="複製"
                        >
                          <Files className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0 h-8 w-8"
                          onClick={() => handleOpenEdit(item)}
                          title="編輯"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0 h-8 w-8"
                          onClick={() => navigate(`/admin/discount-codes/${item.code}/orders`)}
                          title="查看訂單"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0 h-8 w-8"
                          onClick={() => {
                            setSelectedCodeForCommission(item);
                            setCommissionRecordsOpen(true);
                          }}
                          title="查看佣金"
                        >
                          <DollarSign className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0 h-8 w-8"
                          onClick={() => toggleActive(item.id, item.is_active)}
                          title={item.is_active ? "停用" : "啟用"}
                        >
                          {item.is_active ? (
                            <X className="h-4 w-4 text-orange-500" />
                          ) : (
                            <Check className="h-4 w-4 text-green-600" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0"
                          onClick={() => handleDelete(item.id)}
                        >
                          <Trash2 className="h-5 w-5 text-destructive" />
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
                {window.location.origin.replace(/^https?:\/\//, 'https://')}/functions/v1/kol-api
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
{`fetch('${window.location.origin.replace(/^https?:\/\//, 'https://')}/functions/v1/kol-api/orders?code=SPRING2024')
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
{`fetch('${window.location.origin.replace(/^https?:\/\//, 'https://')}/functions/v1/kol-api/stats?code=SPRING2024')
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
{`fetch('${window.location.origin.replace(/^https?:\/\//, 'https://')}/functions/v1/kol-api/commission?code=SPRING2024')
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
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setApiDocOpen(false)}>關閉</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Commission Records Dialog */}
      {selectedCodeForCommission && (
        <CommissionRecordsDialog
          open={commissionRecordsOpen}
          onOpenChange={setCommissionRecordsOpen}
          discountCodeId={selectedCodeForCommission.id}
          discountCodeName={selectedCodeForCommission.name}
          discountCode={selectedCodeForCommission.code}
        />
      )}
    </div>
  );
};

export default KolDiscount;
