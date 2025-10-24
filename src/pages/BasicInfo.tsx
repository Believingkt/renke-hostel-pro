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
          <TabsTrigger value="rooms">房型管理</TabsTrigger>
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

          {/* 旅館資訊 */}
          <Card>
            <CardHeader>
              <CardTitle>旅館資訊</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 旅宿名稱 */}
              <div className="space-y-2">
                <Label>旅宿名稱</Label>
                <Input />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>旅宿類型</Label>
                  <select className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option>露營地</option>
                    <option>民宿</option>
                    <option>旅館</option>
                    <option>飯店</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>客房總數</Label>
                  <Input type="number" />
                </div>
              </div>

              {/* 旅宿登記字號 */}
              <div className="space-y-2">
                <Label>旅宿登記字號</Label>
                <RadioGroup defaultValue="no" className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="yes" id="yes" />
                    <Label htmlFor="yes">是</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="no" id="no" />
                    <Label htmlFor="no">否</Label>
                  </div>
                </RadioGroup>
                <Input placeholder="" className="mt-2" />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>星級評等</Label>
                  <select className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option>不適用</option>
                    <option>1星級</option>
                    <option>2星級</option>
                    <option>3星級</option>
                    <option>4星級</option>
                    <option>5星級</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>官網首頁</Label>
                  <Input placeholder="" />
                </div>
              </div>

              {/* 短網址別名 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label>短網址別名</Label>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    className="flex-1"
                    disabled
                  />
                  <Input className="flex-1" />
                  <Button variant="ghost" size="icon">
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* 更多資訊 */}
              <div className="space-y-4 pt-4 border-t">
                <div className="flex items-center gap-2">
                  <Label>更多資訊</Label>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="space-y-4 p-4 border rounded-lg">
                  <div className="flex justify-between items-center">
                    <Label>標題</Label>
                    <Button variant="ghost" size="sm" className="text-red-500">
                      刪除
                    </Button>
                  </div>
                  <Input />
                  <Input />
                </div>
                <Button variant="outline" className="gap-2">
                  <Plus className="h-4 w-4" />
                  自訂欄位
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 旅宿描述 */}
          <Card>
            <CardHeader>
              <CardTitle>旅宿描述</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Textarea
                  rows={8}
                  className="resize-none"
                />
                <div className="text-right text-sm text-muted-foreground">0 / 3000</div>
              </div>
            </CardContent>
          </Card>

          {/* 旅宿入住須知 */}
          <Card>
            <CardHeader>
              <CardTitle>旅宿入住須知</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Textarea
                  rows={10}
                  className="resize-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>國家</Label>
                  <select className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option>台灣</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>區域1</Label>
                  <select className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option>宜蘭縣</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>區域2</Label>
                  <select className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option>冬山鄉</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 通訊地址 */}
          <Card>
            <CardHeader>
              <CardTitle>通訊地址</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Input
                    className="flex-1"
                  />
                  <Button variant="ghost" size="icon">
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* 地圖預覽 */}
              <div className="relative h-80 bg-muted rounded-lg overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center space-y-2">
                    <MapPin className="h-12 w-12 mx-auto text-muted-foreground" />
                    <p className="text-muted-foreground">地圖預覽區域</p>
                    <div className="space-y-1 text-sm">
                      <p className="font-mono">24°38'12.6"N 121°43'07.9"E</p>
                      <p className="text-muted-foreground">JPP9+PGQ 大進村 宜蘭縣冬山鄉</p>
                    </div>
                    <div className="flex gap-2 justify-center pt-2">
                      <Button variant="link" size="sm" className="gap-1">
                        <MapPin className="h-3 w-3" />
                        路線
                      </Button>
                      <Button variant="link" size="sm">
                        顯示詳細地圖
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>地理位置：</Label>
              </div>

              {/* 照片上傳 */}
              <div className="space-y-2">
                <Label>照片（最多20張，檔案上限20MB，限JPEG或PNG格式）</Label>
                <div className="border-2 border-dashed rounded-lg p-12 text-center hover:border-primary/50 transition-colors cursor-pointer">
                  <Plus className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">點擊上傳照片</p>
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
