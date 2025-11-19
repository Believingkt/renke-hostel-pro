import { useState, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useSubdomain } from "@/hooks/use-subdomain";
import { format } from "date-fns";
import { z } from 'zod';

interface User {
  id: string;
  name: string;
  email: string;
  lastLogin: string;
  role: string;
  roleLabel: string;
}

const Accounts = () => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("staff");
  const [isLoading, setIsLoading] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const { accommodationId } = useSubdomain();

  useEffect(() => {
    if (accommodationId) {
      loadUsers();
    }
  }, [accommodationId]);

  const loadUsers = async () => {
    if (!accommodationId) {
      return;
    }

    setIsLoading(true);

    try {
      const { data: userRoles, error } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("accommodation_id", accommodationId);

      if (error) {
        if (import.meta.env.DEV) {
          console.error("Error loading user roles:", error);
        }
        throw error;
      }

      if (!userRoles || userRoles.length === 0) {
        setUsers([]);
        return;
      }

      // Get profiles for all users
      const userIds = userRoles.map(ur => ur.user_id);

      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, name, email, last_sign_in_at")
        .in("id", userIds);

      if (profileError) {
        if (import.meta.env.DEV) {
          console.error("Error loading profiles:", profileError);
        }
      }

      const profilesMap = new Map(
        profiles?.map(p => [p.id, { 
          name: p.name, 
          email: p.email,
          lastSignInAt: p.last_sign_in_at 
        }]) || []
      );

      const usersData = userRoles.map((ur: any) => {
        const profile = profilesMap.get(ur.user_id);
        const lastLogin = profile?.lastSignInAt 
          ? format(new Date(profile.lastSignInAt), "yyyy/MM/dd HH:mm")
          : "-";
        
        return {
          id: ur.user_id,
          name: profile?.name || "未知",
          email: profile?.email || "-",
          lastLogin,
          role: ur.role,
          roleLabel: getRoleLabel(ur.role),
        };
      });

      setUsers(usersData);
    } catch (error: any) {
      if (import.meta.env.DEV) {
        console.error("Error loading users:", error);
      }
      toast.error("載入使用者列表失敗: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "super_admin":
        return "超級管理員";
      case "hotel_admin":
        return "飯店管理員";
      case "staff":
        return "現場營運";
      default:
        return role;
    }
  };

  const handleSubmit = async () => {
    if (!accommodationId) {
      toast.error("無法取得住宿設施 ID");
      return;
    }

    if (!name || !email || !password || !role) {
      toast.error("請填寫所有欄位");
      return;
    }

    // Client-side validation
    const accountSchema = z.object({
      name: z.string().trim().min(1, "姓名不能為空").max(100, "姓名長度不能超過100個字元"),
      email: z.string().email("請輸入有效的電子郵件地址").max(255, "電子郵件長度不能超過255個字元"),
      password: z.string().min(6, "密碼長度至少6個字元").max(72, "密碼長度不能超過72個字元"),
      role: z.enum(['super_admin', 'hotel_admin', 'staff'], { errorMap: () => ({ message: "請選擇有效的角色" }) })
    });

    const validation = accountSchema.safeParse({ name: name.trim(), email: email.trim(), password, role });
    if (!validation.success) {
      toast.error(validation.error.issues[0].message);
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("create-user", {
        body: {
          name,
          email,
          password,
          role,
          accommodationId,
        },
      });

      if (error) throw error;

      if (data?.error) {
        // Handle specific error messages
        let errorMessage = data.error;
        if (errorMessage === "此 Email 已被註冊") {
          errorMessage = "此 Email 已被註冊，請使用其他 Email";
        }
        toast.error(errorMessage);
        return;
      }

      if (!data?.success) {
        toast.error("建立帳號失敗");
        return;
      }

      toast.success("帳號建立成功");
      setOpen(false);
      setName("");
      setEmail("");
      setPassword("");
      setRole("staff");
      loadUsers();
    } catch (error: any) {
      if (import.meta.env.DEV) {
        console.error("Error creating user:", error);
      }
      toast.error(error.message || "建立帳號失敗");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (userId: string) => {
    if (!confirm("確定要移除此帳號的存取權限嗎？\n\n注意：這只會移除該用戶對此住宿設施的存取權限，不會刪除用戶帳號本身。")) return;

    try {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("accommodation_id", accommodationId);

      if (error) throw error;

      toast.success("已移除用戶存取權限");
      loadUsers();
    } catch (error: any) {
      if (import.meta.env.DEV) {
        console.error("Error removing user access:", error);
      }
      toast.error("移除存取權限失敗");
    }
  };

  return (
    <div className="space-y-4 md:space-y-6 p-4 md:p-0">
      <div className="pt-4 pb-4 border-b border-primary/20 mb-6">
        <h2 className="text-3xl font-bold flex items-center gap-2.5">
          <span className="w-2 h-9 bg-primary rounded-full"></span>
          帳號管理
        </h2>
      </div>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="hidden"></div>
        
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 w-full md:w-auto">
              <Plus className="h-4 w-4" />
              新增帳號
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新增帳號</DialogTitle>
              <DialogDescription>
                設定新帳號的名稱、Email、臨時密碼和權限
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">名稱</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="請輸入名稱"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="請輸入 Email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">臨時密碼</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="至少 6 個字元"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">權限</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger id="role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="super_admin">超級管理員</SelectItem>
                    <SelectItem value="hotel_admin">飯店管理員</SelectItem>
                    <SelectItem value="staff">現場營運</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={isLoading}>
                取消
              </Button>
              <Button onClick={handleSubmit} disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                確認
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="pt-6">
          {/* Desktop table view */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名稱</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead>最後登入時間</TableHead>
                  <TableHead className="w-[100px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      尚無帳號
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.name}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>{user.roleLabel}</TableCell>
                      <TableCell>{user.lastLogin}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(user.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile card view */}
          <div className="md:hidden space-y-3">
            {users.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                尚無帳號
              </p>
            ) : (
              users.map((user) => (
                <Card key={user.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 space-y-2 min-w-0">
                        <div>
                          <p className="text-xs text-muted-foreground">名稱</p>
                          <p className="font-medium">{user.name}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Email</p>
                          <p className="text-sm break-all">{user.email || "-"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">角色</p>
                          <p className="text-sm">{user.roleLabel}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">最後登入時間</p>
                          <p className="text-sm">{user.lastLogin}</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        onClick={() => handleDelete(user.id)}
                      >
                        <Trash2 className="h-5 w-5 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Accounts;
