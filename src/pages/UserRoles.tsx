import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAccommodation } from "@/contexts/AccommodationContext";
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

interface UserRole {
  id: string;
  user_id: string;
  accommodation_id: string;
  role: "super_admin" | "hotel_admin" | "staff";
  created_at: string;
}

export default function UserRoles() {
  const { currentAccommodationId } = useAccommodation();
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

      if (lookupError) throw lookupError;

      if (!lookupData?.success || !lookupData?.user) {
        toast.error(lookupData?.error || '找不到此用戶，請確認 Email 是否正確');
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
        toast.error('此用戶已擁有此旅館的權限');
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

      toast.success('成功新增用戶權限');
      setNewUserEmail('');
      loadUserRoles();
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error adding user:', error);
      }
      toast.error('新增用戶權限失敗');
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    try {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('id', roleId);

      if (error) throw error;

      toast.success('成功刪除用戶權限');
      loadUserRoles();
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error deleting role:', error);
      }
      toast.error('刪除用戶權限失敗');
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
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error updating role:', error);
      }
      toast.error('更新用戶角色失敗');
    }
  };

  if (!currentAccommodationId) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">請先選擇旅館</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 p-4 md:p-0">
      <div className="pb-4 border-b border-primary/20 mb-6">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold flex items-center gap-3">
            <Shield className="h-7 w-7 text-primary" />
            用戶權限管理
          </h2>
        </div>
        <p className="text-sm md:text-base text-muted-foreground mt-2 ml-[18px]">
          管理此旅館的用戶權限和角色
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg md:text-xl">新增用戶</CardTitle>
          <CardDescription>
            為現有用戶新增此旅館的存取權限
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <Input
              placeholder="用戶 Email"
              value={newUserEmail}
              onChange={(e) => setNewUserEmail(e.target.value)}
              className="flex-1"
            />
            <Select value={newUserRole} onValueChange={(value: "hotel_admin" | "staff") => setNewUserRole(value)}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hotel_admin">旅館管理員</SelectItem>
                <SelectItem value="staff">員工</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleAddUser} className="w-full sm:w-auto">
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
            目前擁有此旅館存取權限的用戶
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
                      <TableHead className="text-right">操作</TableHead>
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
                            <SelectTrigger className="w-[180px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="super_admin">超級管理員</SelectItem>
                              <SelectItem value="hotel_admin">旅館管理員</SelectItem>
                              <SelectItem value="staff">員工</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>{new Date(userRole.created_at).toLocaleDateString('zh-TW')}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteRole(userRole.id)}
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
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 flex-shrink-0"
                          onClick={() => handleDeleteRole(userRole.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                      
                      <div className="pt-2 border-t">
                        <Label className="text-xs text-muted-foreground">角色</Label>
                        <Select
                          value={userRole.role}
                          onValueChange={(value) => handleUpdateRole(userRole.id, value as "super_admin" | "hotel_admin" | "staff")}
                        >
                          <SelectTrigger className="w-full mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="super_admin">超級管理員</SelectItem>
                            <SelectItem value="hotel_admin">旅館管理員</SelectItem>
                            <SelectItem value="staff">員工</SelectItem>
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
    </div>
  );
}
