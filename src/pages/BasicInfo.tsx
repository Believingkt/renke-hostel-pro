import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState("info");

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">基本資訊</h1>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="info">官網旅宿資訊</TabsTrigger>
          <TabsTrigger value="booking">官網訂房資訊</TabsTrigger>
        </TabsList>

        {/* 旅館資訊標籤 */}
        <TabsContent value="info" className="space-y-6">
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
        </TabsContent>

        {/* 官網訂房資訊 */}
        <TabsContent value="booking" className="space-y-6">
          {/* 收款資訊 */}
          <Card>
            <CardHeader>
              <CardTitle>收款資訊</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <h3 className="font-semibold">手動訂單匯款帳號(旅客匯款用)</h3>
                
                <div className="flex items-center space-x-2">
                  <Checkbox id="same-account" />
                  <Label htmlFor="same-account" className="text-sm">
                    同收款帳戶資料 (撥款用)
                  </Label>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>選擇銀行</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="108">108 陽信商業銀行</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>選擇分行</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1081053">1081053 陽信商業銀行羅東分行</SelectItem>
                      </SelectContent>
                    </Select>
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
              </div>

              <div className="space-y-4 pt-4 border-t">
                <h3 className="font-semibold">開立發票資訊(用於房費金流手續費)</h3>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>公司抬頭</Label>
                    <Input />
                  </div>
                  <div className="space-y-2">
                    <Label>統一編號</Label>
                    <Input />
                  </div>
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

              <div className="space-y-4 pt-4 border-t">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">支付方式(手續費)</h3>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Checkbox id="atm" defaultChecked />
                        <Label htmlFor="atm" className="flex items-center gap-2">
                          <span className="font-medium">ATM/匯款</span>
                          <Info className="h-4 w-4 text-muted-foreground" />
                        </Label>
                      </div>
                      <span className="text-sm text-muted-foreground">(2.5%)</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Checkbox id="applepay" defaultChecked />
                      <Label htmlFor="applepay" className="font-medium">Apple Pay</Label>
                    </div>
                    <span className="text-sm text-muted-foreground">(2.5%)</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Checkbox id="linepay" />
                      <Label htmlFor="linepay" className="font-medium">LINE Pay</Label>
                    </div>
                    <span className="text-sm text-muted-foreground">(3.5%)</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Checkbox id="paypal" />
                      <Label htmlFor="paypal" className="font-medium">PayPal</Label>
                    </div>
                    <span className="text-sm text-muted-foreground">(4.5%)</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Checkbox id="unionpay" />
                      <Label htmlFor="unionpay" className="font-medium">UnionPay</Label>
                    </div>
                    <span className="text-sm text-muted-foreground">(2.5%)</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Checkbox id="creditcard" defaultChecked />
                      <Label htmlFor="creditcard" className="font-medium">VISA / MasterCard / JCB</Label>
                    </div>
                    <span className="text-sm text-muted-foreground">(2.5%)</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 接待限制 */}
          <Card>
            <CardHeader>
              <CardTitle>接待限制</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b">
                <div className="flex items-center gap-4">
                  <Switch id="infant" />
                  <Label htmlFor="infant" className="text-muted-foreground">不接待</Label>
                </div>
                <Label className="font-medium">嬰幼兒</Label>
              </div>

              <div className="space-y-3 py-3 border-b">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Switch id="child" />
                    <Label htmlFor="child" className="text-muted-foreground">不接待</Label>
                  </div>
                  <Label className="font-medium">兒童</Label>
                </div>
                <div className="flex items-center gap-4 ml-16">
                  <Input type="number" className="w-24" />
                  <span className="text-sm">-</span>
                  <Input type="number" className="w-24" />
                  <span className="text-sm">歲</span>
                </div>
              </div>

              <div className="flex items-center justify-between py-3">
                <div className="flex items-center gap-4">
                  <Switch id="adult" defaultChecked />
                  <Label htmlFor="adult" className="text-primary">接待</Label>
                </div>
                <div className="text-right">
                  <Label className="font-medium block">成人</Label>
                  <span className="text-sm text-muted-foreground">13 歲以上</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 進階設定 */}
          <Card>
            <CardHeader>
              <CardTitle>進階設定</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3 py-3 border-b">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Switch id="show-phone" defaultChecked />
                    <Label htmlFor="show-phone" className="text-primary">顯示</Label>
                  </div>
                  <Label className="font-medium">聯絡電話</Label>
                </div>
                <p className="text-sm text-muted-foreground ml-16">0903178518</p>
              </div>

              <div className="space-y-3 py-3 border-b">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Switch id="show-email" />
                    <Label htmlFor="show-email" className="text-muted-foreground">不顯示</Label>
                  </div>
                  <Label className="font-medium">電子郵件</Label>
                </div>
                <p className="text-sm text-muted-foreground ml-16">sensan.inn@gmail.com</p>
              </div>

              <div className="flex items-center justify-between py-3 border-b">
                <div className="flex items-center gap-4">
                  <Switch id="show-website" defaultChecked />
                  <Label htmlFor="show-website" className="text-primary">顯示</Label>
                </div>
                <Label className="font-medium">官網首頁</Label>
              </div>

              <div className="space-y-3 py-3 border-b">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Switch id="block-warning" defaultChecked />
                    <Label htmlFor="block-warning" className="text-primary">阻擋</Label>
                  </div>
                  <Label className="font-medium">人數不符警語</Label>
                </div>
                <p className="text-sm text-muted-foreground ml-16">不提供「續攬」按鈕</p>
              </div>

              <div className="space-y-3 py-3 border-b">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Switch id="force-select" defaultChecked />
                    <Label htmlFor="force-select" className="text-primary">強制</Label>
                  </div>
                  <Label className="font-medium">人數選擇</Label>
                </div>
                <p className="text-sm text-muted-foreground ml-16">必須選擇人數後，才能繼續訂房流程</p>
              </div>

              <div className="space-y-3 py-3 border-b">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Switch id="expand-plan" />
                    <Label htmlFor="expand-plan" className="text-muted-foreground">展開</Label>
                  </div>
                  <Label className="font-medium">專案說明</Label>
                </div>
                <p className="text-sm text-muted-foreground ml-16">展開全部，顯示完整文字</p>
              </div>

              <div className="space-y-3 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Switch id="plan-sort" />
                    <Label htmlFor="plan-sort" className="text-muted-foreground">專案排序</Label>
                  </div>
                  <Label className="font-medium">專案排序</Label>
                </div>
                <p className="text-sm text-muted-foreground ml-16">依照專案設定內排序</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 房型管理 */}
        <TabsContent value="rooms" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>房型管理</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">房型管理內容</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      
    </div>
  );
};

export default BasicInfo;
