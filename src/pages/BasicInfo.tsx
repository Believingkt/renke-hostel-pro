import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Edit, MapPin, ExternalLink, Info } from "lucide-react";


const BasicInfo = () => {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">帳務資訊</h1>

      {/* 聯絡人及帳務管理 */}
      <Card>
            <CardHeader>
              <CardTitle>聯絡人及帳務管理</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>聯絡人姓名</Label>
                  <Input />
                </div>
                <div className="space-y-2">
                  <Label>電子郵件</Label>
                  <Input type="email" />
                </div>
                <div className="space-y-2">
                  <Label>聯絡電話</Label>
                  <Input />
                </div>
                <div className="space-y-2">
                  <Label>傳真號碼</Label>
                  <Input />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>統一編號</Label>
                  <Input />
                </div>
              </div>

              {/* 代收房費匯款帳號 */}
              <div className="space-y-4 pt-4 border-t">
                <h3 className="font-semibold">代收房費匯款帳號</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>銀行/分行名稱</Label>
                    <Input />
                  </div>
                  <div className="space-y-2">
                    <Label>帳戶名稱</Label>
                    <Input />
                  </div>
                  <div className="space-y-2">
                    <Label>銀行帳號</Label>
                    <Input />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>帳戶類別</Label>
                  <Input />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 訂金設定 */}
          <Card>
            <CardHeader>
              <CardTitle>訂金設定</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-2">
                  <Label>使用訂金</Label>
                  <RadioGroup defaultValue="yes" className="flex gap-4">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="yes" id="deposit-yes" />
                      <Label htmlFor="deposit-yes">是</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="no" id="deposit-no" />
                      <Label htmlFor="no">否 (全額付款)</Label>
                    </div>
                  </RadioGroup>
                </div>
                <div className="space-y-2">
                  <Label>訂金比例</Label>
                  <div className="flex gap-2">
                    <Input type="number" className="flex-1" />
                    <div className="w-16 h-10 flex items-center justify-center bg-muted rounded-md">
                      <span className="text-sm">%</span>
                    </div>
                  </div>
                </div>
              </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BasicInfo;
