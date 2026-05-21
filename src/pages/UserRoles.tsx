import { useState, useEffect } from "react";

import { supabase } from "@/integrations/supabase/client";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { useAuditLog } from "@/hooks/use-audit-log";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Trash2, Plus, UserPlus, ShieldCheck, Shield } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { AdminPageHeader } from "@/components/AdminPageHeader";

interface UserRole {
  id: string;
  user_id: string;
  accommodation_id: string;
  role: "super_admin" | "hotel_admin" | "staff" | "admin" | "closer" | "scout" | "scout_manager" | "video" | "franchise" | "starlink" | "owner" | "kol" | "finance";
  created_at: string;
}

export default function UserRoles() {
  const { currentAccommodationId } = useAccommodation();
  const { logAction } = useAuditLog();
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingRoleId, setDeletingRoleId] = useState<string | null>(null);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState<"hotel_admin" | "staff">("staff");

  useEffect(() => {
    if (currentAccommodationId) {
      loadUserRoles();
    }
  }, [currentAccommodationId]);

  const loadUserRoles = async () => {
    if (!currentAccommodationId) return;

    try {
      setIsLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from('user_roles')
        .select('*')
        .eq('accommodation_id', currentAccommodationId);

      if (error) throw error;
      setUserRoles(data || []);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error loading user roles:', error);
      }
      setError(error instanceof Error ? error.message : "載入用戶權限失敗");
      toast.error('載入用戶權限失敗');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddUser = async () => {
    if (!currentAccommodationId || !newUserEmail) {
      toast.error('請輸入用戶 Email');
      return;
    }

    try {
      // Query user by email using secure edge function
      const { data: lookupData, error: lookupError } = await supabase.functions.invoke('lookup-user-by-email', {
        body: { 
          email: newUserEmail,
          accommodationId: currentAccommodationId
        }
      });

      if (lookupError) {
        console.error("Lookup error:", lookupError);
        
        let errorMessage = "查詢用戶失敗";
        if (lookupError.message) {
          errorMessage = lookupError.message;
        }
        
        if (import.meta.env.DEV) {
          console.error("Full lookup error:", lookupError);
        }
        
        toast.error(errorMessage + "\n請確認 Email 是否正確或稍後再試");
        return;
      }

      if (!lookupData?.success || !lookupData?.user) {
        const errorMsg = lookupData?.error || '找不到此用戶';
        toast.error(errorMsg + '\n\n請確認：\n• Email 是否正確\n• 該用戶是否已註冊');
        return;
      }

      const user = lookupData.user;

      // Check if user already has role for this accommodation
      const { data: existingRole } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', user.id)
        .eq('accommodation_id', currentAccommodationId)
        .maybeSingle();

      if (existingRole) {
        toast.error('此用戶已擁有此民宿的權限');
        return;
      }

      // Add user role
      const { error } = await supabase
        .from('user_roles')
        .insert({
          user_id: user.id,
          accommodation_id: currentAccommodationId,
          role: newUserRole,
        });

      if (error) throw error;

      // Log the action
      await logAction({
        actionType: "create",
        actionCategory: "user",
        entityType: "user_role",
        entityId: user.id,
        entityName: newUserEmail,
        accommodationId: currentAccommodationId,
        details: { role: newUserRole }
      });

      toast.success('成功新增用戶權限');
      setNewUserEmail('');
      loadUserRoles();
    } catch (error: any) {
      console.error('Error adding user:', error);
      
      let errorMessage = '新增用戶權限失敗';
      if (error.message) {
        errorMessage += `: ${error.message}`;
      }
      
      if (import.meta.env.DEV) {
        console.error('Full error:', {
          error,
          email: newUserEmail,
          role: newUserRole,
          accommodationId: currentAccommodationId
        });
      }
      
      toast.error(errorMessage);
    }
  };

  const handleDeleteRoleClick = (roleId: string) => {
    setDeletingRoleId(roleId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteRole = async () => {
    if (!deletingRoleId) return;

    try {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('id', deletingRoleId);

      if (error) throw error;

      // Log the action
      await logAction({
        actionType: "delete",
        actionCategory: "user",
        entityType: "user_role",
        entityId: deletingRoleId,
        entityName: "用戶權限",
        accommodationId: currentAccommodationId,
      });

      toast.success('成功刪除用戶權限');
      loadUserRoles();
    } catch (error: any) {
      console.error('Error deleting role:', error);
      
      let errorMessage = '刪除用戶權限失敗';
      if (error.message) {
        errorMessage += `: ${error.message}`;
      }
      
      if (import.meta.env.DEV) {
        console.error('Full error:', error);
      }
      
      toast.error(errorMessage);
    } finally {
      setDeleteDialogOpen(false);
      setDeletingRoleId(null);
    }
  };

  const handleUpdateRole = async (roleId: string, newRole: "super_admin" | "hotel_admin" | "staff") => {
    try {
      const { error } = await supabase
        .from('user_roles')
        .update({ role: newRole })
        .eq('id', roleId);

      if (error) throw error;

      toast.success('成功更新用戶角色');
      loadUserRoles();
    } catch (error: any) {
      console.error('Error updating role:', error);
      
      let errorMessage = '更新用戶角色失敗';
      if (error.message) {
        errorMessage += `: ${error.message}`;
      }
      
      if (import.meta.env.DEV) {
        console.error('Full error:', error);
      }
      
      toast.error(errorMessage);
    }
  };

  if (!currentAccommodationId) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">請先選擇民宿</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader title="用戶權限管理" icon={Shield} />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg md:text-xl">新增用戶</CardTitle>
          <CardDescription>
            為現有用戶新增此民宿的存取權限
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <Input
              placeholder="用戶 Email"
              value={newUserEmail}
              onChange={(e) => setNewUserEmail(e.target.value)}
              className="flex-1 h-12 text-base sm:h-10 sm:text-sm touch-manipulation"
            />
            <Select value={newUserRole} onValueChange={(value: "hotel_admin" | "staff") => setNewUserRole(value)}>
              <SelectTrigger className="w-full sm:w-[180px] h-12 text-base sm:h-10 sm:text-sm touch-manipulation">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hotel_admin">民宿管理員</SelectItem>
                <SelectItem value="staff">現場營運</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleAddUser} className="w-full sm:w-auto h-12 sm:h-10 touch-manipulation">
              <Plus className="h-4 w-4 mr-2" />
              新增
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg md:text-xl">現有用戶</CardTitle>
          <CardDescription>
            目前擁有此民宿存取權限的用戶
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            </div>
          ) : error ? (
            <ErrorState
              title="無法載入用戶權限"
              message={error}
              onRetry={loadUserRoles}
            />
          ) : userRoles.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="尚無用戶權限"
              description="開始新增用戶權限，讓團隊成員能夠協助管理系統"
              action={{
                label: "新增第一個用戶",
                onClick: () => document.getElementById('new-user-email')?.focus()
              }}
            />
          ) : (
            <>
              {/* Desktop table view */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>用戶 ID</TableHead>
                      <TableHead>角色</TableHead>
                      <TableHead>建立時間</TableHead>
                      <TableHead className="text-center">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {userRoles.map((userRole) => (
                      <TableRow key={userRole.id}>
                        <TableCell className="font-mono text-sm">{userRole.user_id}</TableCell>
                        <TableCell>
                          <Select
                            value={userRole.role}
                            onValueChange={(value) => handleUpdateRole(userRole.id, value as "super_admin" | "hotel_admin" | "staff")}
                          >
                            <SelectTrigger className="w-[180px] touch-manipulation">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="super_admin">總部管理員</SelectItem>
                              <SelectItem value="hotel_admin">民宿管理員</SelectItem>
                              <SelectItem value="staff">現場營運</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>{new Date(userRole.created_at).toLocaleDateString('zh-TW')}</TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost-destructive"
                            size="icon"
                            onClick={() => handleDeleteRoleClick(userRole.id)}
                            className="touch-manipulation"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile card view */}
              <div className="md:hidden space-y-3">
                {userRoles.map((userRole) => (
                  <Card key={userRole.id} className="shadow-sm">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0 space-y-2">
                          <div>
                            <span className="text-xs text-muted-foreground">用戶 ID</span>
                            <p className="font-mono text-sm truncate">{userRole.user_id}</p>
                          </div>
                          <div>
                            <span className="text-xs text-muted-foreground">建立時間</span>
                            <p className="text-sm">{new Date(userRole.created_at).toLocaleDateString('zh-TW')}</p>
                          </div>
                        </div>
                        <Button
                          variant="ghost-destructive"
                          size="icon"
                          className="h-11 w-11 flex-shrink-0 touch-manipulation"
                          onClick={() => handleDeleteRoleClick(userRole.id)}
                        >
                          <Trash2 className="h-5 w-5" />
                        </Button>
                      </div>
                      
                      <div className="pt-2 border-t">
                        <Label className="text-xs text-muted-foreground mb-2 block">角色</Label>
                        <Select
                          value={userRole.role}
                          onValueChange={(value) => handleUpdateRole(userRole.id, value as "super_admin" | "hotel_admin" | "staff")}
                        >
                          <SelectTrigger className="w-full h-12 text-base touch-manipulation">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="super_admin">總部管理員</SelectItem>
                            <SelectItem value="hotel_admin">民宿管理員</SelectItem>
                            <SelectItem value="staff">現場營運</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除</AlertDialogTitle>
            <AlertDialogDescription>
              確定要刪除此用戶的權限嗎？此操作無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 sm:h-10 touch-manipulation">取消</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteRole}
              className="bg-destructive hover:bg-destructive/90 h-11 sm:h-10 touch-manipulation"
            >
              刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
