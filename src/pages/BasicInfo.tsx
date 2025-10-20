import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Plus, Edit, MapPin, ExternalLink, Info } from "lucide-react";

const BasicInfo = () => {
  const [activeTab, setActiveTab] = useState("info");
  const [language, setLanguage] = useState("zh");

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">基本資訊</h1>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="info">旅館資訊</TabsTrigger>
          <TabsTrigger value="booking">官網訂房資訊</TabsTrigger>
          <TabsTrigger value="facilities">旅宿設施</TabsTrigger>
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
                  <Input placeholder="潘禹璇" />
                </div>
                <div className="space-y-2">
                  <Label>電子郵件</Label>
                  <Input type="email" placeholder="sensan.inn@gmail.com" />
                </div>
                <div className="space-y-2">
                  <Label>聯絡電話</Label>
                  <Input placeholder="0903178518" />
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
                <h3 className="font-semibold">代收房費匯款帳號(與丁丁打撥款用)</h3>
                <div className="grid grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
                  <div>
                    <Label className="text-sm text-muted-foreground mb-2 block">銀行/分行名稱</Label>
                    <p className="text-sm">108 陽信商業銀行 / 1081053 陽信商業銀行羅東分行</p>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground mb-2 block">帳戶名稱</Label>
                    <p className="text-sm">人客多股份有限公司</p>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground mb-2 block">銀行帳號</Label>
                    <p className="text-sm">121450000353</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>帳戶類別</Label>
                  <Input placeholder="公司" />
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
                <div className="flex items-center justify-between">
                  <Label>旅宿名稱</Label>
                  <div className="flex gap-2">
                    <Button
                      variant={language === "zh" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setLanguage("zh")}
                    >
                      中
                    </Button>
                    <Button
                      variant={language === "en" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setLanguage("en")}
                    >
                      英
                    </Button>
                    <Button
                      variant={language === "ja" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setLanguage("ja")}
                    >
                      日
                    </Button>
                  </div>
                </div>
                <Input placeholder="森山寫照" />
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
                  <Input type="number" placeholder="10" />
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
                <div className="flex gap-2">
                  <div className="flex gap-2 mb-2">
                    <Button
                      variant={language === "zh" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setLanguage("zh")}
                    >
                      中
                    </Button>
                    <Button
                      variant={language === "en" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setLanguage("en")}
                    >
                      英
                    </Button>
                    <Button
                      variant={language === "ja" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setLanguage("ja")}
                    >
                      日
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value="https://www.booking-owlnest.com/"
                    className="flex-1"
                    disabled
                  />
                  <Input placeholder="sensan.inn" className="flex-1" />
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
                    <div className="flex gap-2">
                      <Button
                        variant={language === "zh" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setLanguage("zh")}
                      >
                        中
                      </Button>
                      <Button
                        variant={language === "en" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setLanguage("en")}
                      >
                        英
                      </Button>
                      <Button
                        variant={language === "ja" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setLanguage("ja")}
                      >
                        日
                      </Button>
                    </div>
                    <Button variant="ghost" size="sm" className="text-red-500">
                      刪除
                    </Button>
                  </div>
                  <Input placeholder="" />
                  <Input placeholder="網址需包含https://" />
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
                <div className="flex justify-end gap-2">
                  <Button
                    variant={language === "zh" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setLanguage("zh")}
                  >
                    中
                  </Button>
                  <Button
                    variant={language === "en" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setLanguage("en")}
                  >
                    英
                  </Button>
                  <Button
                    variant={language === "ja" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setLanguage("ja")}
                  >
                    日
                  </Button>
                </div>
                <Textarea
                  placeholder="自然環抱中的日式私人莊園..."
                  rows={8}
                  className="resize-none"
                />
                <div className="text-right text-sm text-muted-foreground">315 / 3000</div>
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
                <div className="flex justify-end gap-2">
                  <Button
                    variant={language === "zh" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setLanguage("zh")}
                  >
                    中
                  </Button>
                  <Button
                    variant={language === "en" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setLanguage("en")}
                  >
                    英
                  </Button>
                  <Button
                    variant={language === "ja" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setLanguage("ja")}
                  >
                    日
                  </Button>
                </div>
                <Textarea
                  placeholder="入住時間（Check-in Time）：下午15:00-19:00辦理入住手續。"
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
                    value="269台灣宜蘭縣冬山鄉大進三路"
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
                <Label>地理位置：24.63684400, 121.71885900</Label>
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
        <TabsContent value="booking">
          <Card>
            <CardContent className="py-12">
              <p className="text-center text-muted-foreground">官網訂房資訊功能開發中...</p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 旅宿設施 */}
        <TabsContent value="facilities">
          <Card>
            <CardContent className="py-12">
              <p className="text-center text-muted-foreground">旅宿設施功能開發中...</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default BasicInfo;
