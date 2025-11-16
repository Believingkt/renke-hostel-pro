import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
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
import { Plus, Trash2, Copy, Pencil, Check, X, Eye, Calendar as CalendarIcon } from "lucide-react";
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
  const [editingLimitId, setEditingLimitId] = useState<string | null>(null);
  const [editingLimitValue, setEditingLimitValue] = useState("");
  const [discountCodes, setDiscountCodes] = useState<DiscountCode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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
    if (!name || !discountValue || !usageLimit || !accommodationId) {
      toast({
        title: "請填寫所有欄位",
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

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({
      title: "已複製折扣碼",
      description: code,
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
    setEditOpen(true);
  };

  const handleUpdateCode = async () => {
    if (!name || !discountValue || !usageLimit || !editingCode) {
      toast({
        title: "請填寫所有欄位",
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

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl md:text-3xl font-bold">折扣代碼管理</h1>
        </div>
        <TableSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-bold">折扣代碼管理</h1>
        <Dialog open={open} onOpenChange={setOpen}>
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
            <DialogFooter>
              <Button onClick={handleSubmit}>新增</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

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
                  <TableHead>名稱</TableHead>
                  <TableHead>折扣碼</TableHead>
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
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      尚無折扣碼
                    </TableCell>
                  </TableRow>
                ) : (
                  discountCodes.map((item) => (
                    <TableRow key={item.id}>
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
                            onClick={() => handleCopyCode(item.code)}
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
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile card view */}
          <div className="md:hidden space-y-3 p-4">
            {discountCodes.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                尚無折扣碼
              </p>
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
                              onClick={() => handleCopyCode(item.code)}
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
    </div>
  );
};

export default KolDiscount;
