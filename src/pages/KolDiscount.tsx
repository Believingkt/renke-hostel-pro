import { useState } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface DiscountCode {
  id: string;
  kolName: string;
  code: string;
  discountType: "percentage" | "amount";
  discountValue: number;
  usageLimit: number;
  usedCount: number;
}

const KolDiscount = () => {
  const [open, setOpen] = useState(false);
  const [kolName, setKolName] = useState("");
  const [discountType, setDiscountType] = useState<"percentage" | "amount">("percentage");
  const [discountValue, setDiscountValue] = useState("");
  const [usageLimit, setUsageLimit] = useState("");
  const { toast } = useToast();

  const [discountCodes, setDiscountCodes] = useState<DiscountCode[]>([
    {
      id: "1",
      kolName: "小明",
      code: "ABC12",
      discountType: "percentage",
      discountValue: 10,
      usageLimit: 100,
      usedCount: 23,
    },
    {
      id: "2",
      kolName: "小美",
      code: "XYZ34",
      discountType: "amount",
      discountValue: 500,
      usageLimit: 50,
      usedCount: 8,
    },
  ]);

  const generateCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const handleSubmit = () => {
    if (!kolName || !discountValue || !usageLimit) {
      toast({
        title: "請填寫所有欄位",
        variant: "destructive",
      });
      return;
    }

    const newCode: DiscountCode = {
      id: Date.now().toString(),
      kolName,
      code: generateCode(),
      discountType,
      discountValue: parseFloat(discountValue),
      usageLimit: parseInt(usageLimit),
      usedCount: 0,
    };

    setDiscountCodes([...discountCodes, newCode]);
    setOpen(false);
    setKolName("");
    setDiscountValue("");
    setUsageLimit("");
    setDiscountType("percentage");

    toast({
      title: "折扣碼新增成功",
      description: `折扣碼：${newCode.code}`,
    });
  };

  const handleDelete = (id: string) => {
    setDiscountCodes(discountCodes.filter((code) => code.id !== id));
    toast({
      title: "折扣碼已刪除",
    });
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({
      title: "已複製折扣碼",
      description: code,
    });
  };

  const formatDiscount = (type: "percentage" | "amount", value: number) => {
    return type === "percentage" ? `${value}%` : `NT$ ${value}`;
  };

  return (
    <div className="space-y-4 md:space-y-6 p-4 md:p-0">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          折扣代碼
        </h1>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 w-full md:w-auto">
              <Plus className="h-4 w-4" />
              新增折扣碼
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新增折扣碼</DialogTitle>
              <DialogDescription>
                設定名稱和折扣內容，系統將自動生成折扣碼
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="kolName">名稱</Label>
                <Input
                  id="kolName"
                  value={kolName}
                  onChange={(e) => setKolName(e.target.value)}
                  placeholder="請輸入名稱"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="discountType">折扣類型</Label>
                <Select
                  value={discountType}
                  onValueChange={(value: "percentage" | "amount") =>
                    setDiscountType(value)
                  }
                >
                  <SelectTrigger id="discountType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">折扣 %</SelectItem>
                    <SelectItem value="amount">折扣金額</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="discountValue">
                  {discountType === "percentage" ? "折扣百分比" : "折扣金額"}
                </Label>
                <Input
                  id="discountValue"
                  type="number"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  placeholder={
                    discountType === "percentage"
                      ? "例如：10 代表 10%"
                      : "例如：500 代表 NT$ 500"
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="usageLimit">使用次數上限</Label>
                <Input
                  id="usageLimit"
                  type="number"
                  min="1"
                  value={usageLimit}
                  onChange={(e) => setUsageLimit(e.target.value)}
                  placeholder="例如：100"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                取消
              </Button>
              <Button onClick={handleSubmit}>確認新增</Button>
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
                  <TableHead>折扣碼</TableHead>
                  <TableHead>折扣內容</TableHead>
                  <TableHead>使用次數上限</TableHead>
                  <TableHead>已使用次數</TableHead>
                  <TableHead className="w-[100px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {discountCodes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      尚無折扣碼
                    </TableCell>
                  </TableRow>
                ) : (
                  discountCodes.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.kolName}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <code className="px-2 py-1 bg-muted rounded text-sm font-mono">
                            {item.code}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleCopyCode(item.code)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        {formatDiscount(item.discountType, item.discountValue)}
                      </TableCell>
                      <TableCell>{item.usageLimit} 次</TableCell>
                      <TableCell>{item.usedCount} 次</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(item.id)}
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
            {discountCodes.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                尚無折扣碼
              </p>
            ) : (
              discountCodes.map((item) => (
                <Card key={item.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 space-y-2 min-w-0">
                        <div>
                          <p className="text-xs text-muted-foreground">名稱</p>
                          <p className="font-medium">{item.kolName}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">折扣碼</p>
                          <div className="flex items-center gap-2">
                            <code className="px-2 py-1 bg-muted rounded text-sm font-mono">
                              {item.code}
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleCopyCode(item.code)}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">折扣內容</p>
                          <p className="text-sm">
                            {formatDiscount(item.discountType, item.discountValue)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">使用次數上限</p>
                          <p className="text-sm">{item.usageLimit} 次</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">已使用次數</p>
                          <p className="text-sm">{item.usedCount} 次</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        onClick={() => handleDelete(item.id)}
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

export default KolDiscount;