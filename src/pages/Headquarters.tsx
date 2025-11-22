import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
import { Loader2, Trash2, Building2, UserCog, Mail, MailCheck } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";

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
}

const Headquarters = () => {
  const navigate = useNavigate();
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [accommodations, setAccommodations] = useState<AccommodationInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [selectedAccommodation, setSelectedAccommodation] = useState("");
  const [selectedRole, setSelectedRole] = useState<"super_admin" | "hotel_admin" | "staff">("staff");

  useEffect(() => {
    loadAccommodations();
    loadUserRoles();
  }, []);

  const loadAccommodations = async () => {
    const { data, error } = await supabase
      .from("accommodation_info")
      .select("id, name")
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

  const handleDeleteRole = async (roleId: string) => {
    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("id", roleId);

    if (error) {
      toast.error("刪除用戶權限失敗");
    } else {
      toast.success("用戶權限已刪除");
      loadUserRoles();
    }
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

  return (
    <div className="container mx-auto p-6 space-y-6">
      <PageHeader
        title="人客多總部"
        icon={Building2}
      />

      <Card>
        <CardHeader>
          <CardTitle>邀請新用戶</CardTitle>
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
                  <SelectItem value="super_admin">超級管理員</SelectItem>
                  <SelectItem value="hotel_admin">旅館管理員</SelectItem>
                  <SelectItem value="staff">員工</SelectItem>
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
          <CardTitle>用戶權限列表</CardTitle>
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
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>用戶名稱</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>狀態</TableHead>
                    <TableHead>用戶 ID</TableHead>
                    <TableHead>旅館</TableHead>
                    <TableHead>角色</TableHead>
                    <TableHead>創建時間</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {userRoles.map((userRole) => (
                    <TableRow key={userRole.id}>
                      <TableCell className="font-medium">
                        {userRole.user_name}
                      </TableCell>
                      <TableCell>
                        {userRole.user_email}
                      </TableCell>
                      <TableCell>
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
                      <TableCell>{getAccommodationName(userRole.accommodation_id)}</TableCell>
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
                      <TableCell>
                        {new Date(userRole.created_at).toLocaleDateString("zh-TW")}
                      </TableCell>
                      <TableCell className="text-right">
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
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteRole(userRole.id)}
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
};

export default Headquarters;
