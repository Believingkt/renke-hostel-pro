import { useState } from "react";
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
import { Plus, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface User {
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
  const [role, setRole] = useState("operator");

  const [users, setUsers] = useState<User[]>([
    {
      name: "森山寫照",
      email: "sensan.inn@gmail.com",
      lastLogin: "2025-10-20 08:37",
      role: "owner",
      roleLabel: "擁有者",
    },
    {
      name: "yushiuan0315",
      email: "yushiuan0315@gmail.com",
      lastLogin: "2025-06-20 09:44",
      role: "operator",
      roleLabel: "現場營運",
    },
    {
      name: "nokimi",
      email: "nokimi@gmail.com",
      lastLogin: "2025-10-15 09:14",
      role: "operator",
      roleLabel: "現場營運",
    },
    {
      name: "DOFI",
      email: "dofilab@gmail.com",
      lastLogin: "2025-10-18 10:41",
      role: "operator",
      roleLabel: "現場營運",
    },
  ]);

  const handleSubmit = () => {
    const roleLabel = role === "owner" ? "擁有者" : "現場營運";
    const newUser: User = {
      name,
      email,
      lastLogin: new Date().toLocaleString("zh-TW", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }),
      role,
      roleLabel,
    };
    
    setUsers([...users, newUser]);
    setOpen(false);
    setName("");
    setEmail("");
    setRole("operator");
  };

  const handleDelete = (email: string) => {
    setUsers(users.filter((user) => user.email !== email));
  };

  return (
    <div className="space-y-4 md:space-y-6 p-4 md:p-0">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">帳號權限管理</h1>
        
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
                設定新帳號的名稱、帳號和權限
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
                <Label htmlFor="email">帳號</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="請輸入帳號"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">權限</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger id="role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">擁有者</SelectItem>
                    <SelectItem value="operator">現場營運</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                取消
              </Button>
              <Button onClick={handleSubmit}>確認</Button>
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
                  <TableHead>帳號</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead>最後登入日期</TableHead>
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
                  users.map((user, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{user.name}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>{user.roleLabel}</TableCell>
                      <TableCell>{user.lastLogin}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(user.email)}
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
              users.map((user, index) => (
                <Card key={index}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 space-y-2 min-w-0">
                        <div>
                          <p className="text-xs text-muted-foreground">名稱</p>
                          <p className="font-medium">{user.name}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">帳號</p>
                          <p className="text-sm break-all">{user.email}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">角色</p>
                          <p className="text-sm">{user.roleLabel}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">最後登入日期</p>
                          <p className="text-sm">{user.lastLogin}</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        onClick={() => handleDelete(user.email)}
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
