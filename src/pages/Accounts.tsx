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
import { Badge } from "@/components/ui/badge";
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
import { Plus, Trash2, Loader2, Users, UserPlus, Mail, MailCheck } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
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
  status: 'pending' | 'active';
  statusLabel: string;
}

const Accounts = () => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("staff");
  const [isLoading, setIsLoading] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [emailError, setEmailError] = useState<string>("");
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
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

      const usersData: User[] = userRoles.map((ur: any) => {
        const profile = profilesMap.get(ur.user_id);
        const hasLoggedIn = !!profile?.lastSignInAt;
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
          status: (hasLoggedIn ? 'active' : 'pending') as 'active' | 'pending',
          statusLabel: hasLoggedIn ? '已啟用' : '待設定密碼',
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
        return "總部管理員";
      case "hotel_admin":
        return "民宿管理員";
      case "staff":
        return "現場營運";
      default:
        return role;
    }
  };

  const checkEmailExists = async (email: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.functions.invoke("check-email-exists", {
        body: { email: email.trim() },
      });

      if (error) {
        console.error("Error checking email:", error);
        return false;
      }

      if (!data?.success) {
        console.error("Email check failed:", data?.error);
        return false;
      }

      return data.exists === true;
    } catch (error) {
      console.error("Unexpected error checking email:", error);
      return false;
    }
  };

  const handleEmailChange = async (value: string) => {
    setEmail(value);
    setEmailError("");

    // Only check if email format is valid
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!value || !emailRegex.test(value)) {
      return;
    }

    setIsCheckingEmail(true);
    const exists = await checkEmailExists(value.trim());
    setIsCheckingEmail(false);

    if (exists) {
      setEmailError("此 Email 已被註冊");
    }
  };

  const handleSubmit = async () => {
    if (!accommodationId) {
      toast.error("無法取得住宿設施 ID");
      return;
    }

    if (!name || !email || !role) {
      toast.error("請填寫所有欄位");
      return;
    }

    // Check for email error before submitting
    if (emailError) {
      toast.error(emailError);
      return;
    }

    // Client-side validation
    const accountSchema = z.object({
      name: z.string().trim().min(1, "姓名不能為空").max(100, "姓名長度不能超過100個字元"),
      email: z.string().email("請輸入有效的電子郵件地址").max(255, "電子郵件長度不能超過255個字元"),
      role: z.enum(['super_admin', 'hotel_admin', 'staff'], { errorMap: () => ({ message: "請選擇有效的角色" }) })
    });

    const validation = accountSchema.safeParse({ name: name.trim(), email: email.trim(), role });
    if (!validation.success) {
      toast.error(validation.error.issues[0].message);
      return;
    }

    setIsLoading(true);

    // Double-check email before final submission
    const emailExists = await checkEmailExists(email.trim());
    if (emailExists) {
      toast.error("此 Email 已被註冊，請使用其他 Email");
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("create-user", {
        body: {
          name,
          email,
          role,
          accommodationId,
        },
      });

      // Handle Supabase function invocation errors
      if (error) {
        console.error("Edge function invocation error:", error);
        toast.error("系統錯誤，請稍後再試");
        return;
      }

      // Handle business logic errors returned from the edge function
      if (data?.error) {
        console.warn("Business logic error:", data.error);
        let errorMessage = data.error;
        if (errorMessage === "此 Email 已被註冊") {
          errorMessage = "此 Email 已被註冊，請使用其他 Email";
        }
        toast.error(errorMessage);
        return;
      }

      // Check for success
      if (!data?.success) {
        console.error("Unexpected response:", data);
        toast.error("建立帳號失敗，請稍後再試");
        return;
      }

      // Success case
      toast.success("邀請郵件已發送，請通知使用者檢查信箱");
      setOpen(false);
      setName("");
      setEmail("");
      setEmailError("");
      setRole("staff");
      await loadUsers();
    } catch (error: any) {
      console.error("Unexpected error creating user:", error);
      toast.error(error.message || "建立帳號時發生未預期的錯誤");
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

  const handleResendInvite = async (userId: string, userName: string) => {
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

  return (
    <div className="space-y-4 md:space-y-6 p-4 md:p-0">
      <PageHeader
        title="帳號管理"
        icon={Users}
        action={
          <Dialog open={open} onOpenChange={(isOpen) => {
            setOpen(isOpen);
            if (!isOpen) {
              // Clear form when dialog closes
              setName("");
              setEmail("");
              setEmailError("");
              setRole("staff");
            }
          }}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                新增帳號
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>邀請新帳號</DialogTitle>
              <DialogDescription>
                輸入用戶資訊後，系統將發送邀請郵件至指定信箱，用戶點擊郵件連結即可設定密碼並登入
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
                <div className="relative">
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => handleEmailChange(e.target.value)}
                    placeholder="請輸入 Email"
                    className={emailError ? "border-destructive focus-visible:ring-destructive" : ""}
                    disabled={isLoading}
                  />
                  {isCheckingEmail && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>
                {emailError ? (
                  <p className="text-xs text-destructive font-medium">
                    {emailError}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    邀請郵件將發送至此信箱
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">權限</Label>
                <Select value={role} onValueChange={setRole}>
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
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={isLoading}>
                取消
              </Button>
              <Button 
                onClick={handleSubmit} 
                disabled={isLoading || isCheckingEmail || !!emailError}
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                確認
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        }
      />

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
                  <TableHead>狀態</TableHead>
                  <TableHead>最後登入時間</TableHead>
                  <TableHead className="w-[140px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="p-0">
                    <EmptyState
                      icon={UserPlus}
                      title="尚無帳號"
                      description="開始建立團隊成員帳號，分配適當的權限角色"
                      action={{
                        label: "新增第一個帳號",
                        onClick: () => setOpen(true)
                      }}
                      className="border-0 shadow-none"
                    />
                  </TableCell>
                </TableRow>
                ) : (
                  users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.name}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>{user.roleLabel}</TableCell>
                      <TableCell>
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
                      <TableCell>{user.lastLogin}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {user.status === 'pending' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleResendInvite(user.id, user.name)}
                              title="重新發送邀請"
                            >
                              <Mail className="h-4 w-4 text-primary" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(user.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
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
              <EmptyState
                icon={UserPlus}
                title="尚無帳號"
                description="開始建立團隊成員帳號，分配適當的權限角色"
                action={{
                  label: "新增第一個帳號",
                  onClick: () => setOpen(true)
                }}
              />
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
                          <p className="text-xs text-muted-foreground">狀態</p>
                          <Badge 
                            variant={user.status === 'active' ? 'default' : 'secondary'}
                            className="gap-1 mt-1"
                          >
                            {user.status === 'active' ? (
                              <MailCheck className="h-3 w-3" />
                            ) : (
                              <Mail className="h-3 w-3" />
                            )}
                            {user.statusLabel}
                          </Badge>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">最後登入時間</p>
                          <p className="text-sm">{user.lastLogin}</p>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 shrink-0">
                        {user.status === 'pending' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleResendInvite(user.id, user.name)}
                            title="重新發送邀請"
                          >
                            <Mail className="h-5 w-5 text-primary" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(user.id)}
                        >
                          <Trash2 className="h-5 w-5 text-destructive" />
                        </Button>
                      </div>
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
