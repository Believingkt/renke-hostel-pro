import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
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
import { Plus, Trash2, Copy, Pencil, Check, Pause, X, Eye, Calendar as CalendarIcon, GripVertical, Code, DollarSign, Ticket, Tag, Megaphone, BadgePercent, Sparkles, Home, Key, RefreshCw, Shield } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { TableSkeleton } from "@/components/skeletons/TableSkeleton";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import type { Json } from "@/integrations/supabase/types";
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
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";


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

interface DiscountCodeSecrets {
  api_key: string | null;
  webhook_url: string | null;
  webhook_secret: string | null;
}

const KolDiscount = () => {
  const navigate = useNavigate();
  const { currentAccommodationId: accommodationId } = useAccommodation();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<DiscountCode | null>(null);
  const [name, setName] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [discountType, setDiscountType] = useState<"percentage" | "amount">("percentage");
  const [discountValue, setDiscountValue] = useState("");
  const [usageLimit, setUsageLimit] = useState("");
  const [validFrom, setValidFrom] = useState<Date>(new Date());
  const [validUntil, setValidUntil] = useState<Date | undefined>();
  const [minOrderAmount, setMinOrderAmount] = useState("");
  const [selectedRoomTypes, setSelectedRoomTypes] = useState<string[]>([]);
  const [applicableRoomTypes, setApplicableRoomTypes] = useState<string[]>([]);
  const [enableDateRange, setEnableDateRange] = useState(false);
  const [applicableDateFrom, setApplicableDateFrom] = useState<Date | undefined>();
  const [applicableDateTo, setApplicableDateTo] = useState<Date | undefined>();
  const [roomTypes, setRoomTypes] = useState<Array<{ id: string; name: string }>>([]);
  const [discountCodes, setDiscountCodes] = useState<DiscountCode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [apiDocOpen, setApiDocOpen] = useState(false);
  const [commissionRate, setCommissionRate] = useState("");
  
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "expired" | "full">("all");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [copiedApiKey, setCopiedApiKey] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [regeneratingApiKeyId, setRegeneratingApiKeyId] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState<string | null>(null);
  const [webhookEnabled, setWebhookEnabled] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [editingCodeSecrets, setEditingCodeSecrets] = useState<DiscountCodeSecrets | null>(null);
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
      // Fetch discount codes WITHOUT sensitive fields (api_key, webhook_url, webhook_secret)
      const { data, error } = await supabase
        .from("discount_codes")
        .select(`
          id, accommodation_id, name, code, discount_type, discount_value,
          usage_limit, used_count, valid_from, valid_until, is_active,
          min_order_amount, applicable_room_types, applicable_date_from,
          applicable_date_to, display_order, commission_rate,
          created_at, updated_at
        `)
        .eq("accommodation_id", accommodationId)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: false });

      if (error) throw error;
      const codes = (data || []) as DiscountCode[];
      setDiscountCodes(codes);
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

  const generateApiKey = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let apiKey = "kol_";
    for (let i = 0; i < 32; i++) {
      apiKey += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return apiKey;
  };

  const handleRegenerateApiKey = async (discountCodeId: string) => {
    setRegeneratingApiKeyId(discountCodeId);
    try {
      const { generateApiKey: genKey } = await import("@/utils/hashSecret");
      const { plaintext, hash, prefix } = await genKey("kol_");
      const { error } = await supabase
        .from("discount_code_secrets")
        .update({ api_key_hash: hash, api_key_prefix: prefix, updated_at: new Date().toISOString() })
        .eq("discount_code_id", discountCodeId);

      if (error) throw error;

      try { await navigator.clipboard.writeText(plaintext); } catch {}
      toast({
        title: "API 金鑰已重新產生並複製",
        description: `新金鑰：${plaintext}（僅顯示一次，已複製到剪貼簿）`,
      });
      fetchDiscountCodes();
    } catch (error) {
      console.error("Error regenerating API key:", error);
      toast({
        title: "重新產生失敗",
        description: "無法重新產生 API 金鑰",
        variant: "destructive",
      });
    } finally {
      setRegeneratingApiKeyId(null);
    }
  };

  const handleCopyApiKey = (apiKey: string, codeId: string) => {
    navigator.clipboard.writeText(apiKey);
    setCopiedApiKey(codeId);
    setTimeout(() => setCopiedApiKey(null), 2000);
    toast({
      title: "已複製 API 金鑰",
    });
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

    const code = customCode.trim().toUpperCase() || generateCode();
    const { generateApiKey: genKey } = await import("@/utils/hashSecret");
    const { plaintext: apiKey, hash: apiKeyHash, prefix: apiKeyPrefix } = await genKey("kol_");

    try {
      // Insert discount code WITHOUT sensitive fields
      const { data: newCode, error } = await supabase.from("discount_codes").insert({
        accommodation_id: accommodationId,
        name,
        code,
        discount_type: discountType,
        discount_value: parseFloat(discountValue),
        usage_limit: parseInt(usageLimit),
        valid_from: validFrom.toISOString(),
        valid_until: validUntil?.toISOString() || null,
        min_order_amount: minOrderAmount ? parseInt(minOrderAmount) : 0,
        applicable_room_types: applicableRoomTypes,
        applicable_date_from: applicableDateFrom?.toISOString().split('T')[0] || null,
        applicable_date_to: applicableDateTo?.toISOString().split('T')[0] || null,
        commission_rate: commissionRate ? parseFloat(commissionRate) : 0,
      }).select("id").single();

      if (error) throw error;

      // Insert API key hash into the secure secrets table
      if (newCode) {
        const { error: secretsError } = await supabase
          .from("discount_code_secrets")
          .update({ api_key_hash: apiKeyHash, api_key_prefix: apiKeyPrefix, updated_at: new Date().toISOString() })
          .eq("discount_code_id", newCode.id);
        
        if (secretsError) {
          console.error("Error updating secrets:", secretsError);
        }
      }

      try { await navigator.clipboard.writeText(apiKey); } catch {}
      toast({
        title: "折扣碼新增成功",
        description: `折扣碼：${code}．API 金鑰：${apiKey}（僅顯示一次，已複製）`,
      });

      setOpen(false);
      setName("");
      setCustomCode("");
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

  const handleDeleteClick = (id: string) => {
    setDeletingId(id);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingId) return;

    try {
      const { error } = await supabase
        .from("discount_codes")
        .delete()
        .eq("id", deletingId);

      if (error) throw error;

      toast({
        title: "刪除成功",
        description: "網紅導購已刪除",
      });
      fetchDiscountCodes();
    } catch (error) {
      console.error("Error deleting discount code:", error);
      toast({
        title: "刪除失敗",
        description: "無法刪除網紅導購",
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setDeletingId(null);
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
    const referralLink = `https://sensaninn.lakeze.com/book?ref=${code}`;
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

  const handleOpenEdit = async (code: DiscountCode) => {
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
    
    // Fetch secrets from the secure table
    try {
      const { data: secrets, error } = await supabase
        .from("discount_code_secrets")
        .select("webhook_url, webhook_secret")
        .eq("discount_code_id", code.id)
        .single();
      
      if (!error && secrets) {
        setWebhookUrl(secrets.webhook_url || "");
        setWebhookSecret(secrets.webhook_secret);
        setEditingCodeSecrets({ ...secrets, api_key: null } as unknown as DiscountCodeSecrets);
      } else {
        setWebhookUrl("");
        setWebhookSecret(null);
        setEditingCodeSecrets(null);
      }
    } catch (error) {
      console.error("Error fetching secrets:", error);
      setWebhookUrl("");
      setWebhookSecret(null);
      setEditingCodeSecrets(null);
    }
    
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
      // Generate webhook secret if webhook is enabled and URL is provided but no secret exists
      let newWebhookSecret = webhookSecret;
      if (webhookEnabled && webhookUrl && !newWebhookSecret) {
        newWebhookSecret = `whsec_${Array.from(crypto.getRandomValues(new Uint8Array(24)))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('')}`;
      }

      // Update discount code WITHOUT sensitive fields
      const { error } = await supabase
        .from("discount_codes")
        .update({
          name,
          discount_type: discountType,
          discount_value: parseFloat(discountValue),
          usage_limit: parseInt(usageLimit),
          valid_from: validFrom.toISOString(),
          valid_until: validUntil ? validUntil.toISOString() : null,
          min_order_amount: minOrderAmount ? parseInt(minOrderAmount) : 0,
          applicable_room_types: selectedRoomTypes,
          applicable_date_from: applicableDateFrom ? applicableDateFrom.toISOString().split('T')[0] : null,
          applicable_date_to: applicableDateTo ? applicableDateTo.toISOString().split('T')[0] : null,
          commission_rate: commissionRate ? parseFloat(commissionRate) : 0,
        })
        .eq("id", editingCode.id);

      if (error) throw error;

      // Update secrets in the secure table
      const { error: secretsError } = await supabase
        .from("discount_code_secrets")
        .update({
          webhook_url: webhookUrl || null,
          webhook_secret: newWebhookSecret,
          updated_at: new Date().toISOString(),
        })
        .eq("discount_code_id", editingCode.id);

      if (secretsError) {
        console.error("Error updating secrets:", secretsError);
      }

      toast({
        title: "折扣碼更新成功",
      });

      setEditOpen(false);
      setEditingCode(null);
      setEditingCodeSecrets(null);
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
      setWebhookUrl("");
      setWebhookSecret(null);
      setWebhookEnabled(false);
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

  const handleTestWebhook = async (discountCodeId: string) => {
    setTestingWebhook(true);
    try {
      const { data, error } = await supabase.functions.invoke('kol-webhook', {
        body: { 
          test_mode: true, 
          discount_code_id: discountCodeId 
        }
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: "Webhook 測試成功",
          description: `狀態碼: ${data.statusCode}`,
        });
      } else {
        toast({
          title: "Webhook 測試失敗",
          description: data.error || data.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error testing webhook:", error);
      toast({
        title: "測試失敗",
        description: error instanceof Error ? error.message : "無法發送測試 webhook",
        variant: "destructive",
      });
    } finally {
      setTestingWebhook(false);
    }
  };

  const handleDialogClose = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      // 清除表單
      setName("");
      setCustomCode("");
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
        return <Badge variant="default" className="bg-primary">有效</Badge>;
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

  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(filteredCodes.length / itemsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedCodes = filteredCodes.slice(startIndex, endIndex);

  // Reset to page 1 when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filterStatus]);

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
                "h-8 w-8 transition-all touch-manipulation",
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
        <TableCell className="w-[180px]">
          <div className="flex items-center gap-1 -ml-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 touch-manipulation"
              onClick={() => handleOpenEdit(item)}
              title="編輯"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 touch-manipulation"
              onClick={() => navigate(`/admin/discount-codes/${item.id}/detail`)}
              title="查看詳情"
            >
              <Eye className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 touch-manipulation"
              onClick={() => toggleActive(item.id, item.is_active)}
              title={item.is_active ? "停用" : "啟用"}
            >
              {item.is_active ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Check className="h-4 w-4 text-primary" />
              )}
            </Button>
            <Button
              variant="ghost-destructive"
              size="icon"
              className="h-9 w-9 touch-manipulation"
              onClick={() => handleDeleteClick(item.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6 md:space-y-8">
        <PageHeader title="網紅導購" icon={Sparkles} />
        <TableSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/admin" className="flex items-center hover:opacity-70 transition-opacity">
                <Home className="h-4 w-4" />
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>網紅導購</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader
        title="網紅導購"
        icon={Sparkles}
        action={
          <>
            {isMobile ? (
              <Drawer open={open} onOpenChange={handleDialogClose}>
                <DrawerTrigger asChild>
                  <Button className="gap-2 h-11 sm:h-10 touch-manipulation">
                    <Plus className="h-4 w-4" />
                    新增網紅
                  </Button>
                </DrawerTrigger>
                <DrawerContent className="max-h-[90vh]">
                  <DrawerHeader>
                    <DrawerTitle>新增網紅折扣碼</DrawerTitle>
                    <DrawerDescription>
                      填寫折扣碼資訊
                    </DrawerDescription>
                  </DrawerHeader>
                  <div className="overflow-y-auto px-4 pb-4">
                    <div className="grid gap-4">
              <div className="grid gap-2">
                      <Label htmlFor="name">名稱</Label>
                      <Input
                        id="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="例如：春季促銷、網紅合作"
                        className="h-12 text-base touch-manipulation"
                      />
              </div>
              <div className="grid gap-2">
                      <Label htmlFor="customCode">折扣碼（選填，留空將自動生成）</Label>
                      <Input
                        id="customCode"
                        value={customCode}
                        onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
                        placeholder="例如：SUMMER2026"
                        maxLength={20}
                        className="h-12 text-base touch-manipulation uppercase"
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
                  <SelectTrigger className="h-12 text-base touch-manipulation">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background border-border z-50">
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
                        inputMode="numeric"
                        min="1"
                        value={discountValue}
                        onChange={(e) => setDiscountValue(e.target.value)}
                        placeholder={
                          discountType === "percentage" ? "例如：10" : "例如：500"
                        }
                        className="h-12 text-base touch-manipulation"
                      />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="usageLimit">使用次數上限</Label>
                      <Input
                        id="usageLimit"
                        type="number"
                        inputMode="numeric"
                        min="1"
                        value={usageLimit}
                        onChange={(e) => setUsageLimit(e.target.value)}
                        placeholder="例如：100"
                        className="h-12 text-base touch-manipulation"
                      />
              </div>
              <div className="grid gap-2">
                <Label>生效日期</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("justify-start text-left font-normal h-12 text-base touch-manipulation")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(validFrom, "yyyy/MM/dd")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-background border-border z-50" align="start">
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
                        "justify-start text-left font-normal h-12 text-base touch-manipulation",
                        !validUntil && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {validUntil ? format(validUntil, "yyyy/MM/dd") : "無期限"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-background border-border z-50" align="start">
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
                          className="w-full h-11 touch-manipulation"
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
                  inputMode="numeric"
                  min="0"
                  value={minOrderAmount}
                  onChange={(e) => setMinOrderAmount(e.target.value)}
                  placeholder="例如：1000（0 表示無限制）"
                  className="h-12 text-base touch-manipulation"
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
                        className="h-5 w-5 touch-manipulation"
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
                        inputMode="numeric"
                        min="0"
                        max="100"
                        step="0.1"
                        value={commissionRate}
                        onChange={(e) => setCommissionRate(e.target.value)}
                        placeholder="例如：10（表示 10%）"
                        className="h-9 sm:h-10 touch-manipulation"
                      />
              <p className="text-xs text-muted-foreground">
                        佣金將根據實際付款金額計算，例如訂房 30,000 元折扣後實付 27,000 元且佣金率 5%，則佣金為 1,350 元
                      </p>
                    </div>
                  </div>
                  <DrawerFooter className="flex-col gap-2 px-4">
                    <Button onClick={handleSubmit} className="w-full h-12 touch-manipulation">新增</Button>
                    <Button variant="outline" onClick={() => setOpen(false)} className="w-full h-12 touch-manipulation">取消</Button>
                  </DrawerFooter>
                </DrawerContent>
              </Drawer>
            ) : (
              <Dialog open={open} onOpenChange={handleDialogClose}>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <Plus className="h-4 w-4" />
                    新增網紅
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>新增網紅折扣碼</DialogTitle>
                    <DialogDescription>
                      填寫折扣碼資訊
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
                        className="touch-manipulation"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="customCode">折扣碼（選填，留空將自動生成）</Label>
                      <Input
                        id="customCode"
                        value={customCode}
                        onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
                        placeholder="例如：SUMMER2026"
                        maxLength={20}
                        className="touch-manipulation uppercase"
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
                  <SelectTrigger className="h-12 text-base touch-manipulation">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background border-border z-50">
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
                        inputMode="numeric"
                        min="1"
                        value={discountValue}
                        onChange={(e) => setDiscountValue(e.target.value)}
                        placeholder={
                          discountType === "percentage" ? "例如：10" : "例如：500"
                        }
                        className="touch-manipulation"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="usageLimit">使用次數上限</Label>
                      <Input
                        id="usageLimit"
                        type="number"
                        inputMode="numeric"
                        min="1"
                        value={usageLimit}
                        onChange={(e) => setUsageLimit(e.target.value)}
                        placeholder="例如：100"
                        className="touch-manipulation"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>生效日期</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("justify-start text-left font-normal h-12 text-base touch-manipulation")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {format(validFrom, "yyyy/MM/dd")}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 bg-background border-border z-50" align="start">
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
                              "justify-start text-left font-normal h-12 text-base touch-manipulation",
                              !validUntil && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {validUntil ? format(validUntil, "yyyy/MM/dd") : "選擇日期"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 bg-background border-border z-50" align="start">
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
                                className="w-full h-11 touch-manipulation"
                                onClick={() => setValidUntil(undefined)}
                              >
                                清除
                              </Button>
                            </div>
                          )}
                        </PopoverContent>
                      </Popover>
                    </div>
                    
                    <div className="grid gap-2">
                      <Label htmlFor="minOrderAmount">最低消費金額（選填）</Label>
                      <Input
                        id="minOrderAmount"
                        type="number"
                        inputMode="numeric"
                        min="0"
                        value={minOrderAmount}
                        onChange={(e) => setMinOrderAmount(e.target.value)}
                        placeholder="例如：1000（不填表示無限制）"
                        className="touch-manipulation"
                      />
                    </div>
                    
                    <div className="grid gap-2">
                      <Label>適用房型（選填，不選表示全部適用）</Label>
                      <div className="space-y-2">
                        {roomTypes.map((room) => (
                          <div key={room.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`room-${room.id}`}
                            checked={applicableRoomTypes.includes(room.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setApplicableRoomTypes([...applicableRoomTypes, room.id]);
                              } else {
                                setApplicableRoomTypes(
                                  applicableRoomTypes.filter((id) => id !== room.id)
                                );
                              }
                            }}
                            className="h-5 w-5 touch-manipulation"
                          />
                            <Label
                              htmlFor={`room-${room.id}`}
                              className="text-sm font-normal cursor-pointer"
                            >
                              {room.name}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="flex items-center space-x-2">
                        <Switch
                          id="enableDateRange"
                          checked={enableDateRange}
                          onCheckedChange={setEnableDateRange}
                          className="touch-manipulation"
                        />
                        <Label htmlFor="enableDateRange" className="text-sm cursor-pointer">
                          限制入住日期範圍
                        </Label>
                      </div>
                      
                      {enableDateRange && (
                        <div className="grid gap-2 pl-8">
                          <div className="grid gap-2">
                            <Label>入住開始日期</Label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="outline" className={cn("justify-start text-left font-normal h-12 text-base touch-manipulation")}>
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {applicableDateFrom ? format(applicableDateFrom, "yyyy/MM/dd") : "選擇日期"}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0 bg-background border-border z-50" align="start">
                                <Calendar
                                  mode="single"
                                  selected={applicableDateFrom}
                                  onSelect={setApplicableDateFrom}
                                  initialFocus
                                  className="pointer-events-auto"
                                />
                              </PopoverContent>
                            </Popover>
                          </div>
                          
                          <div className="grid gap-2">
                            <Label>入住結束日期</Label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  className={cn(
                                    "justify-start text-left font-normal h-12 text-base touch-manipulation",
                                    !applicableDateTo && "text-muted-foreground"
                                  )}
                                >
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {applicableDateTo ? format(applicableDateTo, "yyyy/MM/dd") : "選擇日期"}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0 bg-background border-border z-50" align="start">
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
                                      className="w-full h-11 touch-manipulation"
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
                      )}
                    </div>
                    
                    <Separator className="my-2" />
                    <p className="text-sm font-medium">網紅佣金設定</p>
                    
                    <div className="grid gap-2">
                      <Label htmlFor="commissionRate">佣金率 (%)</Label>
                      <Input
                        id="commissionRate"
                        type="number"
                        inputMode="numeric"
                        min="0"
                        max="100"
                        step="0.1"
                        value={commissionRate}
                        onChange={(e) => setCommissionRate(e.target.value)}
                        placeholder="例如：10（表示 10%）"
                        className="touch-manipulation"
                      />
                      <p className="text-xs text-muted-foreground">
                        佣金將根據實際付款金額計算，例如訂房 30,000 元折扣後實付 27,000 元且佣金率 5%，則佣金為 1,350 元
                      </p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleSubmit} className="touch-manipulation">新增</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </>
        }
      />

      {/* Edit Discount Code Dialog */}
      {isMobile ? (
        <Drawer open={editOpen} onOpenChange={setEditOpen}>
          <DrawerContent className="max-h-[90vh]">
            <DrawerHeader>
              <DrawerTitle>編輯折扣碼</DrawerTitle>
              <DrawerDescription>
                修改折扣碼資訊（折扣碼本身無法修改）
              </DrawerDescription>
            </DrawerHeader>
            <div className="overflow-y-auto px-4 pb-4">
              <div className="grid gap-4">
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
                className="h-12 text-base touch-manipulation"
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
                <SelectTrigger className="h-12 text-base touch-manipulation">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background border-border z-50">
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
                inputMode="numeric"
                min="1"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                placeholder={
                  discountType === "percentage" ? "例如：10" : "例如：500"
                }
                className="h-12 text-base touch-manipulation"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-usageLimit">使用次數上限</Label>
              <Input
                id="edit-usageLimit"
                type="number"
                inputMode="numeric"
                min="1"
                value={usageLimit}
                onChange={(e) => setUsageLimit(e.target.value)}
                placeholder="例如：100"
                className="h-12 text-base touch-manipulation"
              />
            </div>
            <div className="grid gap-2">
              <Label>生效日期</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("justify-start text-left font-normal h-12 text-base touch-manipulation")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(validFrom, "yyyy/MM/dd")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-background border-border z-50" align="start">
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
                      "justify-start text-left font-normal h-12 text-base touch-manipulation",
                      !validUntil && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {validUntil ? format(validUntil, "yyyy/MM/dd") : "無期限"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-background border-border z-50" align="start">
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
                        className="w-full h-11 touch-manipulation"
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
                inputMode="numeric"
                min="0"
                value={minOrderAmount}
                onChange={(e) => setMinOrderAmount(e.target.value)}
                placeholder="例如：1000（0 表示無限制）"
                className="h-12 text-base touch-manipulation"
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
                      className="h-5 w-5 touch-manipulation"
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
                  <PopoverContent className="w-auto p-0 bg-background border-border z-50" align="start">
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
                          className="w-full h-11 touch-manipulation"
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
                  <PopoverContent className="w-auto p-0 bg-background border-border z-50" align="start">
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
                          className="w-full h-11 touch-manipulation"
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
                    inputMode="numeric"
                    min="0"
                    max="100"
                    step="0.1"
                    value={commissionRate}
                    onChange={(e) => setCommissionRate(e.target.value)}
                    placeholder="例如：10（表示 10%）"
                    className="h-12 text-base touch-manipulation"
                  />
            <p className="text-xs text-muted-foreground">
                  佣金將根據實際付款金額計算，例如訂房 30,000 元折扣後實付 27,000 元且佣金率 5%，則佣金為 1,350 元
                </p>
              </div>

          <Separator className="my-2" />
          <p className="text-sm font-medium">Webhook 通知設定</p>
          
          <div className="grid gap-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="edit-webhookEnabled">啟用 Webhook</Label>
                <p className="text-xs text-muted-foreground">
                  新訂單時自動發送通知到指定網址
                </p>
              </div>
              <Switch
                id="edit-webhookEnabled"
                checked={webhookEnabled}
                onCheckedChange={setWebhookEnabled}
              />
            </div>
            
            {webhookEnabled && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="edit-webhookUrl">Webhook URL</Label>
                  <Input
                    id="edit-webhookUrl"
                    type="url"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder="https://example.com/webhook"
                    className="h-12 text-base touch-manipulation"
                  />
                  <p className="text-xs text-muted-foreground">
                    系統會以 POST 方式發送訂單資訊到此網址
                  </p>
                </div>
                
                {webhookSecret && (
                  <div className="grid gap-2">
                    <Label>Webhook Secret</Label>
                    <div className="p-2 bg-muted rounded text-xs font-mono break-all">
                      {webhookSecret}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      用於驗證 webhook 請求的簽名（X-Webhook-Signature header）
                    </p>
                  </div>
                )}
                
                {editingCode?.id && webhookUrl && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleTestWebhook(editingCode.id)}
                    disabled={testingWebhook}
                    className="h-12 touch-manipulation"
                  >
                    {testingWebhook ? "發送中..." : "測試 Webhook"}
                  </Button>
                )}
              </>
            )}
          </div>
            </div>
            <DrawerFooter className="flex-col gap-2 px-4">
              <Button onClick={handleUpdateCode} className="w-full h-12 touch-manipulation">更新</Button>
              <Button variant="outline" onClick={() => setEditOpen(false)} className="w-full h-12 touch-manipulation">取消</Button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : (
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
                <Label htmlFor="edit-name">名稱</Label>
                <Input
                  id="edit-name"
                  value={editingCode?.name}
                  onChange={(e) =>
                    setEditingCode(
                      editingCode ? { ...editingCode, name: e.target.value } : null
                    )
                  }
                  placeholder="例如：春季促銷、網紅合作"
                />
              </div>
              <div className="grid gap-2">
                <Label>折扣碼（無法修改）</Label>
                <Input
                  value={editingCode?.code}
                  disabled
                  className="bg-muted"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-discountType">折扣類型</Label>
                <Select
                  value={editingCode?.discount_type}
                  onValueChange={(value) =>
                    setEditingCode(
                      editingCode
                        ? { ...editingCode, discount_type: value as "percentage" | "amount" }
                        : null
                    )
                  }
                >
                        <SelectTrigger className="touch-manipulation">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-background border-border z-50">
                          <SelectItem value="percentage">百分比</SelectItem>
                          <SelectItem value="amount">固定金額</SelectItem>
                        </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-discountValue">
                  折扣值 {editingCode?.discount_type === "percentage" ? "(%)" : "(NT$)"}
                </Label>
                <Input
                  id="edit-discountValue"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  value={editingCode?.discount_value}
                  onChange={(e) =>
                    setEditingCode(
                      editingCode
                        ? { ...editingCode, discount_value: Number(e.target.value) }
                        : null
                    )
                  }
                  placeholder={
                    editingCode?.discount_type === "percentage" ? "例如：10" : "例如：500"
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-usageLimit">使用次數上限</Label>
                <Input
                  id="edit-usageLimit"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  value={editingCode?.usage_limit}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setUsageLimit(e.target.value);
                    setEditingCode(
                      editingCode
                        ? { ...editingCode, usage_limit: val }
                        : null
                    );
                  }}
                  placeholder="例如：100"
                />
              </div>
              <div className="grid gap-2">
                <Label>生效日期</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("justify-start text-left font-normal")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editingCode && format(new Date(editingCode.valid_from), "yyyy/MM/dd")}
                    </Button>
                  </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-background border-border z-50" align="start">
                  <Calendar
                    mode="single"
                    selected={editingCode ? new Date(editingCode.valid_from) : undefined}
                    onSelect={(date) =>
                      date &&
                      setEditingCode(
                        editingCode
                          ? { ...editingCode, valid_from: format(date, "yyyy-MM-dd") }
                          : null
                      )
                    }
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
                        !editingCode?.valid_until && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editingCode?.valid_until
                        ? format(new Date(editingCode.valid_until), "yyyy/MM/dd")
                        : "選擇日期"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-background border-border z-50" align="start">
                    <Calendar
                      mode="single"
                      selected={
                        editingCode?.valid_until
                          ? new Date(editingCode.valid_until)
                          : undefined
                      }
                      onSelect={(date) =>
                        setEditingCode(
                          editingCode
                            ? {
                                ...editingCode,
                                valid_until: date ? format(date, "yyyy-MM-dd") : null,
                              }
                            : null
                        )
                      }
                      initialFocus
                      disabled={(date) =>
                        editingCode
                          ? date < new Date(editingCode.valid_from)
                          : false
                      }
                      className="pointer-events-auto"
                    />
                    {editingCode?.valid_until && (
                      <div className="p-3 border-t">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full touch-manipulation"
                          onClick={() =>
                            setEditingCode(
                              editingCode
                                ? { ...editingCode, valid_until: null }
                                : null
                            )
                          }
                        >
                          清除
                        </Button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="edit-minOrderAmount">最低消費金額（選填）</Label>
                <Input
                  id="edit-minOrderAmount"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={editingCode?.min_order_amount || ""}
                  onChange={(e) =>
                    setEditingCode(
                      editingCode
                        ? {
                            ...editingCode,
                            min_order_amount: e.target.value ? Number(e.target.value) : null,
                          }
                        : null
                    )
                  }
                  placeholder="例如：1000（不填表示無限制）"
                />
              </div>
              
              <div className="grid gap-2">
                <Label>適用房型（選填，不選表示全部適用）</Label>
                <div className="space-y-2">
                  {roomTypes.map((room) => (
                    <div key={room.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`edit-room-${room.id}`}
                        checked={
                          editingCode?.applicable_room_types
                            ? (editingCode.applicable_room_types as string[]).includes(room.id)
                            : false
                        }
                        onCheckedChange={(checked) => {
                          if (!editingCode) return;
                          const currentTypes = (editingCode.applicable_room_types as string[]) || [];
                          if (checked) {
                            setEditingCode({
                              ...editingCode,
                              applicable_room_types: [...currentTypes, room.id],
                            });
                          } else {
                            setEditingCode({
                              ...editingCode,
                              applicable_room_types: currentTypes.filter(
                                (id) => id !== room.id
                              ),
                            });
                          }
                        }}
                      />
                      <Label
                        htmlFor={`edit-room-${room.id}`}
                        className="text-sm font-normal cursor-pointer"
                      >
                        {room.name}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="edit-enableDateRange"
                    checked={!!(editingCode?.applicable_date_from || editingCode?.applicable_date_to)}
                    onCheckedChange={(checked) => {
                      if (!checked && editingCode) {
                        setEditingCode({
                          ...editingCode,
                          applicable_date_from: null,
                          applicable_date_to: null,
                        });
                      }
                    }}
                  />
                  <Label htmlFor="edit-enableDateRange" className="text-sm cursor-pointer">
                    限制入住日期範圍
                  </Label>
                </div>
                
                {(editingCode?.applicable_date_from || editingCode?.applicable_date_to) && (
                  <div className="grid gap-2 pl-8">
                    <div className="grid gap-2">
                      <Label>入住開始日期</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("justify-start text-left font-normal")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {editingCode.applicable_date_from
                              ? format(new Date(editingCode.applicable_date_from), "yyyy/MM/dd")
                              : "選擇日期"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={
                              editingCode.applicable_date_from
                                ? new Date(editingCode.applicable_date_from)
                                : undefined
                            }
                            onSelect={(date) =>
                              date &&
                              setEditingCode(
                                editingCode
                                  ? {
                                      ...editingCode,
                                      applicable_date_from: format(date, "yyyy-MM-dd"),
                                    }
                                  : null
                              )
                            }
                            initialFocus
                            className="pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    
                    <div className="grid gap-2">
                      <Label>入住結束日期</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "justify-start text-left font-normal",
                              !editingCode.applicable_date_to && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {editingCode.applicable_date_to
                              ? format(new Date(editingCode.applicable_date_to), "yyyy/MM/dd")
                              : "選擇日期"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={
                              editingCode.applicable_date_to
                                ? new Date(editingCode.applicable_date_to)
                                : undefined
                            }
                            onSelect={(date) =>
                              setEditingCode(
                                editingCode
                                  ? {
                                      ...editingCode,
                                      applicable_date_to: date
                                        ? format(date, "yyyy-MM-dd")
                                        : null,
                                    }
                                  : null
                              )
                            }
                            initialFocus
                            disabled={(date) =>
                              editingCode.applicable_date_from
                                ? date < new Date(editingCode.applicable_date_from)
                                : false
                            }
                            className="pointer-events-auto"
                          />
                          {editingCode.applicable_date_to && (
                            <div className="p-3 border-t">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="w-full"
                                onClick={() =>
                                  setEditingCode(
                                    editingCode
                                      ? { ...editingCode, applicable_date_to: null }
                                      : null
                                  )
                                }
                              >
                                清除
                              </Button>
                            </div>
                          )}
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                )}
              </div>
              
              <Separator className="my-2" />
              <p className="text-sm font-medium">網紅佣金設定</p>
              
              <div className="grid gap-2">
                <Label htmlFor="edit-commissionRate">佣金率 (%)</Label>
                <Input
                  id="edit-commissionRate"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="100"
                  step="0.1"
                  value={commissionRate}
                  onChange={(e) => setCommissionRate(e.target.value)}
                  placeholder="例如：10（表示 10%）"
                />
                <p className="text-xs text-muted-foreground">
                  佣金將根據實際付款金額計算，例如訂房 30,000 元折扣後實付 27,000 元且佣金率 5%，則佣金為 1,350 元
                </p>
              </div>

              <Separator className="my-2" />
              <p className="text-sm font-medium">Webhook 通知設定</p>
              
              <div className="grid gap-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="edit-webhookEnabled-dialog">啟用 Webhook</Label>
                    <p className="text-xs text-muted-foreground">
                      新訂單時自動發送通知到指定網址
                    </p>
                  </div>
                  <Switch
                    id="edit-webhookEnabled-dialog"
                    checked={webhookEnabled}
                    onCheckedChange={setWebhookEnabled}
                  />
                </div>
                
                {webhookEnabled && (
                  <>
                    <div className="grid gap-2">
                      <Label htmlFor="edit-webhookUrl-dialog">Webhook URL</Label>
                      <Input
                        id="edit-webhookUrl-dialog"
                        type="url"
                        value={webhookUrl}
                        onChange={(e) => setWebhookUrl(e.target.value)}
                        placeholder="https://example.com/webhook"
                      />
                      <p className="text-xs text-muted-foreground">
                        系統會以 POST 方式發送訂單資訊到此網址
                      </p>
                    </div>
                    
                    {webhookSecret && (
                      <div className="grid gap-2">
                        <Label>Webhook Secret</Label>
                        <div className="p-2 bg-muted rounded text-xs font-mono break-all">
                          {webhookSecret}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          用於驗證 webhook 請求的簽名（X-Webhook-Signature header）
                        </p>
                      </div>
                    )}
                    
                    {editingCode?.id && webhookUrl && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleTestWebhook(editingCode.id)}
                        disabled={testingWebhook}
                      >
                        {testingWebhook ? "發送中..." : "測試 Webhook"}
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOpen(false)} className="touch-manipulation">
                取消
              </Button>
              <Button onClick={handleUpdateCode} className="touch-manipulation">更新</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Quick Filter Buttons */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={filterStatus === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterStatus("all")}
            className="h-11 sm:h-9 touch-manipulation"
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
            className="h-11 sm:h-9 touch-manipulation"
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
            className="h-11 sm:h-9 touch-manipulation"
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
            className="h-11 sm:h-9 touch-manipulation"
          >
            已額滿
            <Badge variant="secondary" className="ml-2 bg-muted">
              {discountCodes.filter(code => getCodeStatus(code) === "full").length}
            </Badge>
          </Button>
        </div>
      </Card>

      <>
        {/* Desktop table view */}
        <div className="hidden md:block table-scroll-container overflow-x-auto rounded-md border touch-pan-x">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-12 text-foreground text-sm"></TableHead>
                <TableHead className="text-foreground text-sm">名稱</TableHead>
                <TableHead className="text-foreground text-sm">折扣碼</TableHead>
                <TableHead className="text-foreground text-sm">推薦連結</TableHead>
                <TableHead className="text-foreground text-sm">折扣</TableHead>
                <TableHead className="text-foreground text-sm">已使用</TableHead>
                <TableHead className="text-foreground text-sm">使用上限</TableHead>
                <TableHead className="text-foreground text-sm">有效期</TableHead>
                <TableHead className="text-foreground text-sm">狀態</TableHead>
                <TableHead className="text-center text-foreground text-sm w-[180px]">操作</TableHead>
              </TableRow>
            </TableHeader>
              <TableBody>
                {filteredCodes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="p-0">
                      <div className="py-8">
                        <EmptyState
                          icon={Tag}
                          title="暫無折扣碼"
                          description="目前還沒有建立任何折扣碼，點擊右上角的「新增網紅」按鈕開始建立"
                          className="border-0 shadow-none"
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={paginatedCodes.map(code => code.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {paginatedCodes.map((item) => (
                        <SortableRow key={item.id} item={item} />
                      ))}
                    </SortableContext>
                  </DndContext>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {filteredCodes.length > 0 && (
            <div className="mt-6 p-4 bg-muted/30 rounded-lg">
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full lg:w-auto">
                  <div className="text-sm text-muted-foreground whitespace-nowrap">
                    顯示 {startIndex + 1} 至 {Math.min(endIndex, filteredCodes.length)} 筆，共 {filteredCodes.length} 筆
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground whitespace-nowrap">每頁顯示</span>
                    <Select
                      value={itemsPerPage.toString()}
                      onValueChange={(value) => {
                        setItemsPerPage(Number(value));
                        setCurrentPage(1);
                      }}
                    >
                      <SelectTrigger className="w-24 h-11 sm:h-9 touch-manipulation">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-background border-border z-50">
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="20">20</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                {totalPages > 1 && (
                  <Pagination className="mx-0 w-full lg:w-auto justify-start lg:justify-end">
                    <PaginationContent className="gap-2 md:gap-1.5 flex-wrap">
                      <PaginationItem>
                        <PaginationPrevious 
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          className={`h-10 touch-manipulation ${safeCurrentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}`}
                        >
                          上一頁
                        </PaginationPrevious>
                      </PaginationItem>
                      
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter(page => {
                          return page === 1 || 
                                 page === totalPages || 
                                 Math.abs(page - safeCurrentPage) <= 1;
                        })
                        .map((page, index, array) => (
                          <PaginationItem key={page}>
                            {index > 0 && array[index - 1] !== page - 1 && (
                              <span className="px-2 text-muted-foreground">...</span>
                            )}
                            <PaginationLink
                              onClick={() => setCurrentPage(page)}
                              isActive={safeCurrentPage === page}
                              className="h-10 touch-manipulation cursor-pointer"
                            >
                              {page}
                            </PaginationLink>
                          </PaginationItem>
                        ))}
                      
                      <PaginationItem>
                        <PaginationNext 
                          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                          className={`h-10 touch-manipulation ${safeCurrentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}`}
                        >
                          下一頁
                        </PaginationNext>
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                )}
              </div>
            </div>
          )}

          {/* Mobile card view */}
          <div className="md:hidden space-y-4 p-4">
            {filteredCodes.length === 0 ? (
              <EmptyState
                icon={Tag}
                title="暫無折扣碼"
                description="目前還沒有建立任何折扣碼，點擊右上角的「新增網紅」按鈕開始建立"
                className="border-0 shadow-none"
              />
            ) : (
              paginatedCodes.map((item) => (
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
                            "h-10 shrink-0 transition-all touch-manipulation",
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
                          "w-full gap-1.5 transition-all h-11 touch-manipulation",
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
                          variant="ghost"
                          size="sm"
                          className="h-11 text-xs touch-manipulation"
                          onClick={() => navigate(`/admin/discount-codes/${item.id}/detail`)}
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" />
                          查看詳情
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-11 text-xs touch-manipulation"
                          onClick={() => handleOpenEdit(item)}
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1" />
                          編輯
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-11 text-xs touch-manipulation"
                          onClick={() => toggleActive(item.id, item.is_active)}
                        >
                          {item.is_active ? (
                            <>
                              <Pause className="h-3.5 w-3.5 mr-1" />
                              停用
                            </>
                          ) : (
                            <>
                              <Check className="h-3.5 w-3.5 mr-1 text-primary" />
                              啟用
                            </>
                          )}
                        </Button>
                        <Button
                          variant="ghost-destructive"
                          size="sm"
                          className="h-11 text-xs touch-manipulation"
                          onClick={() => handleDeleteClick(item.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          <span>刪除</span>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
            {/* Mobile Pagination */}
            {filteredCodes.length > 0 && (
              <div className="mt-4 p-3 bg-muted/30 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    {startIndex + 1}-{Math.min(endIndex, filteredCodes.length)} / {filteredCodes.length} 筆
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">每頁</span>
                    <Select
                      value={itemsPerPage.toString()}
                      onValueChange={(value) => {
                        setItemsPerPage(Number(value));
                        setCurrentPage(1);
                      }}
                    >
                      <SelectTrigger className="w-20 h-11 touch-manipulation">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-background border-border z-50">
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="20">20</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-10 touch-manipulation"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={safeCurrentPage === 1}
                    >
                      上一頁
                    </Button>
                    <span className="text-sm text-muted-foreground px-2">
                      {safeCurrentPage} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-10 touch-manipulation"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={safeCurrentPage === totalPages}
                    >
                      下一頁
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </>

      {/* API Documentation Dialog */}
      {isMobile ? (
        <Drawer open={apiDocOpen} onOpenChange={setApiDocOpen}>
          <DrawerContent className="max-h-[90vh]">
            <DrawerHeader>
              <DrawerTitle>網紅 API 使用說明</DrawerTitle>
              <DrawerDescription>
                透過以下 API 端點，網紅可以在自己的網站查詢訂單和佣金數據
              </DrawerDescription>
            </DrawerHeader>
            <div className="overflow-y-auto px-4 pb-4">
              <div className="space-y-6">
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

            {/* Authentication */}
            <div>
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <Shield className="h-4 w-4" />
                API 金鑰驗證
              </h3>
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded">
                <p className="text-sm text-amber-800 dark:text-amber-200 mb-2">
                  <strong>重要：</strong>所有 API 請求都需要提供 API 金鑰進行驗證
                </p>
                <p className="text-xs text-muted-foreground">
                  每個折扣碼都有唯一的 API 金鑰，可以在「查看詳情」中找到並複製
                </p>
              </div>
              <div className="mt-3 space-y-2">
                <Label className="text-xs text-muted-foreground">驗證方式（二選一）</Label>
                <div className="space-y-2">
                  <div className="p-2 bg-muted rounded">
                    <p className="text-xs font-medium mb-1">方式一：HTTP Header</p>
                    <code className="text-xs">x-api-key: YOUR_API_KEY</code>
                  </div>
                  <div className="p-2 bg-muted rounded">
                    <p className="text-xs font-medium mb-1">方式二：URL 參數</p>
                    <code className="text-xs">?api_key=YOUR_API_KEY</code>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Endpoint 1: Query Orders */}
            <div>
              <h3 className="font-semibold mb-2">1. 查詢訂單列表</h3>
              <div className="space-y-2">
                <div>
                  <Label className="text-xs text-muted-foreground">端點</Label>
                  <code className="block p-2 bg-muted rounded text-sm font-mono">
                    GET /orders?code=YOUR_DISCOUNT_CODE&api_key=YOUR_API_KEY
                  </code>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">範例請求</Label>
                  <pre className="p-3 bg-muted rounded text-xs font-mono overflow-x-auto">
{`fetch('https://sensaninn.lakeze.com/functions/v1/kol-api/orders?code=SPRING2024&api_key=kol_xxxxx', {
  headers: {
    'x-api-key': 'kol_xxxxx' // 或使用 URL 參數
  }
})
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
                    GET /stats?code=YOUR_DISCOUNT_CODE&api_key=YOUR_API_KEY
                  </code>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">範例請求</Label>
                  <pre className="p-3 bg-muted rounded text-xs font-mono overflow-x-auto">
{`fetch('https://sensaninn.lakeze.com/functions/v1/kol-api/stats?code=SPRING2024&api_key=kol_xxxxx')
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
                    GET /commission?code=YOUR_DISCOUNT_CODE&api_key=YOUR_API_KEY
                  </code>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">範例請求</Label>
                  <pre className="p-3 bg-muted rounded text-xs font-mono overflow-x-auto">
{`fetch('https://sensaninn.lakeze.com/functions/v1/kol-api/commission?code=SPRING2024&api_key=kol_xxxxx')
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

            {/* Webhook */}
            <div>
              <h3 className="font-semibold mb-2">Webhook 即時通知</h3>
              <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded mb-3">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  當有使用您折扣碼的新訂單成立時，系統會自動發送 Webhook 通知到您設定的 URL
                </p>
              </div>
              
              <div className="space-y-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Webhook 請求格式</Label>
                  <p className="text-xs text-muted-foreground mb-2">系統會發送 POST 請求到您的 Webhook URL</p>
                  <pre className="p-3 bg-muted rounded text-xs font-mono overflow-x-auto">
{`POST https://your-webhook-url.com/endpoint
Content-Type: application/json
X-Webhook-Signature: sha256=xxxxxx...
X-Webhook-Timestamp: 1735123456789

{
  "event": "order.created",
  "timestamp": "2024-12-25T10:30:00.000Z",
  "discount_code": "SPRING2024",
  "order": {
    "order_number": "20241225001",
    "order_date": "2024-12-25",
    "check_in_date": "2025-01-15",
    "check_out_date": "2025-01-17",
    "guest_name": "王小明",
    "guest_count": 2,
    "room_type": "標準雙人房",
    "total_price": 5000,
    "discount_amount": 500,
    "final_price": 4500
  }
}`}
                  </pre>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">簽名驗證</Label>
                  <p className="text-xs text-muted-foreground mb-2">
                    為確保請求來源安全，每個 Webhook 請求都包含 HMAC-SHA256 簽名
                  </p>
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded mb-3">
                    <p className="text-xs text-amber-800 dark:text-amber-200">
                      <strong>重要：</strong>請務必驗證簽名以防止偽造請求
                    </p>
                  </div>
                  <pre className="p-3 bg-muted rounded text-xs font-mono overflow-x-auto">
{`// Node.js 簽名驗證範例
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, timestamp, secret) {
  // 1. 檢查時間戳（防止重放攻擊，建議 5 分鐘內有效）
  const now = Date.now();
  if (Math.abs(now - parseInt(timestamp)) > 5 * 60 * 1000) {
    return false;
  }
  
  // 2. 計算期望的簽名
  const signaturePayload = timestamp + '.' + JSON.stringify(payload);
  const expectedSignature = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(signaturePayload)
    .digest('hex');
  
  // 3. 比較簽名（使用時序安全比較）
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// Express.js 使用範例
app.post('/webhook', express.json(), (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const timestamp = req.headers['x-webhook-timestamp'];
  const secret = 'YOUR_WEBHOOK_SECRET'; // 從設定頁面取得
  
  if (!verifyWebhookSignature(req.body, signature, timestamp, secret)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  // 處理訂單通知
  const { event, order, discount_code } = req.body;
  console.log(\`新訂單: \${order.order_number}\`);
  
  res.status(200).json({ received: true });
});`}
                  </pre>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">Python 驗證範例</Label>
                  <pre className="p-3 bg-muted rounded text-xs font-mono overflow-x-auto">
{`import hmac
import hashlib
import json
import time

def verify_webhook(payload, signature, timestamp, secret):
    # 檢查時間戳
    now = int(time.time() * 1000)
    if abs(now - int(timestamp)) > 5 * 60 * 1000:
        return False
    
    # 計算簽名
    message = f"{timestamp}.{json.dumps(payload, separators=(',', ':'))}"
    expected = 'sha256=' + hmac.new(
        secret.encode(),
        message.encode(),
        hashlib.sha256
    ).hexdigest()
    
    return hmac.compare_digest(signature, expected)

# Flask 使用範例
@app.route('/webhook', methods=['POST'])
def webhook():
    signature = request.headers.get('X-Webhook-Signature')
    timestamp = request.headers.get('X-Webhook-Timestamp')
    
    if not verify_webhook(request.json, signature, timestamp, WEBHOOK_SECRET):
        return jsonify({'error': 'Invalid signature'}), 401
    
    order = request.json['order']
    print(f"新訂單: {order['order_number']}")
    
    return jsonify({'received': True})`}
                  </pre>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">PHP 驗證範例</Label>
                  <pre className="p-3 bg-muted rounded text-xs font-mono overflow-x-auto">
{`<?php
function verifyWebhook($payload, $signature, $timestamp, $secret) {
    // 檢查時間戳
    $now = round(microtime(true) * 1000);
    if (abs($now - intval($timestamp)) > 5 * 60 * 1000) {
        return false;
    }
    
    // 計算簽名
    $message = $timestamp . '.' . json_encode($payload);
    $expected = 'sha256=' . hash_hmac('sha256', $message, $secret);
    
    return hash_equals($expected, $signature);
}

// 接收 Webhook
$payload = json_decode(file_get_contents('php://input'), true);
$signature = $_SERVER['HTTP_X_WEBHOOK_SIGNATURE'] ?? '';
$timestamp = $_SERVER['HTTP_X_WEBHOOK_TIMESTAMP'] ?? '';

if (!verifyWebhook($payload, $signature, $timestamp, $webhookSecret)) {
    http_response_code(401);
    echo json_encode(['error' => 'Invalid signature']);
    exit;
}

$order = $payload['order'];
error_log("新訂單: " . $order['order_number']);

echo json_encode(['received' => true]);
?>`}
                  </pre>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">Webhook 回應要求</Label>
                  <div className="space-y-2 text-xs text-muted-foreground">
                    <div className="p-2 bg-muted rounded">
                      <strong>成功回應：</strong>回傳 HTTP 200-299 狀態碼
                    </div>
                    <div className="p-2 bg-muted rounded">
                      <strong>逾時設定：</strong>請在 10 秒內回應，否則視為失敗
                    </div>
                    <div className="p-2 bg-muted rounded">
                      <strong>重試機制：</strong>失敗時系統會在 1 分鐘、5 分鐘、30 分鐘後重試（最多 3 次）
                    </div>
                  </div>
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
                <li>請妥善保管您的折扣碼和 Webhook 密鑰，避免洩露給非授權人員</li>
                <li>API 回應時間通常在 100-500ms 之間</li>
                <li>Webhook 通知為即時發送，建議設定穩定的接收端點</li>
                </ul>
              </div>
            </div>
          </div>
          <DrawerFooter className="px-4">
            <Button onClick={() => setApiDocOpen(false)} className="w-full h-12">關閉</Button>
          </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : (
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
              <div className="space-y-2">
                <h3 className="font-semibold">API Base URL</h3>
                <code className="block p-3 bg-muted rounded text-sm font-mono break-all">
                  https://sensaninn.lakeze.com/functions/v1/kol-api
                </code>
              </div>

              <Separator />

              {/* Authentication */}
              <div className="space-y-3">
                <h3 className="font-semibold">API 金鑰驗證</h3>
                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded">
                  <p className="text-sm text-amber-800 dark:text-amber-200 mb-2">
                    <strong>重要：</strong>所有 API 請求都需要提供 API 金鑰進行驗證
                  </p>
                  <p className="text-xs text-muted-foreground">
                    每個折扣碼都有唯一的 API 金鑰，可以在「查看詳情」中找到並複製
                  </p>
                </div>
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-muted-foreground font-medium">驗證方式（二選一）</p>
                  <div className="space-y-2">
                    <div className="p-2 bg-muted rounded">
                      <p className="text-xs font-medium mb-1">方式一：HTTP Header</p>
                      <code className="text-xs">x-api-key: YOUR_API_KEY</code>
                    </div>
                    <div className="p-2 bg-muted rounded">
                      <p className="text-xs font-medium mb-1">方式二：URL 參數</p>
                      <code className="text-xs">?api_key=YOUR_API_KEY</code>
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Endpoint 1: Get Orders */}
              <div className="space-y-3">
                <h3 className="font-semibold">1. 查詢訂單列表</h3>
                <div className="space-y-2">
                  <p className="text-sm font-medium">端點：</p>
                  <code className="block p-2 bg-muted rounded text-sm font-mono">
                    GET /orders?code=YOUR_DISCOUNT_CODE&api_key=YOUR_API_KEY
                  </code>
                  
                  <p className="text-sm font-medium mt-4">回應範例：</p>
                  <pre className="p-3 bg-muted rounded text-xs overflow-x-auto">
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
      "room_types": { "name": "標準雙人房" }
    }
  ]
}`}
                  </pre>
                </div>
              </div>

              <Separator />

              {/* Endpoint 2: Get Stats */}
              <div className="space-y-3">
                <h3 className="font-semibold">2. 查詢統計數據</h3>
                <div className="space-y-2">
                  <p className="text-sm font-medium">端點：</p>
                  <code className="block p-2 bg-muted rounded text-sm font-mono">
                    GET /stats?code=YOUR_DISCOUNT_CODE&api_key=YOUR_API_KEY
                  </code>
                  
                  <p className="text-sm font-medium mt-4">回應範例：</p>
                  <pre className="p-3 bg-muted rounded text-xs overflow-x-auto">
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
    "commission_rate": 10
  }
}`}
                  </pre>
                </div>
              </div>

              <Separator />

              {/* Endpoint 3: Get Commission Records */}
              <div className="space-y-3">
                <h3 className="font-semibold">3. 查詢佣金記錄</h3>
                <div className="space-y-2">
                  <p className="text-sm font-medium">端點：</p>
                  <code className="block p-2 bg-muted rounded text-sm font-mono">
                    GET /commission?code=YOUR_DISCOUNT_CODE&api_key=YOUR_API_KEY
                  </code>
                  
                  <p className="text-sm font-medium mt-4">回應範例：</p>
                  <pre className="p-3 bg-muted rounded text-xs overflow-x-auto">
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

              <Separator />

              {/* Usage Example */}
              <div className="space-y-3">
                <h3 className="font-semibold">使用範例（JavaScript）</h3>
                <pre className="p-3 bg-muted rounded text-xs overflow-x-auto">
{`// 查詢訂單
const response = await fetch(
  'https://sensaninn.lakeze.com/functions/v1/kol-api/orders?code=YOUR_CODE&api_key=YOUR_API_KEY'
);
const data = await response.json();

// 查詢統計
const statsResponse = await fetch(
  'https://sensaninn.lakeze.com/functions/v1/kol-api/stats?code=YOUR_CODE&api_key=YOUR_API_KEY'
);
const statsData = await statsResponse.json();

// 查詢佣金
const commissionResponse = await fetch(
  'https://sensaninn.lakeze.com/functions/v1/kol-api/commission?code=YOUR_CODE&api_key=YOUR_API_KEY'
);
const commissionData = await commissionResponse.json();`}
                </pre>
              </div>

              <Separator />

              {/* Webhook */}
              <div className="space-y-3">
                <h3 className="font-semibold">Webhook 即時通知</h3>
                <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    當有使用您折扣碼的新訂單成立時，系統會自動發送 Webhook 通知到您設定的 URL
                  </p>
                </div>
                
                <div className="space-y-2">
                  <p className="text-sm font-medium">Webhook 請求格式：</p>
                  <pre className="p-3 bg-muted rounded text-xs overflow-x-auto">
{`POST https://your-webhook-url.com/endpoint
Content-Type: application/json
X-Webhook-Signature: sha256=xxxxxx...
X-Webhook-Timestamp: 1735123456789

{
  "event": "order.created",
  "timestamp": "2024-12-25T10:30:00.000Z",
  "discount_code": "SPRING2024",
  "order": {
    "order_number": "20241225001",
    "order_date": "2024-12-25",
    "check_in_date": "2025-01-15",
    "check_out_date": "2025-01-17",
    "guest_name": "王小明",
    "guest_count": 2,
    "room_type": "標準雙人房",
    "total_price": 5000,
    "discount_amount": 500,
    "final_price": 4500
  }
}`}
                  </pre>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">簽名驗證（Node.js）：</p>
                  <div className="p-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded mb-2">
                    <p className="text-xs text-amber-800 dark:text-amber-200">
                      <strong>重要：</strong>請務必驗證簽名以防止偽造請求
                    </p>
                  </div>
                  <pre className="p-3 bg-muted rounded text-xs overflow-x-auto">
{`const crypto = require('crypto');

function verifyWebhook(payload, signature, timestamp, secret) {
  // 檢查時間戳（5 分鐘內有效）
  if (Math.abs(Date.now() - parseInt(timestamp)) > 5 * 60 * 1000) {
    return false;
  }
  
  // 計算簽名
  const message = timestamp + '.' + JSON.stringify(payload);
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}`}
                  </pre>
                </div>

                <div className="space-y-1 text-xs text-muted-foreground">
                  <p><strong>回應要求：</strong>回傳 HTTP 200-299 狀態碼，10 秒內回應</p>
                  <p><strong>重試機制：</strong>失敗時會在 1 分鐘、5 分鐘、30 分鐘後重試（最多 3 次）</p>
                </div>
              </div>

              <Separator />

              {/* Notes */}
              <div className="space-y-2">
                <h3 className="font-semibold">注意事項</h3>
                <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                  <li><strong>API 金鑰驗證</strong>：所有請求都需要提供有效的 API 金鑰</li>
                  <li><strong>速率限制</strong>：每個 API 金鑰每小時最多 100 次請求</li>
                  <li>回應格式為 JSON</li>
                  <li>佣金根據折扣碼設定的佣金率自動計算</li>
                  <li>結算狀態：pending（待結算）、approved（已核准）、paid（已付款）、cancelled（已取消）</li>
                  <li>建議在外部網站實作快取機制，避免頻繁請求</li>
                  <li>API 支援 CORS，可直接從瀏覽器調用</li>
                  <li>請妥善保管您的 API 金鑰和 Webhook 密鑰，避免洩露給非授權人員</li>
                  <li>Webhook 通知為即時發送，建議設定穩定的接收端點</li>
                </ul>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => setApiDocOpen(false)}>關閉</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}




      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除</AlertDialogTitle>
            <AlertDialogDescription>
              確定要刪除此網紅導購代碼嗎？此操作無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 sm:h-10 touch-manipulation">取消</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90 h-11 sm:h-10 touch-manipulation"
            >
              刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default KolDiscount;
