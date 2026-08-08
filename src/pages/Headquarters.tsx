import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { 
  Loader2,
  Home,
  Trash2, 
  Building2, 
  UserCog, 
  Mail, 
  MailCheck,
  Upload,
  CheckCircle2,
  AlertCircle,
  BarChart3,
  Users,
  TrendingUp,
  Settings,
  DollarSign,
  FileText,
  ClipboardList,
  Calculator,
  Clock,
  Database,
  Plus,
  Utensils,
  GripVertical,
  Calendar,
  Download,
  Handshake,
  Activity,
  UserX,
  Plug

} from "lucide-react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";
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
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AccommodationManagement, AccommodationManagementRef } from "@/components/headquarters/AccommodationManagement";
import { OperationalOverview, OperationalOverviewRef } from "@/components/headquarters/OperationalOverview";

import { SystemManagement } from "@/components/headquarters/SystemManagement";
import { SplitManagement, SplitManagementRef } from "@/components/headquarters/SplitManagement";
import { FacilityManagement, FacilityManagementRef } from "@/components/headquarters/FacilityManagement";
import { PartnerManagement, PartnerManagementRef } from "@/components/headquarters/PartnerManagement";
import { MemberManagement, MemberManagementRef } from "@/components/headquarters/MemberManagement";
import { CouponManagement, CouponManagementRef } from "@/components/headquarters/CouponManagement";
import PointRulesManagement from "@/components/headquarters/PointRulesManagement";
import { HQUsersSkeleton } from "@/components/skeletons/HQSkeleton";
import { parseFunctionInvokeError } from "@/utils/parseFunctionError";
import { StaffPermissionsDialog } from "@/components/StaffPermissionsDialog";
import { PermissionTemplatesDialog } from "@/components/PermissionTemplatesDialog";
import { Settings2 } from "lucide-react";

interface UserRole {
  id: string;
  user_id: string;
  accommodation_id: string;
  role: string;
  template_id?: string | null;
  created_at: string;
  updated_at: string;
  user_email?: string;
  user_name?: string;
  status?: 'pending' | 'active';
  statusLabel?: string;
  display_order?: number;
}

interface PermissionTemplate {
  id: string;
  accommodation_id: string;
  name: string;
}

interface GroupedUser {
  user_id: string;
  user_name: string;
  user_email: string;
  status: 'pending' | 'active';
  statusLabel: string;
  display_order: number;
  roles: UserRole[];
}

interface AccommodationInfo {
  id: string;
  name: string;
  type?: string | null;
  registration_number?: string | null;
  country?: string | null;
  region_1?: string | null;
  region_2?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  description?: string | null;
  short_url_alias?: string | null;
  
  header_logo_url?: string | null;
  footer_logo_url?: string | null;
  theme_preset?: string | null;
  is_active?: boolean;
  building_count?: number | null;
  display_order?: number | null;
  created_at?: string;
}

interface BackupLog {
  id: string;
  backup_type: string;
  backup_mode: string;
  base_backup_id: string | null;
  incremental_since: string | null;
  file_path: string;
  file_size: number;
  uncompressed_size: number | null;
  compression_ratio: number | null;
  is_compressed: boolean | null;
  orders_count: number;
  customers_count: number;
  status: string;
  created_at: string;
  updated_at: string;
  accommodation_id: string;
}

// Sortable table row component for drag-and-drop
const SortableUserRow = ({ id, children }: { id: string; children: React.ReactNode }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <TableRow ref={setNodeRef} style={style} className={isDragging ? 'bg-muted' : ''}>
      <TableCell className="w-10 align-top">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded transition-colors"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
      </TableCell>
      {children}
    </TableRow>
  );
};

