import { useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import { Plus } from "lucide-react";

const Accounts = () => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("operator");
  const owners = [
    {
      name: "森山寧照",
      email: "sensan.inn@gmail.com",
      lastLogin: "2025-10-20 08:37",
    },
  ];

  const operators = [
    {
      name: "yushiuan0315",
      email: "yushiuan0315@gmail.com",
      lastLogin: "2025-06-20 09:44",
    },
    {
      name: "nokimi",
      email: "nokimi@gmail.com",
      lastLogin: "2025-10-15 09:14",
    },
    {
      name: "DOFI",
      email: "dofilab@gmail.com",
      lastLogin: "2025-10-18 10:41",
    },
  ];

  const handleSubmit = () => {
    // 這裡可以添加提交邏輯
    console.log({ name, email, role });
    setOpen(false);
    setName("");
    setEmail("");
    setRole("operator");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">帳號權限管理</h1>
        
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              新增
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

      <Accordion type="multiple" defaultValue={["owner", "operator"]} className="w-full">
        <AccordionItem value="owner">
          <AccordionTrigger className="text-lg font-semibold">
            擁有者
          </AccordionTrigger>
          <AccordionContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名稱</TableHead>
                  <TableHead>帳號</TableHead>
                  <TableHead>最後登入日期</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {owners.map((user, index) => (
                  <TableRow key={index}>
                    <TableCell>{user.name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{user.lastLogin}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="operator">
          <AccordionTrigger className="text-lg font-semibold">
            現場營運
          </AccordionTrigger>
          <AccordionContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名稱</TableHead>
                  <TableHead>帳號</TableHead>
                  <TableHead>最後登入日期</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {operators.map((user, index) => (
                  <TableRow key={index}>
                    <TableCell>{user.name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{user.lastLogin}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};

export default Accounts;
