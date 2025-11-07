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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Plus } from "lucide-react";

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
      // Query user by email using auth admin API
      const { data, error: authError } = await supabase.auth.admin.listUsers();
      
      if (authError) throw authError;

      const user = data.users.find((u: any) => u.email === newUserEmail);

      if (!user) {
        toast.error('找不到此用戶，請確認 Email 是否正確');
        return;
      }

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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">用戶權限管理</h1>
        <p className="text-muted-foreground mt-2">
          管理此旅館的用戶權限和角色
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>新增用戶</CardTitle>
          <CardDescription>
            為現有用戶新增此旅館的存取權限
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Input
              placeholder="用戶 Email"
              value={newUserEmail}
              onChange={(e) => setNewUserEmail(e.target.value)}
              className="flex-1"
            />
            <Select value={newUserRole} onValueChange={(value: "hotel_admin" | "staff") => setNewUserRole(value)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hotel_admin">旅館管理員</SelectItem>
                <SelectItem value="staff">員工</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleAddUser}>
              <Plus className="h-4 w-4 mr-2" />
              新增
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>現有用戶</CardTitle>
          <CardDescription>
            目前擁有此旅館存取權限的用戶
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            </div>
          ) : userRoles.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              目前沒有任何用戶
            </div>
          ) : (
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
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
