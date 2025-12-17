import { useState, useEffect } from "react";
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
  DollarSign
} from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
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
import { AccommodationManagement } from "@/components/headquarters/AccommodationManagement";
import { OperationalOverview } from "@/components/headquarters/OperationalOverview";
import { PerformanceReport } from "@/components/headquarters/PerformanceReport";
import { SystemManagement } from "@/components/headquarters/SystemManagement";
import { SplitManagement } from "@/components/headquarters/SplitManagement";

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
  is_active?: boolean;
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

const Headquarters = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'overview';
  
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [accommodations, setAccommodations] = useState<AccommodationInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [selectedAccommodation, setSelectedAccommodation] = useState("");
  const [selectedRole, setSelectedRole] = useState<"super_admin" | "hotel_admin" | "staff">("staff");

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

  useEffect(() => {
    loadAccommodations();
    loadUserRoles();
  }, []);

  const loadAccommodations = async () => {
    const { data, error } = await supabase
      .from("accommodation_info")
      .select("id, name, type, registration_number, country, region_1, region_2, address, phone, email, description, short_url_alias, is_active, created_at")
      .order("name");

    if (error) {
      toast.error("載入旅館列表失敗");
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
        .order("created_at", { ascending: false });

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
        .select("id, email, name, last_sign_in_at")
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
            lastSignInAt: profile.last_sign_in_at 
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
    if (!newUserName || !newUserEmail || !selectedAccommodation || !selectedRole) {
      toast.error("請填寫所有欄位");
      return;
    }

    setIsSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke("create-user", {
        body: {
          name: newUserName,
          email: newUserEmail,
          role: selectedRole,
          accommodationId: selectedAccommodation,
        },
      });

      if (error) throw error;

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
    const { error } = await supabase
      .from("user_roles")
      .update({ role: newRole })
      .eq("id", roleId);

    if (error) {
      toast.error("更新用戶權限失敗");
    } else {
      toast.success("用戶權限已更新");
      loadUserRoles();
    }
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

  // Helper to get page title based on current tab
  const getPageTitle = () => {
    switch (currentTab) {
      case 'overview': return '營運概況';
      case 'performance': return '業績報表';
      case 'split': return '金流拆帳';
      case 'accommodations': return '民宿管理';
      case 'users': return '用戶管理';
      case 'system': return '系統管理';
      default: return '營運概況';
    }
  };

  const getPageIcon = () => {
    switch (currentTab) {
      case 'overview': return BarChart3;
      case 'performance': return TrendingUp;
      case 'split': return DollarSign;
      case 'accommodations': return Building2;
      case 'users': return Users;
      case 'system': return Settings;
      default: return BarChart3;
    }
  };

  // Render content based on current tab
  const renderContent = () => {
    switch (currentTab) {
      case 'overview':
        return <OperationalOverview accommodations={accommodations} />;
      case 'performance':
        return <PerformanceReport accommodations={accommodations} />;
      case 'split':
        return <SplitManagement accommodations={accommodations} />;
      case 'accommodations':
        return (
          <AccommodationManagement
            accommodations={accommodations as any}
            onRefresh={loadAccommodations}
            loading={loading}
          />
        );
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
                  <div className="space-y-2">
                    <Label htmlFor="accommodation">旅館</Label>
                    <Select 
                      value={selectedAccommodation} 
                      onValueChange={setSelectedAccommodation}
                      disabled={isSubmitting}
                    >
                      <SelectTrigger id="accommodation">
                        <SelectValue placeholder="選擇旅館" />
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
                <CardTitle className="text-lg">用戶權限列表</CardTitle>
                <CardDescription>查看和管理所有用戶的權限設定</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : userRoles.length === 0 ? (
                  <EmptyState
                    icon={UserCog}
                    title="尚無用戶權限資料"
                    description="這裡會顯示所有旅館的用戶權限資訊"
                  />
                ) : (
                  <div className="table-scroll-container overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-semibold text-sm">用戶名稱</TableHead>
                          <TableHead className="font-semibold text-sm">Email</TableHead>
                          <TableHead className="font-semibold text-sm">狀態</TableHead>
                          <TableHead className="font-semibold text-sm">用戶 ID</TableHead>
                          <TableHead className="font-semibold text-sm">旅館</TableHead>
                          <TableHead className="font-semibold text-sm">角色</TableHead>
                          <TableHead className="font-semibold text-sm">創建時間</TableHead>
                          <TableHead className="text-right font-semibold text-sm">操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {userRoles.map((userRole) => (
                          <TableRow key={userRole.id}>
                            <TableCell className="font-medium text-sm">
                              {userRole.user_name}
                            </TableCell>
                            <TableCell className="text-sm">
                              {userRole.user_email}
                            </TableCell>
                            <TableCell className="text-sm">
                              <Badge 
                                variant={userRole.status === 'active' ? 'default' : 'secondary'}
                                className="gap-1"
                              >
                                {userRole.status === 'active' ? (
                                  <MailCheck className="h-3 w-3" />
                                ) : (
                                  <Mail className="h-3 w-3" />
                                )}
                                {userRole.statusLabel}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {userRole.user_id.substring(0, 8)}...
                            </TableCell>
                            <TableCell className="text-sm">{getAccommodationName(userRole.accommodation_id)}</TableCell>
                            <TableCell className="text-sm">
                              <div className="flex items-center gap-2">
                                <Badge variant={getRoleBadgeVariant(userRole.role)}>
                                  {getRoleLabel(userRole.role)}
                                </Badge>
                                <Select
                                  value={userRole.role}
                                  onValueChange={(value) => handleUpdateRole(userRole.id, value as "super_admin" | "hotel_admin" | "staff")}
                                >
                                  <SelectTrigger className="w-[140px] h-8">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="super_admin">總部管理員</SelectItem>
                                    <SelectItem value="hotel_admin">民宿管理員</SelectItem>
                                    <SelectItem value="staff">現場營運</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">
                              {new Date(userRole.created_at).toLocaleDateString("zh-TW")}
                            </TableCell>
                            <TableCell className="text-right text-sm">
                              <div className="flex items-center justify-end gap-2">
                                {userRole.status === 'pending' && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleResendInvite(userRole.user_id, userRole.user_name || "用戶", userRole.accommodation_id)}
                                    title="重新發送邀請"
                                  >
                                    <Mail className="h-4 w-4 text-primary" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost-destructive"
                                  size="icon"
                                  onClick={() => handleDeleteRoleClick(userRole.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        );
      case 'system':
        return <SystemManagement accommodations={accommodations} />;
      default:
        return <OperationalOverview accommodations={accommodations} />;
    }
  };

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        title={getPageTitle()}
        icon={getPageIcon()}
      />

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
