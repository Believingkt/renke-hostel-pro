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
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";

interface UserRole {
  id: string;
  user_id: string;
  accommodation_id: string;
  role: string;
  created_at: string;
  updated_at: string;
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
  const [newUserId, setNewUserId] = useState("");
  const [selectedAccommodation, setSelectedAccommodation] = useState("");
  const [selectedRole, setSelectedRole] = useState<"super_admin" | "hotel_admin" | "staff">("staff");

  useEffect(() => {
    checkSuperAdmin();
    loadAccommodations();
    loadUserRoles();
  }, []);

  const checkSuperAdmin = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate("/auth");
      return;
    }

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const isSuperAdmin = roles?.some(r => r.role === "super_admin");
    if (!isSuperAdmin) {
      toast.error("您沒有權限訪問此頁面");
      navigate("/admin");
    }
  };

  const loadAccommodations = async () => {
    const { data, error } = await supabase
      .from("accommodation_info")
      .select("id, name")
      .order("name");

    if (error) {
      toast.error("載入旅館列表失敗");
      console.error(error);
      return;
    }

    setAccommodations(data || []);
  };

  const loadUserRoles = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("user_roles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("載入用戶權限失敗");
      console.error(error);
    } else {
      setUserRoles(data || []);
    }
    setLoading(false);
  };

  const handleAddUser = async () => {
    if (!newUserId || !selectedAccommodation || !selectedRole) {
      toast.error("請填寫所有欄位");
      return;
    }

    const { error } = await supabase
      .from("user_roles")
      .insert({
        user_id: newUserId,
        accommodation_id: selectedAccommodation,
        role: selectedRole,
      });

    if (error) {
      toast.error("新增用戶權限失敗");
      console.error(error);
    } else {
      toast.success("用戶權限新增成功");
      setNewUserId("");
      setSelectedAccommodation("");
      setSelectedRole("staff");
      loadUserRoles();
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("id", roleId);

    if (error) {
      toast.error("刪除用戶權限失敗");
      console.error(error);
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
      console.error(error);
    } else {
      toast.success("用戶權限已更新");
      loadUserRoles();
    }
  };

  const getAccommodationName = (accommodationId: string) => {
    const accommodation = accommodations.find(a => a.id === accommodationId);
    return accommodation?.name || accommodationId;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">人客多總部</h1>
        <p className="text-muted-foreground">管理所有旅館的用戶權限</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>新增用戶權限</CardTitle>
          <CardDescription>為用戶分配特定旅館的權限</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="userId">用戶 ID</Label>
              <Input
                id="userId"
                type="text"
                placeholder="用戶的 UUID"
                value={newUserId}
                onChange={(e) => setNewUserId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="accommodation">旅館</Label>
              <Select value={selectedAccommodation} onValueChange={setSelectedAccommodation}>
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
              <Select value={selectedRole} onValueChange={(value) => setSelectedRole(value as "super_admin" | "hotel_admin" | "staff")}>
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
              <Button onClick={handleAddUser} className="w-full">
                新增權限
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
            <div className="text-center py-8 text-muted-foreground">
              尚無用戶權限資料
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
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
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Headquarters;
