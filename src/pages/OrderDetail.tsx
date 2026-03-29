import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation, Link } from "react-router-dom";
import { ArrowLeft, Mail, Home, ShoppingBag, Globe, UserPlus, CreditCard, XCircle, Pencil, Save, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { OnlinePaymentDialog } from "@/components/orders/OnlinePaymentDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

interface MealPlanDetail {
  date: string;
  count: number;
  pricePerUnit: number;
  price: number;
}

interface OrderDetail {
  id: string;
  accommodation_id: string;
  order_number: string;
  guest_name: string;
  guest_phone: string;
  guest_email: string | null;
  guest_address: string | null;
  check_in_date: string;
  check_out_date: string;
  guest_count: number;
  order_status: string;
  payment_status: string;
  total_price: number;
  discount_amount: number;
  discount_code: string | null;
  final_price: number;
  deposit_amount: number;
  paid_amount: number;
  payment_method: string | null;
  deposit_payment_method: string | null;
  balance_payment_method: string | null;
  meal_plan: string | null;
  notes: string | null;
  order_date: string;
  room_assigned: boolean;
  pet_count: number;
  pet_plan_price: number;
  meal_plan_details: MealPlanDetail[];
  meal_plan_total: number;
  order_source: string;
  room_type_id: string | null;
  room_types: {
    name: string;
    name_en: string | null;
  } | null;
}

interface CustomMealPlan {
  id: string;
  name: string;
  description: string;
}

interface RoomTypeOption {
  id: string;
  name: string;
}

interface EditFormState {
  guest_name: string;
  guest_phone: string;
  guest_email: string;
  guest_address: string;
  guest_count: number;
  order_source: string;
  order_status: string;
  payment_status: string;
  deposit_payment_method: string;
  balance_payment_method: string;
  meal_plan: string;
  notes: string;
  room_type_id: string;
}

const OrderDetailPage = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = (location.state as any)?.from || "/admin/orders";
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [customMealPlans, setCustomMealPlans] = useState<CustomMealPlan[]>([]);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showPriceEditDialog, setShowPriceEditDialog] = useState(false);
  const [editTotalPrice, setEditTotalPrice] = useState(0);
  const [editDiscountAmount, setEditDiscountAmount] = useState(0);
  const [editDepositAmount, setEditDepositAmount] = useState(0);
  const [editPaidAmount, setEditPaidAmount] = useState(0);
  const [editReason, setEditReason] = useState("");
  const [isSavingPrice, setIsSavingPrice] = useState(false);

  // Edit mode
  const [isEditing, setIsEditing] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [roomTypes, setRoomTypes] = useState<RoomTypeOption[]>([]);
  const [editForm, setEditForm] = useState<EditFormState>({
    guest_name: "",
    guest_phone: "",
    guest_email: "",
    guest_address: "",
    guest_count: 1,
    order_source: "",
    order_status: "",
    payment_status: "",
    deposit_payment_method: "",
    balance_payment_method: "",
    meal_plan: "",
    notes: "",
    room_type_id: "",
  });

  const startEditing = () => {
    if (!order) return;
    setEditForm({
      guest_name: order.guest_name || "",
      guest_phone: order.guest_phone || "",
      guest_email: order.guest_email || "",
      guest_address: order.guest_address || "",
      guest_count: order.guest_count || 1,
      order_source: order.order_source || "website",
      order_status: order.order_status || "pending",
      payment_status: order.payment_status || "unpaid",
      deposit_payment_method: order.deposit_payment_method || "none",
      balance_payment_method: order.balance_payment_method || "none",
      meal_plan: order.meal_plan || "none",
      notes: order.notes || "",
      room_type_id: order.room_type_id || "",
    });
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
  };

  const handleSaveEdit = async () => {
    if (!order) return;
    setIsSavingEdit(true);
    try {
      const updateData: Record<string, any> = {
        guest_name: editForm.guest_name.trim(),
        guest_phone: editForm.guest_phone.trim(),
        guest_email: editForm.guest_email.trim() || null,
        guest_address: editForm.guest_address.trim() || null,
        guest_count: editForm.guest_count,
        order_source: editForm.order_source,
        order_status: editForm.order_status,
        payment_status: editForm.payment_status,
        deposit_payment_method: editForm.deposit_payment_method === "none" ? null : editForm.deposit_payment_method,
        balance_payment_method: editForm.balance_payment_method === "none" ? null : editForm.balance_payment_method,
        meal_plan: editForm.meal_plan === "none" ? null : editForm.meal_plan,
        notes: editForm.notes.trim() || null,
        room_type_id: editForm.room_type_id || null,
      };

      // Handle status timestamp updates
      if (editForm.order_status !== order.order_status) {
        if (editForm.order_status === "confirmed") {
          updateData.confirmed_at = new Date().toISOString();
        }
        if (editForm.order_status === "checked_in") {
          updateData.checked_in_at = new Date().toISOString();
        }
        if (editForm.order_status === "checked_out") {
          updateData.checked_out_at = new Date().toISOString();
        }
        if (editForm.order_status === "cancelled") {
          updateData.cancelled_at = new Date().toISOString();
        }
      }

      const { error } = await supabase
        .from("orders")
        .update(updateData)
        .eq("id", order.id);

      if (error) throw error;

      // Audit log
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from("audit_logs").insert([{
            user_id: user.id,
            user_email: user.email,
            action_type: "update",
            action_category: "order",
            entity_type: "order",
            entity_id: order.id,
            entity_name: order.order_number,
            accommodation_id: order.accommodation_id,
            details: { type: "inline_edit" } as any,
          }]);
        }
      } catch (e) {
        console.error("Audit log error:", e);
      }

      toast({ title: "儲存成功", description: "訂單已更新" });
      setIsEditing(false);
      fetchOrder();
    } catch (error) {
      console.error("儲存失敗:", error);
      toast({ title: "儲存失敗", description: "無法更新訂單，請稍後再試", variant: "destructive" });
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!order) return;
    setIsCancelling(true);
    try {
      const { error } = await supabase
        .from("orders")
        .update({ order_status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("id", order.id);
      if (error) throw error;
      toast({ title: "訂單已取消", description: `訂單 ${order.order_number} 已成功取消` });
      fetchOrder();
    } catch (error) {
      console.error("取消訂單失敗:", error);
      toast({ title: "取消失敗", description: "無法取消訂單，請稍後再試", variant: "destructive" });
    } finally {
      setIsCancelling(false);
    }
  };

  const openPriceEditDialog = () => {
    if (!order) return;
    setEditTotalPrice(order.total_price);
    setEditDiscountAmount(order.discount_amount);
    setEditDepositAmount(order.deposit_amount);
    setEditPaidAmount(order.paid_amount);
    setEditReason("");
    setShowPriceEditDialog(true);
  };

  const editFinalPrice = editTotalPrice - editDiscountAmount;

  const handleSavePriceEdit = async () => {
    if (!order) return;
    if (editFinalPrice < 0) {
      toast({ title: "實收金額不可為負數", variant: "destructive" });
      return;
    }
    setIsSavingPrice(true);
    try {
      const oldValues = {
        total_price: order.total_price,
        discount_amount: order.discount_amount,
        final_price: order.final_price,
        deposit_amount: order.deposit_amount,
        paid_amount: order.paid_amount,
      };
      const newValues = {
        total_price: editTotalPrice,
        discount_amount: editDiscountAmount,
        final_price: editFinalPrice,
        deposit_amount: editDepositAmount,
        paid_amount: editPaidAmount,
      };

      let newPaymentStatus = order.payment_status;
      if (editPaidAmount <= 0) {
        newPaymentStatus = "unpaid";
      } else if (editPaidAmount >= editFinalPrice) {
        newPaymentStatus = "paid";
      } else if (editPaidAmount > 0 && editPaidAmount < editFinalPrice) {
        newPaymentStatus = "deposit_paid";
      }

      const { error } = await supabase
        .from("orders")
        .update({
          total_price: editTotalPrice,
          discount_amount: editDiscountAmount,
          final_price: editFinalPrice,
          deposit_amount: editDepositAmount,
          paid_amount: editPaidAmount,
          payment_status: newPaymentStatus,
          ...(editReason.trim() ? {
            notes: order.notes
              ? `${order.notes}\n\n【金額修改】${editReason.trim()}`
              : `【金額修改】${editReason.trim()}`,
          } : {}),
        })
        .eq("id", order.id);
      if (error) throw error;

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from("audit_logs").insert([{
            user_id: user.id,
            user_email: user.email,
            action_type: "update",
            action_category: "order",
            entity_type: "order",
            entity_id: order.id,
            entity_name: order.order_number,
            accommodation_id: order.accommodation_id,
            details: { type: "price_edit", reason: editReason.trim(), old: oldValues, new: newValues } as any,
          }]);
        }
      } catch (e) {
        console.error("Audit log error:", e);
      }

      toast({ title: "金額修改成功", description: "訂單金額已更新" });
      setShowPriceEditDialog(false);
      fetchOrder();
    } catch (error) {
      console.error("修改金額失敗:", error);
      toast({ title: "修改失敗", description: "無法修改訂單金額，請稍後再試", variant: "destructive" });
    } finally {
      setIsSavingPrice(false);
    }
  };

  const fetchOrder = async () => {
    if (!orderId) return;
    
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("orders")
        .select(`
          *,
          room_types (
            name,
            name_en
          )
        `)
        .eq("id", orderId)
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        const orderData = data as any;
        const orderObj = {
          ...orderData,
          pet_count: orderData.pet_count || 0,
          pet_plan_price: orderData.pet_plan_price || 0,
          meal_plan_details: orderData.meal_plan_details || [],
          meal_plan_total: orderData.meal_plan_total || 0,
        } as OrderDetail;
        setOrder(orderObj);

        // Fetch room types for edit mode
        if (orderData.accommodation_id) {
          const { data: rtData } = await supabase
            .from("room_types")
            .select("id, name")
            .eq("accommodation_id", orderData.accommodation_id)
            .order("display_order", { ascending: true });
          if (rtData) setRoomTypes(rtData);

          const { data: templatesData } = await supabase
            .from("pricing_templates")
            .select("meal_plans")
            .eq("accommodation_id", orderData.accommodation_id)
            .eq("is_default", true)
            .maybeSingle();

          if (templatesData?.meal_plans && Array.isArray(templatesData.meal_plans)) {
            setCustomMealPlans(templatesData.meal_plans as unknown as CustomMealPlan[]);
          }
        }
      }
    } catch (error) {
      console.error("Error fetching order:", error);
      toast({
        title: "載入失敗",
        description: "無法載入訂單資料",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrder();
  }, [orderId]);

  const getPaymentStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; className: string }> = {
      unpaid: { label: "未付款", className: "bg-error-light text-error border-error/20" },
      deposit_paid: { label: "已付訂金", className: "bg-warning-light text-warning border-warning/20" },
      paid: { label: "已付清", className: "bg-success-light text-success border-success/20" },
      overdue: { label: "已逾期", className: "bg-error-light text-error border-error/20" },
      refunded: { label: "已退款", className: "bg-muted text-muted-foreground border-border" },
      partial_refunded: { label: "部分退款", className: "bg-amber-100 text-amber-700 border-amber-200" },
    };
    const config = statusMap[status] || { label: status, className: "bg-muted text-muted-foreground border-border" };
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.className}`}>
        {config.label}
      </span>
    );
  };

  const getOrderStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; className: string }> = {
      pending: { label: "待確認", className: "bg-warning-light text-warning border-warning/20" },
      confirmed: { label: "已確認", className: "bg-primary/10 text-primary border-primary/20" },
      checked_in: { label: "已入住", className: "bg-info-light text-info border-info/20" },
      checked_out: { label: "已退房", className: "bg-muted text-muted-foreground border-border" },
      cancelled: { label: "已取消", className: "bg-error-light text-error border-error/20" },
      hold: { label: "保留中", className: "bg-muted text-muted-foreground border-border" },
    };
    const config = statusMap[status] || { label: status, className: "bg-muted text-muted-foreground border-border" };
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.className}`}>
        {config.label}
      </span>
    );
  };

  const getOrderSourceBadge = (source: string) => {
    const sourceMap: Record<string, { label: string; className: string; icon: typeof Globe }> = {
      website: { label: "官網訂房", className: "bg-blue-100 text-blue-700 border-blue-200", icon: Globe },
      manual: { label: "現場訂房", className: "bg-purple-100 text-purple-700 border-purple-200", icon: UserPlus },
      line: { label: "Line@", className: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: Globe },
      agoda: { label: "Agoda", className: "bg-green-100 text-green-700 border-green-200", icon: Globe },
      booking: { label: "Booking", className: "bg-indigo-100 text-indigo-700 border-indigo-200", icon: Globe },
      trip: { label: "Trip", className: "bg-orange-100 text-orange-700 border-orange-200", icon: Globe },
      travel_agency: { label: "旅行社", className: "bg-teal-100 text-teal-700 border-teal-200", icon: Globe },
      kol: { label: "KOL互惠", className: "bg-pink-100 text-pink-700 border-pink-200", icon: Globe },
    };
    const config = sourceMap[source] || { label: source || "官網訂房", className: "bg-muted text-muted-foreground border-border", icon: Globe };
    const Icon = config.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.className}`}>
        <Icon className="w-3 h-3" />
        {config.label}
      </span>
    );
  };

  const getPaymentMethodDisplayName = (method: string | null) => {
    if (!method) return "-";
    const methodMap: Record<string, string> = {
      credit_card: "信用卡",
      line_pay: "LINE Pay",
      bank_transfer: "轉帳匯款",
      cash: "現金",
      monthly: "月結",
    };
    return methodMap[method] || method;
  };

  const getMealPlanDisplayName = (planId: string | null) => {
    if (!planId) return "-";
    const customPlan = customMealPlans.find(p => p.id === planId);
    if (customPlan) {
      return customPlan.name;
    }
    return planId === "2_meals" ? "一泊二食" : planId === "3_meals" ? "一泊三食" : planId;
  };

  const handleResendConfirmation = async () => {
    if (!order || !order.guest_email) {
      toast({
        title: "無法發送郵件",
        description: "此訂單沒有電子郵件地址",
        variant: "destructive",
      });
      return;
    }

    setIsSendingEmail(true);
    try {
      const mealPlanDetailsForEmail = (order.meal_plan_details || []).map(detail => ({
        date: format(new Date(detail.date), "MM/dd"),
        count: detail.count,
        price: detail.price
      }));

      const { error: emailError } = await supabase.functions.invoke(
        "send-booking-confirmation",
        {
          body: {
            guestName: order.guest_name,
            guestEmail: order.guest_email,
            orderNumber: order.order_number,
            roomName: order.room_types?.name || "房型資訊不完整",
            checkInDate: order.check_in_date,
            checkOutDate: order.check_out_date,
            guestCount: order.guest_count,
            mealPlan: order.meal_plan || "2_meals",
            mealPlanDisplayName: getMealPlanDisplayName(order.meal_plan),
            finalPrice: order.final_price,
            depositAmount: order.deposit_amount,
            paymentMethod: order.payment_method || "未指定",
            petCount: order.pet_count > 0 ? order.pet_count : undefined,
            petPlanPrice: order.pet_plan_price > 0 ? order.pet_plan_price : undefined,
            mealPlanDetails: mealPlanDetailsForEmail.length > 0 ? mealPlanDetailsForEmail : undefined,
            mealPlanTotal: order.meal_plan_total > 0 ? order.meal_plan_total : undefined,
          },
        }
      );

      if (emailError) {
        throw emailError;
      }

      toast({
        title: "郵件發送成功",
        description: `確認信已重新發送至 ${order.guest_email}`,
      });
    } catch (error) {
      console.error("重發確認郵件失敗:", error);
      toast({
        title: "郵件發送失敗",
        description: "無法發送確認郵件，請稍後再試",
        variant: "destructive",
      });
    } finally {
      setIsSendingEmail(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-200px)]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-sm text-muted-foreground">載入中...</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(backTo)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">訂單詳情</h1>
        </div>
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">找不到訂單資料</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const nights = Math.ceil(
    (new Date(order.check_out_date).getTime() - new Date(order.check_in_date).getTime()) / 
    (1000 * 60 * 60 * 24)
  );

  const orderSourceOptions = [
    { value: "website", label: "官網訂房" },
    { value: "manual", label: "現場訂房" },
    { value: "line", label: "Line@" },
    { value: "agoda", label: "Agoda" },
    { value: "booking", label: "Booking" },
    { value: "trip", label: "Trip" },
    { value: "travel_agency", label: "旅行社" },
    { value: "kol", label: "KOL互惠" },
  ];

  const orderStatusOptions = [
    { value: "pending", label: "待確認" },
    { value: "confirmed", label: "已確認" },
    { value: "checked_in", label: "已入住" },
    { value: "checked_out", label: "已退房" },
    { value: "cancelled", label: "已取消" },
    { value: "hold", label: "hold" },
  ];

  const paymentStatusOptions = [
    { value: "unpaid", label: "未付款" },
    { value: "deposit_paid", label: "已付訂金" },
    { value: "paid", label: "已付清" },
    { value: "refunded", label: "已退款" },
    { value: "partial_refunded", label: "部分退款" },
  ];

  const paymentMethodOptions = [
    { value: "none", label: "無" },
    { value: "credit_card", label: "信用卡" },
    { value: "line_pay", label: "LINE Pay" },
    { value: "bank_transfer", label: "轉帳匯款" },
    { value: "cash", label: "現金" },
    { value: "monthly", label: "月結" },
  ];

  return (
    <div className="space-y-4 md:space-y-6">
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
            <BreadcrumbLink className="text-muted-foreground">訂單資訊</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/admin/orders">訂單列表</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>訂單詳情</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2 md:gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(backTo)} className="h-9 w-9 md:h-10 md:w-10">
            <ArrowLeft className="h-4 w-4 md:h-5 md:w-5" />
          </Button>
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold tracking-tight">訂單詳情</h1>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          {isEditing ? (
            <>
              <Button onClick={handleSaveEdit} disabled={isSavingEdit} className="w-full sm:w-auto text-sm">
                <Save className="h-4 w-4 mr-2" />
                {isSavingEdit ? "儲存中..." : "儲存"}
              </Button>
              <Button variant="outline" onClick={cancelEditing} disabled={isSavingEdit} className="w-full sm:w-auto text-sm">
                <X className="h-4 w-4 mr-2" />
                取消編輯
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={startEditing} className="w-full sm:w-auto text-sm">
                <Pencil className="h-4 w-4 mr-2" />
                編輯
              </Button>
              {order.payment_status !== 'paid' && order.order_status !== 'cancelled' && (
                <Button 
                  onClick={() => setShowPaymentDialog(true)}
                  className="w-full sm:w-auto text-sm"
                >
                  <CreditCard className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">線上收款</span>
                  <span className="sm:hidden">收款</span>
                </Button>
              )}
              {order.guest_email && (
                <Button 
                  variant="outline" 
                  onClick={handleResendConfirmation}
                  disabled={isSendingEmail}
                  className="w-full sm:w-auto text-sm"
                >
                  <Mail className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">{isSendingEmail ? "發送中..." : "重發確認信"}</span>
                  <span className="sm:hidden">{isSendingEmail ? "發送中..." : "重發信件"}</span>
                </Button>
              )}
              {order.order_status !== 'cancelled' && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button 
                      variant="ghost-destructive"
                      className="w-full sm:w-auto text-sm"
                      disabled={isCancelling}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      取消訂單
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>確認取消訂單</AlertDialogTitle>
                      <AlertDialogDescription>
                        確定要取消訂單 <span className="font-semibold text-foreground">{order.order_number}</span> 嗎？此操作無法復原。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>返回</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleCancelOrder}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {isCancelling ? "取消中..." : "確認取消"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
        {/* 訂單基本資訊 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base md:text-lg">訂單資訊</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center gap-2">
              <span className="text-xs md:text-sm text-muted-foreground flex-shrink-0">訂單編號</span>
              <span className="font-medium text-sm md:text-base text-right break-all">{order.order_number}</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center gap-2">
              <span className="text-xs md:text-sm text-muted-foreground flex-shrink-0">訂購日期</span>
              <span className="font-medium text-sm md:text-base text-right">{format(new Date(order.order_date), "yyyy-MM-dd HH:mm")}</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center gap-2">
              <span className="text-xs md:text-sm text-muted-foreground flex-shrink-0">訂單來源</span>
              {isEditing ? (
                <Select value={editForm.order_source} onValueChange={(v) => setEditForm(f => ({ ...f, order_source: v }))}>
                  <SelectTrigger className="w-[140px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {orderSourceOptions.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : getOrderSourceBadge(order.order_source)}
            </div>
            <Separator />
            <div className="flex justify-between items-center gap-2">
              <span className="text-xs md:text-sm text-muted-foreground flex-shrink-0">訂單狀態</span>
              {isEditing ? (
                <Select value={editForm.order_status} onValueChange={(v) => setEditForm(f => ({ ...f, order_status: v }))}>
                  <SelectTrigger className="w-[140px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {orderStatusOptions.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : getOrderStatusBadge(order.order_status)}
            </div>
            <Separator />
            <div className="flex justify-between items-center gap-2">
              <span className="text-xs md:text-sm text-muted-foreground flex-shrink-0">付款狀態</span>
              {isEditing ? (
                <Select value={editForm.payment_status} onValueChange={(v) => setEditForm(f => ({ ...f, payment_status: v }))}>
                  <SelectTrigger className="w-[140px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentStatusOptions.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : getPaymentStatusBadge(
                (() => {
                  const o = order as any;
                  const unpaidStatuses = ['unpaid', 'deposit_paid', 'partial'];
                  if (unpaidStatuses.includes(order.payment_status) && o.payment_link_created_at) {
                    const created = new Date(o.payment_link_created_at);
                    if (Date.now() > created.getTime() + 3 * 24 * 60 * 60 * 1000) return 'overdue';
                  }
                  return order.payment_status;
                })()
              )}
            </div>
            {(order.deposit_payment_method || isEditing) && (
              <>
                <Separator />
                <div className="flex justify-between items-center gap-2">
                  <span className="text-xs md:text-sm text-muted-foreground flex-shrink-0">訂金付款方式</span>
                  {isEditing ? (
                    <Select value={editForm.deposit_payment_method} onValueChange={(v) => setEditForm(f => ({ ...f, deposit_payment_method: v }))}>
                      <SelectTrigger className="w-[140px] h-8 text-xs">
                        <SelectValue placeholder="選擇" />
                      </SelectTrigger>
                      <SelectContent>
                        {paymentMethodOptions.map(o => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="font-medium text-sm md:text-base">{getPaymentMethodDisplayName(order.deposit_payment_method)}</span>
                  )}
                </div>
              </>
            )}
            {(order.balance_payment_method || isEditing) && (
              <>
                <Separator />
                <div className="flex justify-between items-center gap-2">
                  <span className="text-xs md:text-sm text-muted-foreground flex-shrink-0">尾款付款方式</span>
                  {isEditing ? (
                    <Select value={editForm.balance_payment_method} onValueChange={(v) => setEditForm(f => ({ ...f, balance_payment_method: v }))}>
                      <SelectTrigger className="w-[140px] h-8 text-xs">
                        <SelectValue placeholder="選擇" />
                      </SelectTrigger>
                      <SelectContent>
                        {paymentMethodOptions.map(o => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="font-medium text-sm md:text-base">{getPaymentMethodDisplayName(order.balance_payment_method)}</span>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* 訂購人資訊 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base md:text-lg">訂購人資訊</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center gap-2">
              <span className="text-xs md:text-sm text-muted-foreground flex-shrink-0">姓名</span>
              {isEditing ? (
                <Input className="w-[200px] h-8 text-sm" value={editForm.guest_name} onChange={(e) => setEditForm(f => ({ ...f, guest_name: e.target.value }))} />
              ) : (
                <span className="font-medium text-sm md:text-base">{order.guest_name}</span>
              )}
            </div>
            <Separator />
            <div className="flex justify-between items-center gap-2">
              <span className="text-xs md:text-sm text-muted-foreground flex-shrink-0">電話</span>
              {isEditing ? (
                <Input className="w-[200px] h-8 text-sm" value={editForm.guest_phone} onChange={(e) => setEditForm(f => ({ ...f, guest_phone: e.target.value }))} />
              ) : (
                <span className="font-medium text-sm md:text-base">{order.guest_phone}</span>
              )}
            </div>
            <Separator />
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-2">
              <span className="text-xs md:text-sm text-muted-foreground flex-shrink-0">Email</span>
              {isEditing ? (
                <Input className="w-[200px] h-8 text-sm" type="email" value={editForm.guest_email} onChange={(e) => setEditForm(f => ({ ...f, guest_email: e.target.value }))} placeholder="選填" />
              ) : (
                <span className="font-medium text-xs md:text-sm break-all sm:text-right">{order.guest_email || "-"}</span>
              )}
            </div>
            <Separator />
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 sm:gap-2">
              <span className="text-xs md:text-sm text-muted-foreground flex-shrink-0">地址</span>
              {isEditing ? (
                <Input className="w-[200px] h-8 text-sm" value={editForm.guest_address} onChange={(e) => setEditForm(f => ({ ...f, guest_address: e.target.value }))} placeholder="選填" />
              ) : (
                <span className="font-medium text-xs md:text-sm break-words sm:text-right sm:max-w-[60%]">{order.guest_address || "-"}</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 住宿資訊 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base md:text-lg">住宿資訊</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center gap-2">
              <span className="text-xs md:text-sm text-muted-foreground flex-shrink-0">房型</span>
              {isEditing ? (
                <Select value={editForm.room_type_id} onValueChange={(v) => setEditForm(f => ({ ...f, room_type_id: v }))}>
                  <SelectTrigger className="w-[200px] h-8 text-xs">
                    <SelectValue placeholder="選擇房型" />
                  </SelectTrigger>
                  <SelectContent>
                    {roomTypes.map(rt => (
                      <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="font-medium text-sm md:text-base text-right">{order.room_types?.name || "-"}</span>
              )}
            </div>
            <Separator />
            <div className="flex justify-between items-center gap-2">
              <span className="text-xs md:text-sm text-muted-foreground flex-shrink-0">入住日期</span>
              <span className="font-medium text-sm md:text-base">{order.check_in_date}</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center gap-2">
              <span className="text-xs md:text-sm text-muted-foreground flex-shrink-0">退房日期</span>
              <span className="font-medium text-sm md:text-base">{order.check_out_date}</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center gap-2">
              <span className="text-xs md:text-sm text-muted-foreground flex-shrink-0">住宿天數</span>
              <span className="font-medium text-sm md:text-base">{nights} 晚</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center gap-2">
              <span className="text-xs md:text-sm text-muted-foreground flex-shrink-0">入住人數</span>
              {isEditing ? (
                <Input className="w-[100px] h-8 text-sm text-right" type="number" min={1} value={editForm.guest_count} onChange={(e) => setEditForm(f => ({ ...f, guest_count: Math.max(1, parseInt(e.target.value) || 1) }))} />
              ) : (
                <span className="font-medium text-sm md:text-base">{order.guest_count} 人</span>
              )}
            </div>
            {(order.meal_plan || isEditing) && (
              <>
                <Separator />
                <div className="flex justify-between items-center gap-2">
                  <span className="text-xs md:text-sm text-muted-foreground flex-shrink-0">餐食方案</span>
                  {isEditing ? (
                    <Select value={editForm.meal_plan} onValueChange={(v) => setEditForm(f => ({ ...f, meal_plan: v }))}>
                      <SelectTrigger className="w-[160px] h-8 text-xs">
                        <SelectValue placeholder="選擇" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">無</SelectItem>
                        <SelectItem value="2_meals">一泊二食</SelectItem>
                        <SelectItem value="3_meals">一泊三食</SelectItem>
                        {customMealPlans.map(mp => (
                          <SelectItem key={mp.id} value={mp.id}>{mp.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="font-medium text-sm md:text-base text-right">{getMealPlanDisplayName(order.meal_plan)}</span>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* 價格資訊 */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base md:text-lg">價格明細</CardTitle>
            {order.order_status !== 'cancelled' && !isEditing && (
              <Button variant="ghost" size="sm" onClick={openPriceEditDialog} className="h-8 px-2">
                <Pencil className="h-3.5 w-3.5 mr-1" />
                <span className="text-xs">修改金額</span>
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center gap-2">
              <span className="text-xs md:text-sm text-muted-foreground flex-shrink-0">原始金額</span>
              <span className="font-medium text-sm md:text-base">NT$ {order.total_price.toLocaleString()}</span>
            </div>
            {order.discount_amount > 0 && (
              <>
                <Separator />
                <div className="flex justify-between items-center gap-2">
                  <span className="text-xs md:text-sm text-muted-foreground flex-shrink-0">折扣金額</span>
                  <span className="font-medium text-sm md:text-base text-destructive">- NT$ {order.discount_amount.toLocaleString()}</span>
                </div>
                {order.discount_code && (
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-xs md:text-sm text-muted-foreground flex-shrink-0">折扣碼</span>
                    <Badge variant="outline" className="text-xs">{order.discount_code}</Badge>
                  </div>
                )}
              </>
            )}
            <Separator />
            <div className="flex justify-between items-center gap-2">
              <span className="text-xs md:text-sm font-semibold">實收金額</span>
              <span className="font-bold text-base md:text-lg">NT$ {order.final_price.toLocaleString()}</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center gap-2">
              <span className="text-xs md:text-sm text-muted-foreground flex-shrink-0">訂金金額</span>
              <span className="font-medium text-sm md:text-base">NT$ {order.deposit_amount.toLocaleString()}</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center gap-2">
              <span className="text-xs md:text-sm text-muted-foreground flex-shrink-0">已付金額</span>
              <span className="font-medium text-sm md:text-base text-primary">NT$ {order.paid_amount.toLocaleString()}</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center gap-2">
              <span className="text-xs md:text-sm text-muted-foreground flex-shrink-0">待付金額</span>
              <span className="font-medium text-sm md:text-base text-destructive">
                NT$ {(order.final_price - order.paid_amount).toLocaleString()}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 加購方案 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base md:text-lg">加購方案</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(order.pet_count > 0 || order.meal_plan_total > 0) ? (
            <>
              {order.pet_count > 0 && (
                <>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-xs md:text-sm font-medium">🐾 寵物方案</span>
                      <Badge variant="outline" className="text-xs">{order.pet_count} 隻 × {nights} 晚</Badge>
                    </div>
                    <div className="flex justify-between items-center gap-2 pl-2 md:pl-4">
                      <span className="text-xs md:text-sm text-muted-foreground">小計</span>
                      <span className="font-medium text-sm md:text-base">NT$ {order.pet_plan_price.toLocaleString()}</span>
                    </div>
                  </div>
                  {order.meal_plan_total > 0 && <Separator />}
                </>
              )}
              
              {order.meal_plan_total > 0 && order.meal_plan_details && order.meal_plan_details.length > 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-xs md:text-sm font-medium">🍖 烤肉餐食方案</span>
                  </div>
                  <div className="pl-2 md:pl-4 space-y-2">
                    {order.meal_plan_details.map((detail, index) => (
                      <div key={index} className="flex justify-between items-center gap-2 text-xs md:text-sm">
                        <span className="text-muted-foreground flex-shrink-0">
                          {format(new Date(detail.date), "yyyy/MM/dd")} - {detail.count} 份
                        </span>
                        <span className="font-medium">NT$ {detail.price.toLocaleString()}</span>
                      </div>
                    ))}
                    <Separator className="my-2" />
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-xs md:text-sm text-muted-foreground">小計</span>
                      <span className="font-medium text-sm md:text-base">NT$ {order.meal_plan_total.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}
              
              <Separator />
              <div className="flex justify-between items-center gap-2 pt-2">
                <span className="text-xs md:text-sm font-semibold">加購總計</span>
                <span className="font-bold text-base md:text-lg text-primary">
                  NT$ {(order.pet_plan_price + order.meal_plan_total).toLocaleString()}
                </span>
              </div>
            </>
          ) : (
            <div className="text-center py-4 md:py-6">
              <p className="text-xs md:text-sm text-muted-foreground">此訂單無加購方案</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 備註 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base md:text-lg">訂單備註</CardTitle>
        </CardHeader>
        <CardContent>
          {isEditing ? (
            <Textarea
              value={editForm.notes}
              onChange={(e) => setEditForm(f => ({ ...f, notes: e.target.value }))}
              rows={4}
              placeholder="輸入備註..."
              className="text-sm"
            />
          ) : (
            order.notes ? (
              <p className="text-xs md:text-sm whitespace-pre-wrap break-words">{order.notes}</p>
            ) : (
              <p className="text-xs md:text-sm text-muted-foreground text-center py-2">無備註</p>
            )
          )}
        </CardContent>
      </Card>

      {/* 線上付款對話框 */}
      <OnlinePaymentDialog
        open={showPaymentDialog}
        onOpenChange={setShowPaymentDialog}
        order={order ? {
          id: order.id,
          order_number: order.order_number,
          guest_name: order.guest_name,
          guest_phone: order.guest_phone,
          guest_email: order.guest_email,
          final_price: order.final_price,
          payment_status: order.payment_status,
          deposit_amount: order.deposit_amount,
          paid_amount: order.paid_amount,
          accommodation_id: order.accommodation_id,
        } : null}
        onPaymentSuccess={fetchOrder}
      />

      {/* 修改金額對話框 */}
      <Dialog open={showPriceEditDialog} onOpenChange={setShowPriceEditDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>修改訂單金額</DialogTitle>
            <DialogDescription>修改訂單 {order?.order_number} 的價格明細</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-total-price">原始金額</Label>
              <Input
                id="edit-total-price"
                type="number"
                min={0}
                value={editTotalPrice}
                onChange={(e) => setEditTotalPrice(Math.max(0, parseInt(e.target.value) || 0))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-discount">折扣金額</Label>
              <Input
                id="edit-discount"
                type="number"
                min={0}
                value={editDiscountAmount}
                onChange={(e) => setEditDiscountAmount(Math.max(0, parseInt(e.target.value) || 0))}
              />
            </div>
            <Separator />
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold">實收金額</span>
              <span className={`font-bold text-lg ${editFinalPrice < 0 ? 'text-destructive' : ''}`}>
                NT$ {editFinalPrice.toLocaleString()}
              </span>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label htmlFor="edit-deposit">訂金金額</Label>
              <Input
                id="edit-deposit"
                type="number"
                min={0}
                value={editDepositAmount}
                onChange={(e) => setEditDepositAmount(Math.max(0, parseInt(e.target.value) || 0))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-paid">已付金額</Label>
              <Input
                id="edit-paid"
                type="number"
                min={0}
                value={editPaidAmount}
                onChange={(e) => setEditPaidAmount(Math.max(0, parseInt(e.target.value) || 0))}
              />
            </div>
            <Separator />
            <div className="space-y-2">
              <Label htmlFor="edit-reason">備註</Label>
              <Textarea
                id="edit-reason"
                placeholder="請填寫修改金額的原因..."
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                maxLength={500}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPriceEditDialog(false)}>取消</Button>
            <Button onClick={handleSavePriceEdit} disabled={isSavingPrice}>
              {isSavingPrice ? "儲存中..." : "確認修改"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrderDetailPage;