const Headquarters = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'overview';
  const currentSection = searchParams.get('section') || '';
  
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [accommodations, setAccommodations] = useState<AccommodationInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [selectedAccommodation, setSelectedAccommodation] = useState("");
  const [selectedOverviewAccommodation, setSelectedOverviewAccommodation] = useState("all");
  const [selectedRole, setSelectedRole] = useState<"super_admin" | "hotel_admin" | "staff">("staff");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [overviewTimeRange, setOverviewTimeRange] = useState<"today" | "week" | "month" | "quarter" | "year" | "all">("month");
  
  // Ref for AccommodationManagement
  const accommodationManagementRef = useRef<AccommodationManagementRef>(null);
  // Ref for SplitManagement
  const splitManagementRef = useRef<SplitManagementRef>(null);
  // Ref for FacilityManagement
  const facilityManagementRef = useRef<FacilityManagementRef>(null);
  // Ref for PartnerManagement
  const partnerManagementRef = useRef<PartnerManagementRef>(null);
  const memberManagementRef = useRef<MemberManagementRef>(null);
  const couponManagementRef = useRef<CouponManagementRef>(null);
  // Ref for OperationalOverview
  const overviewRef = useRef<OperationalOverviewRef>(null);

  // Backup states
  const [backups, setBackups] = useState<BackupLog[]>([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<BackupLog | null>(null);
  const [clearExisting, setClearExisting] = useState(false);
  const [backupMode, setBackupMode] = useState<'full' | 'incremental'>('full');
  const [selectedBackupAccommodation, setSelectedBackupAccommodation] = useState("");
  const [deleteRoleDialogOpen, setDeleteRoleDialogOpen] = useState(false);
  const [deletingRoleId, setDeletingRoleId] = useState<string | null>(null);
  const [deleteAccountTarget, setDeleteAccountTarget] = useState<{ userId: string; email: string; name: string } | null>(null);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [removeAccDialogOpen, setRemoveAccDialogOpen] = useState(false);
  const [removeAccId, setRemoveAccId] = useState<string>("");
  const [removingAcc, setRemovingAcc] = useState(false);
  // 二次確認：影響範圍統計與輸入確認字串
  const [deleteAccountImpact, setDeleteAccountImpact] = useState<{ roles: number; perms: number; accNames: string[] } | null>(null);
  const [deleteAccountConfirm, setDeleteAccountConfirm] = useState("");
  const [removeAccImpact, setRemoveAccImpact] = useState<{ roles: number; perms: number; users: number } | null>(null);
  const [removeAccConfirm, setRemoveAccConfirm] = useState("");

  const [permissionsTarget, setPermissionsTarget] = useState<{ userId: string; accommodationId: string } | null>(null);

  const [templatesDialogAccId, setTemplatesDialogAccId] = useState<string | null>(null);
  const [deleteBackupDialogOpen, setDeleteBackupDialogOpen] = useState(false);
  const [deletingBackup, setDeletingBackup] = useState<BackupLog | null>(null);

  // Add role to existing user states
  const [addRoleDialogOpen, setAddRoleDialogOpen] = useState(false);
  const [addRoleUserId, setAddRoleUserId] = useState("");
  const [addRoleAccommodation, setAddRoleAccommodation] = useState("");
  const [addRoleType, setAddRoleType] = useState<"super_admin" | "hotel_admin" | "staff">("staff");
  const [addRoleTemplateId, setAddRoleTemplateId] = useState<string>("");
  const [addRoleSubmitting, setAddRoleSubmitting] = useState(false);

  // Batch assign states
  const [batchMode, setBatchMode] = useState(false);
  const [batchUserIds, setBatchUserIds] = useState<string[]>([]);
  const [batchAccIds, setBatchAccIds] = useState<string[]>([]);
  const [batchUserSearch, setBatchUserSearch] = useState("");
  const [batchAccSearch, setBatchAccSearch] = useState("");
  const [batchOverwrite, setBatchOverwrite] = useState(false);


  const [templates, setTemplates] = useState<PermissionTemplate[]>([]);

  useEffect(() => {
    loadAccommodations();
    loadUserRoles();
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    const { data, error } = await supabase
      .from("permission_templates")
      .select("id, accommodation_id, name")
      .order("display_order", { ascending: true });
    if (!error) setTemplates((data as any) || []);
  };

  const getTemplatesFor = (accommodationId: string) => {
    // 民宿自訂範本 + 全館通用範本（accommodation_id 為 null），同名時民宿自訂優先
    const own = templates.filter((t) => t.accommodation_id === accommodationId);
    const ownNames = new Set(own.map((t) => t.name));
    const global = templates.filter(
      (t) => t.accommodation_id == null && !ownNames.has(t.name),
    );
    return [...own, ...global];
  };

  const getTemplateName = (templateId?: string | null) =>
    templateId ? templates.find((t) => t.id === templateId)?.name : undefined;

  const handleApplyTemplate = async (
    roleId: string,
    userId: string,
    accommodationId: string,
    templateId: string,
  ) => {
    const { error } = await supabase.rpc("apply_template_to_user", {
      _user_id: userId,
      _accommodation_id: accommodationId,
      _template_id: templateId,
    });
    if (error) {
      toast.error(`套用職位失敗：${error.message}`);
      return;
    }
    const tplName = getTemplateName(templateId) || "範本";
    toast.success(`已套用「${tplName}」權限`);
    loadUserRoles();
  };

  const loadAccommodations = async () => {
    const { data, error } = await supabase
      .from("accommodation_info")
      .select("id, name, type, registration_number, country, region_1, region_2, address, phone, email, description, short_url_alias, short_name, header_logo_url, footer_logo_url, theme_preset, is_active, created_at, display_order, building_count, bundled_lock_inventory, package_inventory_as_one")
      .order("display_order", { ascending: true });


    if (error) {
      toast.error("載入民宿列表失敗");
      return;
    }

    setAccommodations(data || []);
  };

  const loadUserRoles = async () => {
    setLoading(true);
    try {
      // First get all user roles
      const { data: rolesData, error: rolesError } = await supabase
        .from("user_roles")
        .select("*")
        .not("accommodation_id", "is", null);

      if (rolesError) throw rolesError;

      if (!rolesData || rolesData.length === 0) {
        setUserRoles([]);
        setLoading(false);
        return;
      }

      // Get unique user IDs
      const userIds = [...new Set(rolesData.map(role => role.user_id))];

      // Fetch user profiles
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, name, last_sign_in_at, display_order")
        .in("id", userIds);

      if (profilesError) {
        if (import.meta.env.DEV) {
          console.error("Error fetching profiles:", profilesError);
        }
      }

      // Map profiles to user roles
      const profilesMap = new Map(
        profilesData?.map(profile => [
          profile.id, 
          { 
            email: profile.email, 
            name: profile.name,
            lastSignInAt: profile.last_sign_in_at,
            displayOrder: profile.display_order ?? 0
          }
        ]) || []
      );

      const rolesWithProfiles = rolesData.map(role => {
        const profile = profilesMap.get(role.user_id);
        const hasLoggedIn = !!profile?.lastSignInAt;
        
        return {
          ...role,
          user_email: profile?.email || "-",
          user_name: profile?.name || "未知",
          status: (hasLoggedIn ? 'active' : 'pending') as 'active' | 'pending',
          statusLabel: hasLoggedIn ? '已啟用' : '待設定密碼',
          display_order: profile?.displayOrder ?? 0,
        };
      });

      setUserRoles(rolesWithProfiles);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Error loading user roles:", error);
      }
      toast.error("載入用戶權限失敗");
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async () => {
    const isSuperAdmin = selectedRole === "super_admin";
    if (!newUserName || !newUserEmail || !selectedRole || (!isSuperAdmin && !selectedAccommodation)) {
      toast.error("請填寫所有欄位");
      return;
    }

    // super_admin doesn't belong to a specific hotel; use first accommodation as placeholder (DB requires non-null)
    const accommodationIdToSend = isSuperAdmin
      ? (accommodations[0]?.id || selectedAccommodation)
      : selectedAccommodation;

    if (!accommodationIdToSend) {
      toast.error("系統尚無任何民宿，無法建立帳號");
      return;
    }

    setIsSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke("create-user", {
        body: {
          name: newUserName,
          email: newUserEmail,
          role: selectedRole,
          accommodationId: accommodationIdToSend,
        },
      });

      if (error) {
        const parsed = await parseFunctionInvokeError(error);
        const msg = parsed.backendError || parsed.message;
        toast.error(msg);
        return;
      }

      if (data?.error) {
        toast.error(data.error);
        return;
      }

      if (!data?.success) {
        toast.error("建立帳號失敗");
        return;
      }

      toast.success("邀請郵件已發送，請通知使用者檢查信箱");
      const newUserId = data?.user?.id;
      if (selectedTemplateId && newUserId && accommodationIdToSend) {
        const { error: tplErr } = await supabase.rpc("apply_template_to_user", {
          _user_id: newUserId,
          _accommodation_id: accommodationIdToSend,
          _template_id: selectedTemplateId,
        });
        if (tplErr) {
          toast.error(`套用職位範本失敗：${tplErr.message}`);
        } else {
          const tplName = getTemplateName(selectedTemplateId);
          toast.success(`已套用「${tplName || "範本"}」權限`);
        }
      }
      setNewUserName("");
      setNewUserEmail("");
      setSelectedAccommodation("");
      setSelectedRole("staff");
      setSelectedTemplateId("");
      loadUserRoles();
    } catch (error: any) {
      if (import.meta.env.DEV) {
        console.error("Error creating user:", error);
      }
      toast.error(error.message || "建立帳號失敗");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteRoleClick = (roleId: string) => {
    setDeletingRoleId(roleId);
    setDeleteRoleDialogOpen(true);
  };

  const handleDeleteRole = async () => {
    if (!deletingRoleId) return;

    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("id", deletingRoleId);

    if (error) {
      toast.error("刪除用戶權限失敗");
      setDeleteRoleDialogOpen(false);
      setDeletingRoleId(null);
      return;
    }

    toast.success("用戶權限已刪除");
    loadUserRoles();
    setDeleteRoleDialogOpen(false);
    setDeletingRoleId(null);
  };

  // 開啟刪除帳號對話框：先撈出影響範圍
  const openDeleteAccountDialog = async (target: { userId: string; email: string; name: string }) => {
    setDeleteAccountTarget(target);
    setDeleteAccountConfirm("");
    setDeleteAccountImpact(null);
    const [rolesRes, permsRes] = await Promise.all([
      supabase.from("user_roles").select("role, accommodation_id").eq("user_id", target.userId),
      supabase
        .from("staff_module_permissions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", target.userId),
    ]);
    const rows = rolesRes.data ?? [];
    const accNames = Array.from(
      new Set(rows.map((r: any) => (r.accommodation_id ? getAccommodationName(r.accommodation_id) : "全館別／總部")))
    );
    setDeleteAccountImpact({ roles: rows.length, perms: permsRes.count ?? 0, accNames });
  };

  // 選擇民宿後：先撈出影響範圍
  const loadRemoveAccImpact = async (accId: string) => {
    setRemoveAccId(accId);
    setRemoveAccConfirm("");
    setRemoveAccImpact(null);
    if (!accId) return;
    const [rolesRes, permsRes] = await Promise.all([
      supabase.from("user_roles").select("user_id").eq("accommodation_id", accId).neq("role", "super_admin"),
      supabase
        .from("staff_module_permissions")
        .select("id", { count: "exact", head: true })
        .eq("accommodation_id", accId),
    ]);
    const rows = rolesRes.data ?? [];
    setRemoveAccImpact({
      roles: rows.length,
      perms: permsRes.count ?? 0,
      users: new Set(rows.map((r: any) => r.user_id)).size,
    });
  };

  // 刪除整個帳號（含所有民宿權限），透過 delete-user Edge Function（需總部管理員）
  const handleDeleteAccount = async () => {
    if (!deleteAccountTarget) return;
    if (deleteAccountConfirm.trim().toLowerCase() !== deleteAccountTarget.email.trim().toLowerCase()) {
      toast.error("請輸入完整 Email 以確認刪除");
      return;
    }

    setDeletingAccount(true);
    try {
      const { data, error } = await supabase.functions.invoke("delete-user", {
        body: { email: deleteAccountTarget.email },
      });
      if (error) throw error;
      if (data && data.success === false) throw new Error(data.error || "刪除帳號失敗");
      toast.success(
        `已刪除帳號 ${deleteAccountTarget.email}（移除 ${data?.removed_roles ?? 0} 筆角色、${data?.removed_module_permissions ?? 0} 筆模組權限）`
      );
      setDeleteAccountTarget(null);
      setDeleteAccountConfirm("");
      setDeleteAccountImpact(null);
      loadUserRoles();

    } catch (e: any) {
      toast.error(`刪除帳號失敗：${e.message ?? "未知錯誤"}`);
    } finally {
      setDeletingAccount(false);
    }
  };

  // 一鍵移除某一家民宿的所有用戶權限（含模組權限設定）
  const handleRemoveAccommodationRoles = async () => {
    if (!removeAccId) return;
    if (removeAccConfirm.trim() !== getAccommodationName(removeAccId).trim()) {
      toast.error("請輸入完整民宿名稱以確認移除");
      return;
    }

    setRemovingAcc(true);
    try {
      const { error: roleError, count } = await supabase
        .from("user_roles")
        .delete({ count: "exact" })
        .eq("accommodation_id", removeAccId)
        .neq("role", "super_admin");
      if (roleError) throw roleError;

      const { error: permError } = await supabase
        .from("staff_module_permissions")
        .delete()
        .eq("accommodation_id", removeAccId);
      if (permError) throw permError;

      toast.success(`已移除 ${getAccommodationName(removeAccId)} 的 ${count ?? 0} 筆用戶權限`);
      setRemoveAccDialogOpen(false);
      setRemoveAccId("");
      setRemoveAccConfirm("");
      setRemoveAccImpact(null);
      loadUserRoles();

    } catch (e: any) {
      toast.error(`移除民宿權限失敗：${e.message ?? "未知錯誤"}`);
    } finally {
      setRemovingAcc(false);
    }
  };



  const handleUpdateRole = async (roleId: string, newRole: "super_admin" | "hotel_admin" | "staff") => {
    const { data, error } = await supabase
      .from("user_roles")
      .update({ role: newRole, template_id: null })
      .eq("id", roleId)
      .select();

    if (error) {
      console.error("[updateRole] failed:", error);
      toast.error(`更新用戶權限失敗：${error.message}`);
      return;
    }

    if (!data || data.length === 0) {
      toast.error("更新失敗：權限不足或找不到該筆角色（請確認您對此館別有管理權限）");
      return;
    }

    toast.success("用戶權限已更新");
    loadUserRoles();
  };

  const handleResendInvite = async (userId: string, userName: string, accommodationId: string) => {
    if (!confirm(`確定要重新發送邀請郵件給 ${userName} 嗎？`)) return;

    try {
      const { data, error } = await supabase.functions.invoke("resend-invite", {
        body: {
          userId,
          accommodationId,
        },
      });

      if (error) throw error;

      if (data?.error) {
        toast.error(data.error);
        return;
      }

      if (data?.success) {
        toast.success("邀請郵件已重新發送");
      } else {
        toast.error("重新發送失敗");
      }
    } catch (error: any) {
      if (import.meta.env.DEV) {
        console.error("Error resending invite:", error);
      }
      toast.error(error.message || "重新發送失敗");
    }
  };

  const handleAddRoleToExistingUser = async () => {
    if (!addRoleUserId || !addRoleType) {
      toast.error("請選擇用戶和角色");
      return;
    }

    // super_admin doesn't need accommodation, others do
    if (addRoleType !== "super_admin" && !addRoleAccommodation) {
      toast.error("請選擇民宿");
      return;
    }

    setAddRoleSubmitting(true);
    try {
      // Check if this role already exists
      const query = supabase
        .from("user_roles")
        .select("id")
        .eq("user_id", addRoleUserId)
        .eq("role", addRoleType);

      if (addRoleType === "super_admin") {
        // For super_admin, check any existing super_admin role
      } else {
        query.eq("accommodation_id", addRoleAccommodation);
      }

      const { data: existing } = await query.limit(1);

      if (existing && existing.length > 0) {
        toast.error("此用戶已擁有該權限");
        return;
      }

      // For super_admin, use the first accommodation as placeholder (required by DB)
      const accommodationId = addRoleType === "super_admin" 
        ? (accommodations[0]?.id || addRoleAccommodation)
        : addRoleAccommodation;

      const { error } = await supabase
        .from("user_roles")
        .insert({
          user_id: addRoleUserId,
          accommodation_id: accommodationId,
          role: addRoleType,
        });

      if (error) {
        console.error("新增權限失敗:", error);
        toast.error(`新增權限失敗: ${error.message}`);
        return;
      }

      toast.success("權限已新增");
      if (addRoleTemplateId && addRoleType !== "super_admin" && addRoleAccommodation) {
        const { error: tplErr } = await supabase.rpc("apply_template_to_user", {
          _user_id: addRoleUserId,
          _accommodation_id: addRoleAccommodation,
          _template_id: addRoleTemplateId,
        });
        if (tplErr) {
          toast.error(`套用職位範本失敗：${tplErr.message}`);
        } else {
          const tplName = getTemplateName(addRoleTemplateId);
          toast.success(`已套用「${tplName || "範本"}」權限`);
        }
      }
      setAddRoleDialogOpen(false);
      setAddRoleUserId("");
      setAddRoleAccommodation("");
      setAddRoleType("staff");
      setAddRoleTemplateId("");
      loadUserRoles();
    } catch (error) {
      toast.error("新增權限失敗");
    } finally {
      setAddRoleSubmitting(false);
    }
  };

  const handleBatchAddRole = async () => {
    if (batchUserIds.length === 0) {
      toast.error("請至少選擇一位用戶");
      return;
    }
    if (addRoleType !== "super_admin" && batchAccIds.length === 0) {
      toast.error("請至少選擇一間民宿");
      return;
    }
    setAddRoleSubmitting(true);
    let created = 0, skipped = 0, updated = 0, failed = 0;
    try {
      // Load all existing roles for selected users in one query
      const { data: existingAll } = await supabase
        .from("user_roles")
        .select("user_id, accommodation_id, role")
        .in("user_id", batchUserIds);
      const existsKey = new Set(
        (existingAll ?? []).map((r: any) =>
          r.role === "super_admin"
            ? `${r.user_id}|super_admin`
            : `${r.user_id}|${r.accommodation_id}|${r.role}`
        )
      );

      const pairs: { user_id: string; accommodation_id: string; applyTpl: boolean; exists: boolean }[] = [];
      for (const uid of batchUserIds) {
        if (addRoleType === "super_admin") {
          const exists = existsKey.has(`${uid}|super_admin`);
          if (exists && !batchOverwrite) { skipped++; continue; }
          pairs.push({ user_id: uid, accommodation_id: accommodations[0]?.id || "", applyTpl: false, exists });
        } else {
          for (const accId of batchAccIds) {
            const exists = existsKey.has(`${uid}|${accId}|${addRoleType}`);
            if (exists && !batchOverwrite) { skipped++; continue; }
            pairs.push({ user_id: uid, accommodation_id: accId, applyTpl: !!addRoleTemplateId, exists });
          }
        }
      }

      const failures: { user: string; acc: string; reason: string }[] = [];
      const nameOfUser = (uid: string) => {
        const r = userRoles.find((x: any) => x.user_id === uid);
        return r?.user_name || r?.user_email || uid.slice(0, 8);
      };
      const nameOfAcc = (aid: string) => accommodations.find(a => a.id === aid)?.name || aid.slice(0, 8);

      for (const p of pairs) {
        if (!p.exists) {
          const { error } = await supabase
            .from("user_roles")
            .insert({ user_id: p.user_id, accommodation_id: p.accommodation_id, role: addRoleType });
          if (error) {
            failed++;
            failures.push({ user: nameOfUser(p.user_id), acc: nameOfAcc(p.accommodation_id), reason: `新增角色失敗：${error.message}` });
            console.error("batch insert failed", error);
            continue;
          }
          created++;
        } else {
          updated++;
        }
        if (p.applyTpl && addRoleTemplateId) {
          const { error: tplErr } = await supabase.rpc("apply_template_to_user", {
            _user_id: p.user_id,
            _accommodation_id: p.accommodation_id,
            _template_id: addRoleTemplateId,
          });
          if (tplErr) {
            console.error("apply template failed", tplErr);
            failed++;
            failures.push({ user: nameOfUser(p.user_id), acc: nameOfAcc(p.accommodation_id), reason: `套用範本失敗：${tplErr.message}` });
          }
        }
      }

      const summary = `批次完成：新增 ${created}${updated ? `，覆蓋 ${updated}` : ""}${skipped ? `，跳過 ${skipped}` : ""}${failed ? `，失敗 ${failed}` : ""}`;
      if (failed > 0) {
        const preview = failures.slice(0, 8).map(f => `• ${f.user} @ ${f.acc}：${f.reason}`).join("\n");
        const more = failures.length > 8 ? `\n…還有 ${failures.length - 8} 筆，請開瀏覽器 Console 查看` : "";
        toast.error(summary, { description: preview + more, duration: 15000 });
        console.table(failures);
      } else {
        toast.success(summary);
      }
      setBatchUserIds([]);
      setBatchAccIds([]);
      loadUserRoles();
    } catch (e) {
      toast.error("批次新增權限失敗");

    } finally {
      setAddRoleSubmitting(false);
    }
  };

  const [dedupeRunning, setDedupeRunning] = useState(false);
  const handleDedupeRoles = async () => {
    if (!confirm("將掃描所有用戶權限，若同一用戶在同一民宿有多個角色，只保留最高權限（總部管理員 > 民宿管理員 > 現場營運），其餘刪除。是否繼續？")) return;
    setDedupeRunning(true);
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("id, user_id, accommodation_id, role");
      if (error) throw error;
      const rank: Record<string, number> = { super_admin: 3, hotel_admin: 2, staff: 1 };
      const groups = new Map<string, any[]>();
      for (const r of data ?? []) {
        if (r.role === "super_admin" || !r.accommodation_id) continue;
        const k = `${r.user_id}|${r.accommodation_id}`;
        const arr = groups.get(k) ?? [];
        arr.push(r);
        groups.set(k, arr);
      }
      const toDelete: string[] = [];
      for (const arr of groups.values()) {
        if (arr.length < 2) continue;
        arr.sort((a, b) => (rank[b.role] ?? 0) - (rank[a.role] ?? 0));
        for (const r of arr.slice(1)) toDelete.push(r.id);
      }
      if (toDelete.length === 0) {
        toast.success("沒有發現重疊權限");
        return;
      }
      const { error: delErr } = await supabase
        .from("user_roles")
        .delete()
        .in("id", toDelete);
      if (delErr) throw delErr;
      toast.success(`已清理 ${toDelete.length} 筆重疊權限（保留最高）`);
      loadUserRoles();
    } catch (e: any) {
      toast.error(`清理失敗：${e.message || e}`);
    } finally {
      setDedupeRunning(false);
    }
  };

  const getAccommodationName = (accommodationId: string) => {
    const accommodation = accommodations.find(a => a.id === accommodationId);
    return accommodation?.name || accommodationId;
  };

  const getRoleLabel = (role: string, templateId?: string | null) => {
    if (role === "staff" && templateId) {
      const tplName = getTemplateName(templateId);
      if (tplName) return tplName;
    }
    switch (role) {
      case "super_admin":
        return "總部管理員";
      case "hotel_admin":
        return "民宿管理員";
      case "staff":
        return "現場營運";
      default:
        return role;
    }
  };

  const getRoleBadgeVariant = (role: string): "destructive" | "info" | "success" => {
    switch (role) {
      case "super_admin":
        return "destructive";
      case "hotel_admin":
        return "info";
      case "staff":
        return "success";
      default:
        return "info";
    }
  };

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  // Group and sort users
  const groupedUsers = useMemo<GroupedUser[]>(() => {
    const accOrder = new Map<string, number>();
    accommodations.forEach((a, idx) => {
      accOrder.set(a.id, a.display_order ?? idx);
    });

    const grouped = userRoles.reduce<Record<string, typeof userRoles>>((acc, role) => {
      const key = role.user_id;
      if (!acc[key]) acc[key] = [];
      acc[key].push(role);
      return acc;
    }, {});

    return Object.values(grouped)
      .map((roles) => {
        const first = roles[0];
        const sortedRoles = [...roles].sort((a, b) => {
          // super_admin (no accommodation) 排最前
          if (!a.accommodation_id && b.accommodation_id) return -1;
          if (a.accommodation_id && !b.accommodation_id) return 1;
          const ao = accOrder.get(a.accommodation_id ?? "") ?? Number.MAX_SAFE_INTEGER;
          const bo = accOrder.get(b.accommodation_id ?? "") ?? Number.MAX_SAFE_INTEGER;
          return ao - bo;
        });
        return {
          user_id: first.user_id,
          user_name: first.user_name || '未知',
          user_email: first.user_email || '-',
          status: first.status || 'pending' as const,
          statusLabel: first.statusLabel || '待設定密碼',
          display_order: first.display_order ?? 0,
          roles: sortedRoles,
        };
      })
      .sort((a, b) => a.display_order - b.display_order);
  }, [userRoles, accommodations]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = groupedUsers.findIndex(u => u.user_id === active.id);
    const newIndex = groupedUsers.findIndex(u => u.user_id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(groupedUsers, oldIndex, newIndex);

    // Optimistic update
    const updatedRoles = [...userRoles];
    reordered.forEach((user, idx) => {
      updatedRoles.forEach(role => {
        if (role.user_id === user.user_id) {
          role.display_order = idx;
        }
      });
    });
    setUserRoles(updatedRoles);

    // Persist to DB
    const updates = reordered.map((user, idx) => 
      supabase.from("profiles").update({ display_order: idx }).eq("id", user.user_id)
    );
    
    const results = await Promise.all(updates);
    const hasError = results.some(r => r.error);
    if (hasError) {
      toast.error("排序儲存失敗");
      loadUserRoles();
    }
  };

  // Backup functions
  const loadBackups = async () => {
    if (!selectedBackupAccommodation) return;

    try {
      setBackupsLoading(true);
      const { data, error } = await supabase
        .from('backup_logs')
        .select('*')
        .eq('accommodation_id', selectedBackupAccommodation)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBackups(data || []);
    } catch (error) {
      console.error('Error loading backups:', error);
      toast.error('載入備份記錄失敗');
    } finally {
      setBackupsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedBackupAccommodation) {
      loadBackups();
    }
  }, [selectedBackupAccommodation]);

  const handleCreateBackup = async () => {
    if (!selectedBackupAccommodation) {
      toast.error("請先選擇民宿");
      return;
    }

    try {
      setCreating(true);
      const { data, error } = await supabase.functions.invoke('backup-data', {
        body: {
          accommodationId: selectedBackupAccommodation,
          backupType: 'manual',
          backupMode,
        },
      });

      if (error) throw error;

      if (data.success) {
        toast.success('備份建立成功', {
          description: `已備份 ${data.backup.ordersCount} 筆訂單和 ${data.backup.customersCount} 筆客戶資料\n壓縮率: ${data.backup.compressionRatio}`,
        });
        loadBackups();
      } else {
        throw new Error(data.error || '備份失敗');
      }
    } catch (error) {
      console.error('Error creating backup:', error);
      toast.error('建立備份失敗', {
        description: error instanceof Error ? error.message : '未知錯誤',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleRestoreBackup = async () => {
    if (!selectedBackupAccommodation || !selectedBackup) return;

    try {
      setRestoring(selectedBackup.id);
      const { data, error } = await supabase.functions.invoke('restore-data', {
        body: {
          accommodationId: selectedBackupAccommodation,
          filePath: selectedBackup.file_path,
          clearExisting,
        },
      });

      if (error) throw error;

      if (data.success) {
        const modeText = data.restored.backupMode === 'incremental' ? '增量' : '完整';
        toast.success(`${modeText}備份還原成功`, {
          description: `已還原 ${data.restored.ordersCount} 筆訂單和 ${data.restored.customersCount} 筆客戶資料`,
        });
        loadBackups();
        setRestoreDialogOpen(false);
        setSelectedBackup(null);
      } else {
        throw new Error(data.error || '還原失敗');
      }
    } catch (error) {
      console.error('Error restoring backup:', error);
      toast.error('還原資料失敗', {
        description: error instanceof Error ? error.message : '未知錯誤',
      });
    } finally {
      setRestoring(null);
    }
  };

  const handleDeleteBackupClick = (backup: BackupLog) => {
    setDeletingBackup(backup);
    setDeleteBackupDialogOpen(true);
  };

  const handleDeleteBackup = async () => {
    if (!selectedBackupAccommodation || !deletingBackup) return;

    try {
      setDeleting(deletingBackup.id);

      // Delete file from storage
      const { error: storageError } = await supabase.storage
        .from('backups')
        .remove([deletingBackup.file_path]);

      if (storageError) throw storageError;

      // Delete log from database
      const { error: dbError } = await supabase
        .from('backup_logs')
        .delete()
        .eq('id', deletingBackup.id);

      if (dbError) throw dbError;

      toast.success('備份已刪除');
      loadBackups();
    } catch (error) {
      console.error('Error deleting backup:', error);
      toast.error('刪除備份失敗');
    } finally {
      setDeleting(null);
      setDeleteBackupDialogOpen(false);
      setDeletingBackup(null);
    }
  };

  const handleCleanupOldBackups = async (dryRun: boolean = false) => {
    try {
      setCleaning(true);
      const { data, error } = await supabase.functions.invoke('cleanup-old-backups', {
        body: {
          retentionDays: 30,
          dryRun,
        },
      });

      if (error) throw error;

      if (data.success) {
        if (dryRun) {
          toast.info('清理預覽', {
            description: data.message,
          });
        } else {
          toast.success('清理完成', {
            description: `已刪除 ${data.deleted} 個舊備份，釋放 ${data.spaceFreed} 空間`,
          });
          loadBackups();
        }
      } else {
        throw new Error(data.error || '清理失敗');
      }
    } catch (error) {
      console.error('Error cleaning up backups:', error);
      toast.error('清理舊備份失敗', {
        description: error instanceof Error ? error.message : '未知錯誤',
      });
    } finally {
      setCleaning(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const calculateTotalStats = () => {
    const totalCompressedSize = backups.reduce((sum, b) => sum + (b.file_size || 0), 0);
    const totalUncompressedSize = backups.reduce((sum, b) => sum + (b.uncompressed_size || b.file_size || 0), 0);
    const avgCompressionRatio = backups.filter(b => b.compression_ratio).length > 0
      ? backups.filter(b => b.compression_ratio).reduce((sum, b) => sum + (b.compression_ratio || 0), 0) / backups.filter(b => b.compression_ratio).length
      : 0;
    const spaceSaved = totalUncompressedSize - totalCompressedSize;

    return {
      totalCompressedSize,
      totalUncompressedSize,
      avgCompressionRatio,
      spaceSaved,
    };
  };

  const stats = calculateTotalStats();

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" />成功</Badge>;
      case 'restored':
        return <Badge variant="secondary" className="gap-1"><Upload className="h-3 w-3" />已還原</Badge>;
      case 'failed':
        return <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" />失敗</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const openRestoreDialog = (backup: BackupLog) => {
    setSelectedBackup(backup);
    setClearExisting(false);
    setRestoreDialogOpen(true);
  };

  // Helper to get page title based on current tab and section
  const getPageTitle = () => {
    const section = searchParams.get('section');
    
    if (currentTab === 'split' && section) {
      switch (section) {
        case 'rules': return '手續費設定';
        case 'details': return '請款明細';
        case 'reports': return '結算報表';
        case 'pending': return '待結算';
      }
    }
    
    if (currentTab === 'system' && section) {
      switch (section) {
        case 'logs': return '操作日誌';
        case 'settings': return '系統設定';
        case 'health': return '系統健康監控';
        case 'api-keys': return '民宿 API Keys';
        case 'owlting': return '奧丁丁服務帳號';
        case 'owlting-config': return '奧丁丁物業設定';
        case 'owlting-push': return '奧丁丁推送監控';
        case 'hotelnabe-verify': return '旭海房型驗證';
      }
    }
    
    switch (currentTab) {
      case 'overview': return '營運分析';
      case 'split': return '金流拆帳';
      case 'accommodations': return '民宿管理';
      case 'facilities': return '設施管理';
      case 'users': return '帳號管理';
      case 'partners': return '合作夥伴';
      case 'system': return '系統管理';
      default: return '營運分析';
    }
  };

  const getPageIcon = () => {
    const section = searchParams.get('section');
    
    if (currentTab === 'split' && section) {
      switch (section) {
        case 'rules': return FileText;
        case 'details': return ClipboardList;
        case 'reports': return Calculator;
        case 'pending': return Clock;
      }
    }
    
    if (currentTab === 'system' && section) {
      switch (section) {
        case 'logs': return FileText;
        case 'backup': return Database;
        case 'settings': return Settings;
        case 'health': return Activity;
        case 'api-keys': return FileText;
        case 'owlting': return Plug;
        case 'owlting-config': return Plug;
        case 'owlting-push': return Activity;
        case 'hotelnabe-verify': return Plug;
      }
    }
    
    switch (currentTab) {
      case 'overview': return BarChart3;
      case 'performance': return TrendingUp;
      case 'split': return DollarSign;
      case 'accommodations': return Building2;
      case 'facilities': return Utensils;
      case 'users': return Users;
      case 'partners': return Handshake;
      case 'system': return Settings;
      default: return BarChart3;
    }
  };

  const getPageDescription = () => {
    const section = searchParams.get('section');
    
    if (currentTab === 'split' && section) {
      switch (section) {
        case 'rules': return '設定各民宿的請款手續費比例';
        case 'details': return '查看所有訂單的請款明細記錄';
        case 'reports': return '統計各民宿分潤金額與結算報表';
        case 'pending': return '處理待結算的分潤請款申請';
      }
    }
    
    if (currentTab === 'system' && section) {
      switch (section) {
        case 'logs': return '記錄系統重要操作，包含用戶、時間和詳細資訊';
        case 'settings': return '設定全平台系統參數';
        case 'health': return '監控 Edge Function、資料庫與外部服務的健康狀況';
        case 'api-keys': return '為各民宿產生 API 金鑰，供其後端系統呼叫';
        case 'owlting': return '管理奧丁丁通路 SOAP API 共用的 WS-Security 服務帳號';
        case 'owlting-config': return '管理各物業的奧丁丁 Hotel Code、訂單即時同步開關，並檢視房型 / 方案代碼與價格範本對應';
        case 'owlting-push': return '監控奧丁丁訂單推送佇列、成功率與失敗紀錄';
        case 'hotelnabe-verify': return '一鍵向旭海正式環境拉房型清單，與我方 numeric_code 比對（唯讀）';
      }
    }
    
    switch (currentTab) {
      case 'overview': return '查看全平台營運數據與分析趨勢';
      case 'split': return '設定各民宿分潤比例與管理請款結算記錄';
      case 'accommodations': return '新增、編輯或停用民宿';
      case 'facilities': return '管理全民宿共用的設施服務項目';
      case 'users': return '邀請新用戶並管理所有帳號的權限設定';
      case 'partners': return '管理點數平台合作夥伴與 API 串接設定';
      case 'system': return '查看系統操作日誌與進行全平台系統設定';
      default: return undefined;
    }
  };

  // Render content based on current tab
  const renderContent = () => {
    switch (currentTab) {
      case 'overview':
        return (
          <OperationalOverview 
            ref={overviewRef}
            accommodations={accommodations} 
            selectedAccommodation={selectedOverviewAccommodation}
            onAccommodationChange={setSelectedOverviewAccommodation}
            timeRange={overviewTimeRange}
            onTimeRangeChange={setOverviewTimeRange}
          />
        );
      case 'split':
        return <SplitManagement ref={splitManagementRef} accommodations={accommodations} />;
      case 'accommodations':
        return (
          <AccommodationManagement
            ref={accommodationManagementRef}
            accommodations={accommodations as any}
            onRefresh={loadAccommodations}
            loading={loading}
          />
        );
      case 'facilities':
        return <FacilityManagement ref={facilityManagementRef} />;
      case 'partners':
        return <PartnerManagement ref={partnerManagementRef} />;
      case 'members':
        return <MemberManagement ref={memberManagementRef} />;
      case 'coupons':
        return <CouponManagement ref={couponManagementRef} />;
      case 'point-rules':
        return <PointRulesManagement />;
      case 'users':
        return (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">邀請新用戶</CardTitle>
                <CardDescription>輸入用戶資訊後，系統將發送邀請郵件至指定信箱</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="userName">名稱</Label>
                    <Input
                      id="userName"
                      type="text"
                      placeholder="請輸入名稱"
                      value={newUserName}
                      onChange={(e) => setNewUserName(e.target.value)}
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="userEmail">Email</Label>
                    <Input
                      id="userEmail"
                      type="email"
                      placeholder="請輸入 Email"
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      disabled={isSubmitting}
                    />
                  </div>
                  {selectedRole !== "super_admin" && (
                    <div className="space-y-2">
                      <Label htmlFor="accommodation">民宿</Label>
                      <Select 
                        value={selectedAccommodation} 
                        onValueChange={setSelectedAccommodation}
                        disabled={isSubmitting}
                      >
                        <SelectTrigger id="accommodation">
                          <SelectValue placeholder="選擇民宿" />
                        </SelectTrigger>
                        <SelectContent>
                          {accommodations.map((accommodation) => (
                            <SelectItem key={accommodation.id} value={accommodation.id}>
                              {accommodation.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="role">角色</Label>
                    <Select
                      value={selectedTemplateId ? `tpl:${selectedTemplateId}` : selectedRole}
                      onValueChange={(value) => {
                        if (value.startsWith("tpl:")) {
                          setSelectedTemplateId(value.slice(4));
                          setSelectedRole("staff");
                        } else {
                          setSelectedTemplateId("");
                          setSelectedRole(value as "super_admin" | "hotel_admin" | "staff");
                        }
                      }}
                      disabled={isSubmitting}
                    >
                      <SelectTrigger id="role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="super_admin">總部管理員</SelectItem>
                        <SelectItem value="hotel_admin">民宿管理員</SelectItem>
                        <SelectItem value="staff">現場營運</SelectItem>
                        {selectedAccommodation && getTemplatesFor(selectedAccommodation).length > 0 && (
                          <div className="px-2 py-1 text-[10px] text-muted-foreground border-t mt-1">職位範本</div>
                        )}
                        {selectedAccommodation && getTemplatesFor(selectedAccommodation).map((t) => (
                          <SelectItem key={t.id} value={`tpl:${t.id}`}>{t.name}</SelectItem>
                        ))}
                        <div className="border-t mt-1 pt-1">
                          <button
                            type="button"
                            className="w-full text-left px-2 py-1.5 text-xs text-primary hover:bg-accent rounded"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              if (selectedAccommodation) {
                                setTemplatesDialogAccId(selectedAccommodation);
                              } else {
                                toast.error("請先選擇民宿");
                              }
                            }}
                          >
                            ＋ 管理職位範本…
                          </button>
                        </div>
                      </SelectContent>

                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button 
                      onClick={handleAddUser} 
                      className="w-full"
                      disabled={isSubmitting}
                    >
                      {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      發送邀請
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <CardTitle className="text-lg">為現有用戶新增權限</CardTitle>
                    <CardDescription>
                      {batchMode
                        ? "一次選擇多位用戶與多間民宿，批次分配相同角色/範本"
                        : "直接為已存在的帳號新增民宿權限或總部管理員權限，無需發送邀請信"}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="batch-mode" className="text-sm text-muted-foreground cursor-pointer">批次模式</Label>
                    <Switch
                      id="batch-mode"
                      checked={batchMode}
                      onCheckedChange={(v) => {
                        setBatchMode(v);
                        setBatchUserIds([]);
                        setBatchAccIds([]);
                      }}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {!batchMode ? (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label>選擇用戶</Label>
                    <Select value={addRoleUserId} onValueChange={setAddRoleUserId}>
                      <SelectTrigger>
                        <SelectValue placeholder="選擇用戶" />
                      </SelectTrigger>
                      <SelectContent>
                        {(() => {
                          const uniqueUsers = new Map<string, { id: string; name: string; email: string }>();
                          userRoles.forEach((r) => {
                            if (!uniqueUsers.has(r.user_id)) {
                              uniqueUsers.set(r.user_id, { id: r.user_id, name: r.user_name || "未知", email: r.user_email || "" });
                            }
                          });
                          return Array.from(uniqueUsers.values()).map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.name} ({u.email})
                            </SelectItem>
                          ));
                        })()}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>角色</Label>
                    <Select
                      value={addRoleTemplateId ? `tpl:${addRoleTemplateId}` : addRoleType}
                      onValueChange={(v) => {
                        if (v.startsWith("tpl:")) {
                          setAddRoleTemplateId(v.slice(4));
                          setAddRoleType("staff");
                        } else {
                          setAddRoleTemplateId("");
                          setAddRoleType(v as "super_admin" | "hotel_admin" | "staff");
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="super_admin">總部管理員</SelectItem>
                        <SelectItem value="hotel_admin">民宿管理員</SelectItem>
                        <SelectItem value="staff">現場營運</SelectItem>
                        {addRoleAccommodation && getTemplatesFor(addRoleAccommodation).length > 0 && (
                          <div className="px-2 py-1 text-[10px] text-muted-foreground border-t mt-1">職位範本</div>
                        )}
                        {addRoleAccommodation && getTemplatesFor(addRoleAccommodation).map((t) => (
                          <SelectItem key={t.id} value={`tpl:${t.id}`}>{t.name}</SelectItem>
                        ))}
                        <div className="border-t mt-1 pt-1">
                          <button
                            type="button"
                            className="w-full text-left px-2 py-1.5 text-xs text-primary hover:bg-accent rounded"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              if (addRoleAccommodation) {
                                setTemplatesDialogAccId(addRoleAccommodation);
                              } else {
                                toast.error("請先選擇民宿");
                              }
                            }}
                          >
                            ＋ 管理職位範本…
                          </button>
                        </div>
                      </SelectContent>

                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>民宿{addRoleType === "super_admin" && <span className="text-muted-foreground text-xs ml-1">(非必填)</span>}</Label>
                    <Select value={addRoleAccommodation} onValueChange={setAddRoleAccommodation} disabled={addRoleType === "super_admin"}>
                      <SelectTrigger>
                        <SelectValue placeholder={addRoleType === "super_admin" ? "總部管理員無需選擇" : "選擇民宿"} />
                      </SelectTrigger>
                      <SelectContent>
                        {accommodations.map((acc) => (
                          <SelectItem key={acc.id} value={acc.id}>
                            {acc.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button
                      onClick={handleAddRoleToExistingUser}
                      className="w-full"
                      disabled={addRoleSubmitting}
                    >
                      {addRoleSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      新增權限
                    </Button>
                  </div>
                </div>
                ) : (() => {
                  const uniqueUsers = (() => {
                    const m = new Map<string, { id: string; name: string; email: string }>();
                    userRoles.forEach((r) => {
                      if (!m.has(r.user_id)) {
                        m.set(r.user_id, { id: r.user_id, name: r.user_name || "未知", email: r.user_email || "" });
                      }
                    });
                    return Array.from(m.values());
                  })();
                  const filteredUsers = uniqueUsers.filter((u) => {
                    const q = batchUserSearch.trim().toLowerCase();
                    if (!q) return true;
                    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
                  });
                  const filteredAccs = accommodations.filter((a) => {
                    const q = batchAccSearch.trim().toLowerCase();
                    if (!q) return true;
                    return (a.name || "").toLowerCase().includes(q);
                  });
                  const templateAccId = batchAccIds[0] || "";
                  const toggle = (arr: string[], id: string, setter: (v: string[]) => void) => {
                    setter(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
                  };
                  return (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Users multi-select */}
                        <div className="space-y-2">
                          <Label>選擇用戶（可多選）</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" className="w-full justify-between">
                                <span className="truncate">
                                  {batchUserIds.length === 0
                                    ? "選擇用戶"
                                    : `已選 ${batchUserIds.length} 位用戶`}
                                </span>
                                <Users className="h-4 w-4 ml-2 opacity-60" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[320px] p-0" align="start">
                              <div className="p-2 border-b space-y-2">
                                <Input
                                  placeholder="搜尋姓名或 Email"
                                  value={batchUserSearch}
                                  onChange={(e) => setBatchUserSearch(e.target.value)}
                                  className="h-8"
                                />
                                <div className="flex items-center justify-between text-xs">
                                  <button
                                    type="button"
                                    className="text-primary hover:underline"
                                    onClick={() => setBatchUserIds(filteredUsers.map((u) => u.id))}
                                  >
                                    全選 ({filteredUsers.length})
                                  </button>
                                  <button
                                    type="button"
                                    className="text-muted-foreground hover:underline"
                                    onClick={() => setBatchUserIds([])}
                                  >
                                    清空
                                  </button>
                                </div>
                              </div>
                              <div className="max-h-64 overflow-auto p-1">
                                {filteredUsers.length === 0 ? (
                                  <div className="text-center text-sm text-muted-foreground py-4">無符合用戶</div>
                                ) : filteredUsers.map((u) => (
                                  <label
                                    key={u.id}
                                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer"
                                  >
                                    <Checkbox
                                      checked={batchUserIds.includes(u.id)}
                                      onCheckedChange={() => toggle(batchUserIds, u.id, setBatchUserIds)}
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm truncate">{u.name}</div>
                                      <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                                    </div>
                                  </label>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
                        </div>

                        {/* Role/template */}
                        <div className="space-y-2">
                          <Label>角色</Label>
                          <Select
                            value={addRoleTemplateId ? `tpl:${addRoleTemplateId}` : addRoleType}
                            onValueChange={(v) => {
                              if (v.startsWith("tpl:")) {
                                setAddRoleTemplateId(v.slice(4));
                                setAddRoleType("staff");
                              } else {
                                setAddRoleTemplateId("");
                                setAddRoleType(v as "super_admin" | "hotel_admin" | "staff");
                              }
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="super_admin">總部管理員</SelectItem>
                              <SelectItem value="hotel_admin">民宿管理員</SelectItem>
                              <SelectItem value="staff">現場營運</SelectItem>
                              {templateAccId && getTemplatesFor(templateAccId).length > 0 && (
                                <div className="px-2 py-1 text-[10px] text-muted-foreground border-t mt-1">
                                  職位範本（依第一間選擇之民宿）
                                </div>
                              )}
                              {templateAccId && getTemplatesFor(templateAccId).map((t) => (
                                <SelectItem key={t.id} value={`tpl:${t.id}`}>{t.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Accommodations multi-select */}
                        <div className="space-y-2">
                          <Label>
                            民宿（可多選）
                            {addRoleType === "super_admin" && (
                              <span className="text-muted-foreground text-xs ml-1">(總部管理員無需選擇)</span>
                            )}
                          </Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                className="w-full justify-between"
                                disabled={addRoleType === "super_admin"}
                              >
                                <span className="truncate">
                                  {addRoleType === "super_admin"
                                    ? "不需選擇"
                                    : batchAccIds.length === 0
                                      ? "選擇民宿"
                                      : `已選 ${batchAccIds.length} 間民宿`}
                                </span>
                                <Building2 className="h-4 w-4 ml-2 opacity-60" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[320px] p-0" align="start">
                              <div className="p-2 border-b space-y-2">
                                <Input
                                  placeholder="搜尋民宿"
                                  value={batchAccSearch}
                                  onChange={(e) => setBatchAccSearch(e.target.value)}
                                  className="h-8"
                                />
                                <div className="flex items-center justify-between text-xs">
                                  <button
                                    type="button"
                                    className="text-primary hover:underline"
                                    onClick={() => setBatchAccIds(filteredAccs.map((a) => a.id))}
                                  >
                                    全選 ({filteredAccs.length})
                                  </button>
                                  <button
                                    type="button"
                                    className="text-muted-foreground hover:underline"
                                    onClick={() => setBatchAccIds([])}
                                  >
                                    清空
                                  </button>
                                </div>
                              </div>
                              <div className="max-h-64 overflow-auto p-1">
                                {filteredAccs.length === 0 ? (
                                  <div className="text-center text-sm text-muted-foreground py-4">無符合民宿</div>
                                ) : filteredAccs.map((a) => (
                                  <label
                                    key={a.id}
                                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer"
                                  >
                                    <Checkbox
                                      checked={batchAccIds.includes(a.id)}
                                      onCheckedChange={() => toggle(batchAccIds, a.id, setBatchAccIds)}
                                    />
                                    <div className="text-sm truncate">{a.name}</div>
                                  </label>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t">
                        <div className="space-y-2">
                          <p className="text-xs text-muted-foreground">
                            {addRoleType === "super_admin"
                              ? `將為 ${batchUserIds.length} 位用戶新增總部管理員權限。`
                              : `將處理 ${batchUserIds.length * batchAccIds.length} 筆權限（用戶 × 民宿）。`}
                            {batchOverwrite ? "已存在者將覆蓋為新設定。" : "已存在者將自動略過。"}
                          </p>
                          <div className="flex items-center gap-2">
                            <Switch
                              id="batch-overwrite"
                              checked={batchOverwrite}
                              onCheckedChange={setBatchOverwrite}
                            />
                            <Label htmlFor="batch-overwrite" className="text-sm cursor-pointer">
                              覆蓋已存在者（重新套用職位範本 / 權限）
                            </Label>
                          </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <Button
                            variant="outline"
                            onClick={handleDedupeRoles}
                            disabled={dedupeRunning}
                          >
                            {dedupeRunning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            清理重疊權限（保留最高）
                          </Button>
                          <Button
                            onClick={handleBatchAddRole}
                            disabled={addRoleSubmitting}
                          >
                            {addRoleSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            批次新增權限
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>


            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1.5">
                  <CardTitle className="text-lg">用戶權限列表</CardTitle>
                  <CardDescription>查看和管理所有用戶的權限設定</CardDescription>
                </div>
                <Button
                  variant="outline"
                  className="gap-2 text-destructive hover:text-destructive w-fit"
                  onClick={() => { setRemoveAccId(""); setRemoveAccDialogOpen(true); }}
                >
                  <Building2 className="h-4 w-4" />
                  一鍵移除民宿權限
                </Button>
              </CardHeader>

              <CardContent>
                {loading ? (
                  <HQUsersSkeleton />
                ) : userRoles.length === 0 ? (
                  <EmptyState
                    icon={UserCog}
                    title="尚無用戶權限資料"
                    description="這裡會顯示所有民宿的用戶權限資訊"
                  />
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    modifiers={[restrictToVerticalAxis]}
                    onDragEnd={handleDragEnd}
                  >
                    <div className="table-scroll-container overflow-x-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="text-sm w-10"></TableHead>
                            <TableHead className="text-sm">用戶名稱</TableHead>
                            <TableHead className="text-sm">Email</TableHead>
                            <TableHead className="text-sm">狀態</TableHead>
                            <TableHead className="text-sm">民宿 / 角色</TableHead>
                            <TableHead className="text-sm pl-2">切換角色</TableHead>
                            <TableHead className="text-sm text-center">操作</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <SortableContext items={groupedUsers.map(u => u.user_id)} strategy={verticalListSortingStrategy}>
                            {groupedUsers.map((user) => {
                              const superAdminRoles = user.roles.filter(r => r.role === 'super_admin');
                              const otherRoles = user.roles.filter(r => r.role !== 'super_admin');
                              const displayRoles = [
                                ...(superAdminRoles.length > 0 ? [superAdminRoles[0]] : []),
                                ...otherRoles
                              ];
                              return (
                                <SortableUserRow key={user.user_id} id={user.user_id}>
                                  <TableCell className="font-medium text-sm align-top">
                                    {user.user_name}
                                  </TableCell>
                                  <TableCell className="text-sm align-top">
                                    {user.user_email}
                                  </TableCell>
                                  <TableCell className="text-sm align-top">
                                    <Badge 
                                      variant={user.status === 'active' ? 'default' : 'secondary'}
                                      className="gap-1"
                                    >
                                      {user.status === 'active' ? (
                                        <MailCheck className="h-3 w-3" />
                                      ) : (
                                        <Mail className="h-3 w-3" />
                                      )}
                                      {user.statusLabel}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-sm align-top">
                                    <div className="flex flex-col gap-4">
                                      {displayRoles.map((r) => (
                                        <div key={r.id} className="h-10 flex items-center gap-2">
                                          <span className="w-[100px] text-muted-foreground shrink-0 truncate">
                                            {r.role === 'super_admin' ? '總部' : getAccommodationName(r.accommodation_id)}
                                          </span>
                                          <Badge variant={getRoleBadgeVariant(r.role)} className="shrink-0">
                                            {getRoleLabel(r.role, r.template_id)}
                                          </Badge>
                                        </div>
                                      ))}
                                      {user.roles.some(r => r.status === 'pending') && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="gap-1 text-xs w-fit"
                                          onClick={() => handleResendInvite(user.user_id, user.user_name, user.roles[0].accommodation_id)}
                                        >
                                          <Mail className="h-3.5 w-3.5 text-primary" />
                                          重新發送邀請
                                        </Button>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-sm align-top pl-2">
                                    <div className="flex flex-col gap-4">
                                      {displayRoles.map((r) => (
                                        <div key={r.id} className="h-10 flex items-center">
                                          <Select
                                            value={r.role === 'staff' && r.template_id ? `tpl:${r.template_id}` : r.role}
                                            onValueChange={(value) => {
                                              if (value.startsWith('tpl:')) {
                                                handleApplyTemplate(r.id, r.user_id, r.accommodation_id, value.slice(4));
                                              } else {
                                                handleUpdateRole(r.id, value as "super_admin" | "hotel_admin" | "staff");
                                              }
                                            }}
                                          >
                                            <SelectTrigger className="w-[150px] h-7 text-xs">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="super_admin">總部管理員</SelectItem>
                                              <SelectItem value="hotel_admin">民宿管理員</SelectItem>
                                              <SelectItem value="staff">現場營運</SelectItem>
                                              {getTemplatesFor(r.accommodation_id).length > 0 && (
                                                <div className="px-2 py-1 text-[10px] text-muted-foreground border-t mt-1">職位範本</div>
                                              )}
                                              {getTemplatesFor(r.accommodation_id).map((t) => (
                                                <SelectItem key={t.id} value={`tpl:${t.id}`}>{t.name}</SelectItem>
                                              ))}
                                              <div className="border-t mt-1 pt-1">
                                                <button
                                                  type="button"
                                                  className="w-full text-left px-2 py-1.5 text-xs text-primary hover:bg-accent rounded"
                                                  onMouseDown={(e) => {
                                                    e.preventDefault();
                                                    setTemplatesDialogAccId(r.accommodation_id);
                                                  }}
                                                >
                                                  ＋ 管理職位範本…
                                                </button>
                                              </div>
                                            </SelectContent>
                                          </Select>
                                        </div>
                                      ))}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-sm align-top">
                                    <div className="flex flex-col gap-4">
                                      {displayRoles.map((r) => (
                                        <div key={r.id} className="h-10 flex items-center justify-center gap-1">
                                          {r.role !== 'super_admin' && r.accommodation_id && (
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-7 w-7 shrink-0"
                                              title="設定模組權限"
                                              onClick={() => setPermissionsTarget({ userId: r.user_id, accommodationId: r.accommodation_id })}
                                            >
                                              <Settings2 className="h-3.5 w-3.5" />
                                            </Button>
                                          )}
                                          <Button
                                            variant="ghost-destructive"
                                            size="icon"
                                            className="h-7 w-7 shrink-0"
                                            onClick={() => handleDeleteRoleClick(r.id)}
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </Button>
                                        </div>
                                      ))}
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="gap-1 text-xs w-fit self-center text-destructive hover:text-destructive"
                                        onClick={() => openDeleteAccountDialog({
                                          userId: user.user_id,
                                          email: user.user_email,
                                          name: user.user_name,
                                        })}

                                      >
                                        <UserX className="h-3.5 w-3.5" />
                                        刪除帳號
                                      </Button>
                                    </div>

                                  </TableCell>

                                </SortableUserRow>
                              );
                            })}
                          </SortableContext>
                        </TableBody>
                      </Table>
                    </div>
                  </DndContext>
                )}
              </CardContent>
            </Card>
            {permissionsTarget && (
              <StaffPermissionsDialog
                open={!!permissionsTarget}
                onOpenChange={(o) => { if (!o) setPermissionsTarget(null); }}
                userId={permissionsTarget.userId}
                accommodationId={permissionsTarget.accommodationId}
              />
            )}
            {templatesDialogAccId && (
              <PermissionTemplatesDialog
                open={!!templatesDialogAccId}
                onOpenChange={(o) => { if (!o) setTemplatesDialogAccId(null); }}
                accommodationId={templatesDialogAccId}
                accommodationName={accommodations.find((a) => a.id === templatesDialogAccId)?.name}
                accommodations={accommodations.map((a) => ({ id: a.id, name: a.name }))}
                onChanged={loadTemplates}
              />
            )}
          </div>
        );
      case 'system':
        return <SystemManagement accommodations={accommodations} />;
      default:
        return (
          <OperationalOverview 
            ref={overviewRef}
            accommodations={accommodations} 
            selectedAccommodation={selectedOverviewAccommodation}
            onAccommodationChange={setSelectedOverviewAccommodation}
            timeRange={overviewTimeRange}
            onTimeRangeChange={setOverviewTimeRange}
          />
        );
    }
  };

  // Get parent tab title for breadcrumb
  const getParentTabTitle = () => {
    switch (currentTab) {
      case 'overview': return '營運分析';
      case 'split': return '金流拆帳';
      case 'accommodations': return '民宿管理';
      case 'users': return '帳號管理';
      case 'partners': return '合作夥伴';
      case 'system': return '系統管理';
      default: return '營運分析';
    }
  };

  // Check if current view has a sub-section
  const hasSubSection = () => {
    const section = searchParams.get('section');
    return (currentTab === 'split' || currentTab === 'system') && section;
  };

  return (
    <div className="admin-theme space-y-6 md:space-y-8">
      <div className="space-y-4 md:space-y-5">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink 
                href="/hq" 
                onClick={(e) => {
                  e.preventDefault();
                  navigate('/hq?tab=overview');
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <Home className="h-4 w-4" />
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            {hasSubSection() ? (
              <>
                <BreadcrumbItem>
                  <BreadcrumbLink 
                    href={`/hq?tab=${currentTab}`}
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(`/hq?tab=${currentTab}`);
                    }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {getParentTabTitle()}
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{getPageTitle()}</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            ) : (
              <BreadcrumbItem>
                <BreadcrumbPage>{getPageTitle()}</BreadcrumbPage>
              </BreadcrumbItem>
            )}
          </BreadcrumbList>
        </Breadcrumb>
        <PageHeader
          title={getPageTitle()}
          description={getPageDescription()}
          icon={getPageIcon()}
          action={
            currentTab === 'overview' ? (
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <Select value={selectedOverviewAccommodation} onValueChange={setSelectedOverviewAccommodation}>
                  <SelectTrigger className="w-[160px] bg-background">
                    <SelectValue placeholder="選擇民宿" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border shadow-lg z-50">
                    <SelectItem value="all">全部民宿</SelectItem>
                    {accommodations.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={overviewTimeRange} onValueChange={(v) => setOverviewTimeRange(v as typeof overviewTimeRange)}>
                  <SelectTrigger className="w-[140px] bg-background">
                    <Calendar className="h-4 w-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background border shadow-lg z-50">
                    <SelectItem value="today">今日</SelectItem>
                    <SelectItem value="week">本週</SelectItem>
                    <SelectItem value="month">本月</SelectItem>
                    <SelectItem value="quarter">本季</SelectItem>
                    <SelectItem value="year">本年</SelectItem>
                    <SelectItem value="all">全部時間</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={() => overviewRef.current?.exportCSV()} className="gap-2">
                  <Download className="h-4 w-4" />
                  匯出 CSV
                </Button>
              </div>
            ) : currentTab === 'accommodations' ? (
              <Button 
                onClick={() => accommodationManagementRef.current?.openAddDialog()} 
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                新增民宿
              </Button>
            ) : currentTab === 'split' && (currentSection === 'rules' || !currentSection) ? (
              <Button 
                onClick={() => splitManagementRef.current?.openAddRuleDialog()} 
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                新增民宿
              </Button>
            ) : currentTab === 'facilities' ? (
              <Button 
                onClick={() => facilityManagementRef.current?.openAddDialog()} 
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                新增設施
              </Button>
            ) : currentTab === 'partners' ? (
              <Button 
                onClick={() => partnerManagementRef.current?.openCreateDialog()} 
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                新增合作夥伴
              </Button>
            ) : currentTab === 'coupons' ? (
              <Button 
                onClick={() => couponManagementRef.current?.openCreateDialog()} 
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                新增優惠券
              </Button>
            ) : undefined
          }
        />
      </div>

      {renderContent()}

      {/* Restore Dialog */}
      <AlertDialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認還原備份？</AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>
                即將還原以下備份的資料：
              </p>
              {selectedBackup && (
                <div className="p-3 bg-muted rounded-lg space-y-2 text-sm">
                  <div>備份時間: {format(new Date(selectedBackup.created_at), 'PPP HH:mm', { locale: zhTW })}</div>
                  <div>訂單數量: {selectedBackup.orders_count} 筆</div>
                  <div>客戶數量: {selectedBackup.customers_count} 筆</div>
                </div>
              )}
              <div className="flex items-center space-x-2 pt-2">
                <Switch
                  id="clear-existing"
                  checked={clearExisting}
                  onCheckedChange={setClearExisting}
                />
                <Label htmlFor="clear-existing" className="cursor-pointer">
                  還原前先清除現有資料（會完全替換現有資料）
                </Label>
              </div>
              <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg">
                <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-500 mt-0.5" />
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  {clearExisting 
                    ? '警告：這將刪除所有現有的訂單和客戶資料，並用備份資料替換。此操作無法復原！'
                    : '如果備份中的資料與現有資料有相同的 ID，將會更新現有資料。'
                  }
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring !== null}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRestoreBackup}
              disabled={restoring !== null}
              className="gap-2"
            >
              {restoring ? (
                <>處理中...</>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  確認還原
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteRoleDialogOpen} onOpenChange={setDeleteRoleDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除</AlertDialogTitle>
            <AlertDialogDescription>確定要刪除此用戶的權限嗎？此操作無法復原。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 sm:h-10 touch-manipulation">取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteRole} className="bg-destructive hover:bg-destructive/90 h-11 sm:h-10 touch-manipulation">刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteAccountTarget} onOpenChange={(o) => { if (!o) setDeleteAccountTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除帳號</AlertDialogTitle>
            <AlertDialogDescription>
              確定要刪除「{deleteAccountTarget?.name}」（{deleteAccountTarget?.email}）的帳號嗎？
              帳號與其所有民宿權限將一併移除，此操作無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 sm:h-10 touch-manipulation" disabled={deletingAccount}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDeleteAccount(); }}
              disabled={deletingAccount}
              className="bg-destructive hover:bg-destructive/90 h-11 sm:h-10 touch-manipulation"
            >
              {deletingAccount && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              刪除帳號
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={removeAccDialogOpen} onOpenChange={setRemoveAccDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>一鍵移除民宿權限</AlertDialogTitle>
            <AlertDialogDescription>
              選擇民宿後，將移除所有用戶在該民宿的角色與模組權限（不影響總部管理員與帳號本身）。此操作無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Select value={removeAccId} onValueChange={setRemoveAccId}>
              <SelectTrigger>
                <SelectValue placeholder="選擇民宿" />
              </SelectTrigger>
              <SelectContent>
                {accommodations.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 sm:h-10 touch-manipulation" disabled={removingAcc}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleRemoveAccommodationRoles(); }}
              disabled={removingAcc || !removeAccId}
              className="bg-destructive hover:bg-destructive/90 h-11 sm:h-10 touch-manipulation"
            >
              {removingAcc && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              移除權限
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>



      <AlertDialog open={deleteBackupDialogOpen} onOpenChange={setDeleteBackupDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除</AlertDialogTitle>
            <AlertDialogDescription>確定要刪除此備份嗎？此操作無法復原，備份文件將被永久刪除。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 sm:h-10 touch-manipulation">取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteBackup} className="bg-destructive hover:bg-destructive/90 h-11 sm:h-10 touch-manipulation">刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Headquarters;
