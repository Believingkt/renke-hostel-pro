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
import { Settings2 } from "lucide-react";

interface UserRole {
  id: string;
  user_id: string;
  accommodation_id: string;
  role: string;
  created_at: string;
  updated_at: string;
  user_email?: string;
  user_name?: string;
  status?: 'pending' | 'active';
  statusLabel?: string;
  display_order?: number;
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
  const [deleteBackupDialogOpen, setDeleteBackupDialogOpen] = useState(false);
  const [deletingBackup, setDeletingBackup] = useState<BackupLog | null>(null);

  // Add role to existing user states
  const [addRoleDialogOpen, setAddRoleDialogOpen] = useState(false);
  const [addRoleUserId, setAddRoleUserId] = useState("");
  const [addRoleAccommodation, setAddRoleAccommodation] = useState("");
  const [addRoleType, setAddRoleType] = useState<"super_admin" | "hotel_admin" | "staff">("staff");
  const [addRoleSubmitting, setAddRoleSubmitting] = useState(false);

  useEffect(() => {
    loadAccommodations();
    loadUserRoles();
  }, []);

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
      setNewUserName("");
      setNewUserEmail("");
      setSelectedAccommodation("");
      setSelectedRole("staff");
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

  const handleUpdateRole = async (roleId: string, newRole: "super_admin" | "hotel_admin" | "staff") => {
    const { data, error } = await supabase
      .from("user_roles")
      .update({ role: newRole })
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
      setAddRoleDialogOpen(false);
      setAddRoleUserId("");
      setAddRoleAccommodation("");
      setAddRoleType("staff");
      loadUserRoles();
    } catch (error) {
      toast.error("新增權限失敗");
    } finally {
      setAddRoleSubmitting(false);
    }
  };

  const getAccommodationName = (accommodationId: string) => {
    const accommodation = accommodations.find(a => a.id === accommodationId);
    return accommodation?.name || accommodationId;
  };

  const getRoleLabel = (role: string) => {
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
    const grouped = userRoles.reduce<Record<string, typeof userRoles>>((acc, role) => {
      const key = role.user_id;
      if (!acc[key]) acc[key] = [];
      acc[key].push(role);
      return acc;
    }, {});

    return Object.values(grouped)
      .map((roles) => {
        const first = roles[0];
        return {
          user_id: first.user_id,
          user_name: first.user_name || '未知',
          user_email: first.user_email || '-',
          status: first.status || 'pending' as const,
          statusLabel: first.statusLabel || '待設定密碼',
          display_order: first.display_order ?? 0,
          roles,
        };
      })
      .sort((a, b) => a.display_order - b.display_order);
  }, [userRoles]);

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
                      value={selectedRole} 
                      onValueChange={(value) => setSelectedRole(value as "super_admin" | "hotel_admin" | "staff")}
                      disabled={isSubmitting}
                    >
                      <SelectTrigger id="role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="super_admin">總部管理員</SelectItem>
                        <SelectItem value="hotel_admin">民宿管理員</SelectItem>
                        <SelectItem value="staff">現場營運</SelectItem>
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
                <CardTitle className="text-lg">為現有用戶新增權限</CardTitle>
                <CardDescription>直接為已存在的帳號新增民宿權限或總部管理員權限，無需發送邀請信</CardDescription>
              </CardHeader>
              <CardContent>
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
                    <Select value={addRoleType} onValueChange={(v) => setAddRoleType(v as "super_admin" | "hotel_admin" | "staff")}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="super_admin">總部管理員</SelectItem>
                        <SelectItem value="hotel_admin">民宿管理員</SelectItem>
                        <SelectItem value="staff">現場營運</SelectItem>
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
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">用戶權限列表</CardTitle>
                <CardDescription>查看和管理所有用戶的權限設定</CardDescription>
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
                                            {getRoleLabel(r.role)}
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
                                            value={r.role}
                                            onValueChange={(value) => handleUpdateRole(r.id, value as "super_admin" | "hotel_admin" | "staff")}
                                          >
                                            <SelectTrigger className="w-[130px] h-7 text-xs">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="super_admin">總部管理員</SelectItem>
                                              <SelectItem value="hotel_admin">民宿管理員</SelectItem>
                                              <SelectItem value="staff">現場營運</SelectItem>
                                            </SelectContent>
                                          </Select>
                                        </div>
                                      ))}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-sm align-top">
                                    <div className="flex flex-col gap-4">
                                      {displayRoles.map((r) => (
                                        <div key={r.id} className="h-10 flex items-center justify-center">
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
