import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
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
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Loader2, Users, UserPlus, Mail, MailCheck, CheckCircle2, XCircle, UserCog, Shield, UserCheck, KeyRound, Home, Settings2, ShieldCheck } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { StaffPermissionsDialog } from "@/components/StaffPermissionsDialog";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { format } from "date-fns";
import { z } from 'zod';
import { parseFunctionInvokeError } from "@/utils/parseFunctionError";

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
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("staff");
  const [isLoading, setIsLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [emailError, setEmailError] = useState<string>("");
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [emailFormatValid, setEmailFormatValid] = useState<boolean | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [permissionsUserId, setPermissionsUserId] = useState<string | null>(null);
  const { currentAccommodationId: accommodationId } = useAccommodation();

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

      // Filter to show only hotel_admin and staff roles
      const filteredUserRoles = userRoles.filter((ur: any) => 
        ur.role === 'hotel_admin' || ur.role === 'staff'
      );

      const usersData: User[] = filteredUserRoles.map((ur: any) => {
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

  const checkEmailInAccommodation = async (email: string): Promise<{ exists: boolean; hasRole: boolean; existingRole?: string; userName?: string }> => {
    try {
      const { data, error } = await supabase.functions.invoke("check-email-exists", {
        body: { email: email.trim(), accommodationId },
      });

      if (error) {
        console.error("Error checking email:", error);
        return { exists: false, hasRole: false };
      }

      if (!data?.success) {
        console.error("Email check failed:", data?.error);
        return { exists: false, hasRole: false };
      }

      return { 
        exists: data.exists === true, 
        hasRole: data.hasRoleInAccommodation === true,
        existingRole: data.existingRole || undefined,
        userName: data.userName || undefined,
      };
    } catch (error: any) {
      console.error("Unexpected error checking email:", error);
      return { exists: false, hasRole: false };
    }
  };

  const handleEmailChange = async (value: string) => {
    setEmail(value);
    setEmailError("");

    // Check email format validity
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isFormatValid = emailRegex.test(value);
    
    // Only show format feedback if user has started typing
    if (value.length > 0) {
      setEmailFormatValid(isFormatValid);
    } else {
      setEmailFormatValid(null);
    }

    // Only check for existence if format is valid
    if (!value || !isFormatValid) {
      return;
    }

    setIsCheckingEmail(true);
    const result = await checkEmailInAccommodation(value.trim());
    setIsCheckingEmail(false);

    // Only show error if user already has role in THIS accommodation
    if (result.hasRole) {
      const roleLabel = result.existingRole === 'hotel_admin' ? '民宿管理員' : 
                        result.existingRole === 'staff' ? '現場營運' : 
                        result.existingRole === 'super_admin' ? '總部管理員' : result.existingRole;
      setEmailError(`此用戶已在本民宿擁有「${roleLabel}」權限`);
    }
    // If user exists but not in this accommodation, that's OK - they can be invited
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
      role: z.enum(['hotel_admin', 'staff'], { errorMap: () => ({ message: "請選擇有效的角色" }) })
    });

    const validation = accountSchema.safeParse({ name: name.trim(), email: email.trim(), role });
    if (!validation.success) {
      toast.error(validation.error.issues[0].message);
      return;
    }

    setIsLoading(true);

    // Double-check if user already has role in this accommodation
    const emailCheck = await checkEmailInAccommodation(email.trim());
    if (emailCheck.hasRole) {
      toast.error("此用戶已在本民宿擁有權限");
      setIsLoading(false);
      return;
    }

    try {
      // Ensure we have a valid session before calling edge function
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        toast.error("登入狀態已過期，請重新登入");
        navigate("/auth");
        return;
      }

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

        const parsed = await parseFunctionInvokeError(error);
        const backendMsg = parsed.backendError;
        const status = parsed.status;
        const errorMessage = backendMsg || parsed.message;
        
        // Log full error for debugging
        if (import.meta.env.DEV) {
          console.error("Full error object:", {
            error,
            message: error.message,
            context: error.context,
            stack: error.stack
          });
          console.error("Request context:", {
            name,
            email,
            role,
            accommodationId
          });
        }
        
        // Build user-friendly error message
        let displayMessage = errorMessage;
        
        // Add helpful suggestions based on error type
        if (errorMessage.includes("already") || errorMessage.includes("已被註冊")) {
          displayMessage = "此 Email 已被註冊。請使用其他 Email 或在用戶列表中重新發送邀請給現有用戶。";
        } else if (errorMessage.includes("unauthorized") || errorMessage.includes("驗證")) {
          displayMessage = "認證失敗，請重新登入後再試。";
        } else if (errorMessage.includes("network") || errorMessage.includes("網路")) {
          displayMessage = "網路連接異常，請檢查網路連接後重試。";
        } else if (errorMessage.includes("timeout") || errorMessage.includes("逾時")) {
          displayMessage = "請求逾時，請稍後再試。";
        } else {
          displayMessage += status ? `\n（狀態碼: ${status}）` : "";
          displayMessage += "\n\n請稍後再試或聯繫系統管理員。";
        }
        
        toast.error(displayMessage, {
          duration: 6000,
          description: import.meta.env.DEV ? backendMsg : undefined
        });
        return;
      }

      // Handle business logic errors returned from the edge function
      if (data?.error) {
        console.warn("Business logic error:", data.error);
        let errorMessage = data.error;
        
        // Handle specific error cases with helpful messages
        if (errorMessage === "此 Email 已被註冊" || errorMessage.includes("已被註冊") || errorMessage.includes("already")) {
          errorMessage = "此 Email 已被使用，該用戶已存在於系統中。如需重新發送邀請，請在用戶列表中使用「重發邀請」功能。";
        } else if (errorMessage.includes("無效")) {
          errorMessage += "\n請檢查輸入的資料格式是否正確。";
        } else if (errorMessage.includes("權限")) {
          errorMessage += "\n您可能沒有足夠的權限執行此操作。";
        }
        
        toast.error(errorMessage, {
          duration: 5000
        });
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
      setEmailFormatValid(null);
      setRole("staff");
      await loadUsers();
    } catch (error: any) {
      console.error("Unexpected error creating user:", error);
      toast.error(error.message || "建立帳號時發生未預期的錯誤");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteClick = (userId: string) => {
    setDeletingUserId(userId);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingUserId) return;

    try {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", deletingUserId)
        .eq("accommodation_id", accommodationId);

      if (error) throw error;

      toast.success("已移除用戶存取權限");
      loadUsers();
      setDeleteDialogOpen(false);
      setDeletingUserId(null);
    } catch (error: any) {
      if (import.meta.env.DEV) {
        console.error("Error removing user access:", error);
      }
      toast.error("移除存取權限失敗");
    }
  };

  const handlePermanentDelete = async (userEmail: string) => {
    if (!confirm(`⚠️ 警告：永久刪除帳號\n\n確定要永久刪除 ${userEmail} 嗎？\n\n此操作將：\n• 完全刪除該帳號\n• 移除所有相關資料\n• 無法復原\n\n請輸入 "DELETE" 確認`)) return;

    const confirmation = prompt('請輸入 "DELETE" 以確認刪除：');
    if (confirmation !== "DELETE") {
      toast.error("取消刪除操作");
      return;
    }

    try {
      setIsLoading(true);
      const { data, error } = await supabase.functions.invoke("delete-user", {
        body: { email: userEmail },
      });

      if (error) {
        console.error("Edge function invocation error:", error);
        
        let errorMessage = "刪除用戶失敗";
        if (error.message) {
          errorMessage = error.message;
        }
        
        if (import.meta.env.DEV) {
          console.error("Full error:", error);
        }
        
        toast.error(errorMessage + "\n請稍後再試或聯繫系統管理員");
        return;
      }

      if (data?.error) {
        console.warn("Deletion error:", data.error);
        toast.error(data.error);
        return;
      }

      if (!data?.success) {
        console.error("Unexpected response:", data);
        toast.error("刪除帳號失敗，請稍後再試");
        return;
      }

      toast.success(`已成功刪除帳號 ${userEmail}`);
      await loadUsers();
    } catch (error: any) {
      console.error("Unexpected error deleting user:", error);
      
      let errorMessage = error.message || "刪除帳號時發生未預期的錯誤";
      
      if (import.meta.env.DEV) {
        console.error("Full error:", error);
      }
      
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
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

      if (error) {
        console.error("Resend invite error:", error);
        
        let errorMessage = "重新發送邀請失敗";
        if (error.message) {
          errorMessage = error.message;
        }
        
        if (import.meta.env.DEV) {
          console.error("Full error:", error);
        }
        
        toast.error(errorMessage + "\n請稍後再試");
        return;
      }

      if (data?.error) {
        toast.error(data.error);
        return;
      }

      if (data?.success) {
        toast.success("邀請郵件已重新發送");
      } else {
        toast.error("重新發送失敗，請稍後再試");
      }
    } catch (error: any) {
      console.error("Error resending invite:", error);
      
      let errorMessage = error.message || "重新發送失敗";
      
      if (import.meta.env.DEV) {
        console.error("Full error:", error);
      }
      
      toast.error(errorMessage);
    }
  };

  return (
    <div className="space-y-6 md:space-y-8 p-4 md:p-0">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/admin" className="flex items-center hover:opacity-70 transition-opacity">
                <Home className="h-4 w-4" />
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>帳號管理</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader
        title="帳號管理"
        icon={KeyRound}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <Button asChild variant="outline" className="gap-2">
              <Link to="/admin/permission-templates">
                <ShieldCheck className="h-4 w-4" />
                權限範本
              </Link>
            </Button>
          <Dialog open={open} onOpenChange={(isOpen) => {
            setOpen(isOpen);
            if (!isOpen) {
              // Clear form when dialog closes
              setName("");
              setEmail("");
              setEmailError("");
              setEmailFormatValid(null);
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
                    className={
                      emailError 
                        ? "border-destructive focus-visible:ring-destructive pr-10" 
                        : emailFormatValid === false
                        ? "border-destructive/50 focus-visible:ring-destructive/50 pr-10"
                        : emailFormatValid === true
                        ? "border-success focus-visible:ring-success pr-10"
                        : "pr-10"
                    }
                    disabled={isLoading}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {isCheckingEmail && (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                    {!isCheckingEmail && emailFormatValid === true && !emailError && (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    )}
                    {!isCheckingEmail && emailFormatValid === false && (
                      <XCircle className="h-4 w-4 text-destructive/70" />
                    )}
                  </div>
                </div>
                {emailError ? (
                  <p className="text-xs text-destructive font-medium flex items-center gap-1">
                    <XCircle className="h-3 w-3" />
                    {emailError}
                  </p>
                ) : emailFormatValid === false ? (
                  <p className="text-xs text-destructive/70 font-medium flex items-center gap-1">
                    <XCircle className="h-3 w-3" />
                    請輸入有效的 Email 格式
                  </p>
                ) : emailFormatValid === true && !isCheckingEmail ? (
                  <p className="text-xs text-primary font-medium flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Email 格式正確
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
                disabled={isLoading || isCheckingEmail || !!emailError || emailFormatValid === false}
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                確認
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
          </div>
        }
      />

      <>
        {/* Desktop table view */}
        <div className="hidden md:block table-scroll-container overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-foreground text-sm">名稱</TableHead>
                <TableHead className="text-foreground text-sm">Email</TableHead>
                <TableHead className="text-foreground text-sm">角色</TableHead>
                <TableHead className="text-foreground text-sm">狀態</TableHead>
                <TableHead className="text-foreground text-sm">最後登入時間</TableHead>
                <TableHead className="text-center w-[140px] text-foreground text-sm">操作</TableHead>
              </TableRow>
            </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : users.length === 0 ? (
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
                      <TableCell className="font-medium text-sm">{user.name}</TableCell>
                      <TableCell className="text-sm">{user.email}</TableCell>
                      <TableCell className="text-sm">
                        <Badge variant={getRoleBadgeVariant(user.role)}>
                          {user.roleLabel}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
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
                      <TableCell className="text-sm">{user.lastLogin}</TableCell>
                      <TableCell className="text-sm">
                        <div className="flex items-center gap-0">
                          {user.role === 'staff' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setPermissionsUserId(user.id)}
                              title="設定模組權限"
                            >
                              <Settings2 className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleResendInvite(user.id, user.name)}
                            title="重新發送邀請連結"
                            className="hover:bg-primary group"
                          >
                            <Mail className="h-4 w-4 text-primary group-hover:text-white transition-colors" />
                          </Button>
                          <Button
                            variant="ghost-destructive"
                            size="icon"
                            onClick={() => handleDeleteClick(user.id)}
                          >
                            <Trash2 className="h-4 w-4" />
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
            {isLoading ? (
              <div className="text-center py-8">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
              </div>
            ) : users.length === 0 ? (
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
                          <Badge variant={getRoleBadgeVariant(user.role)} className="mt-1">
                            {user.roleLabel}
                          </Badge>
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
                        {user.role === 'staff' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setPermissionsUserId(user.id)}
                            title="設定模組權限"
                          >
                            <Settings2 className="h-5 w-5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleResendInvite(user.id, user.name)}
                          title="重新發送邀請連結"
                          className="hover:bg-primary group"
                        >
                          <Mail className="h-5 w-5 text-primary group-hover:text-white transition-colors" />
                        </Button>
                        <Button
                          variant="ghost-destructive"
                          size="icon"
                          onClick={() => handleDeleteClick(user.id)}
                        >
                          <Trash2 className="h-5 w-5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除</AlertDialogTitle>
            <AlertDialogDescription>
              確定要移除此帳號的存取權限嗎？此操作將移除該用戶對此住宿設施的存取權限，但不會刪除用戶帳號本身。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              確認移除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {permissionsUserId && accommodationId && (
        <StaffPermissionsDialog
          open={!!permissionsUserId}
          onOpenChange={(o) => !o && setPermissionsUserId(null)}
          userId={permissionsUserId}
          accommodationId={accommodationId}
        />
      )}
    </div>
  );
};

export default Accounts;
