import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Globe } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const WebsiteContent = () => {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState("facilities");

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Globe className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold tracking-tight">官網內容</h1>
          <p className="text-muted-foreground">管理網站內容與設定</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="facilities">旅宿設施與服務</TabsTrigger>
        </TabsList>

        {/* 旅宿設施與服務 */}
        <TabsContent value="facilities" className="space-y-6">
          {/* 公共區設施與服務 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                旅宿設施
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="flex items-center justify-between cursor-pointer">
                  <h3 className="font-semibold">公共區設施與服務</h3>
                </div>
                
                <div className="grid grid-cols-4 gap-6">
                  {/* Column 1 */}
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox id="meeting-room" />
                      <Label htmlFor="meeting-room">會議室</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="business-center" />
                      <Label htmlFor="business-center">商務中心</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="baby-pool" defaultChecked />
                      <Label htmlFor="baby-pool" className="text-stat-green">嬰兒澡盆</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="hot-spring" />
                      <Label htmlFor="hot-spring">溫泉</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="kids-play-area" defaultChecked />
                      <Label htmlFor="kids-play-area" className="text-stat-green">兒童遊戲區</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="elevator" />
                      <Label htmlFor="elevator">電梯</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="water-purifier" />
                      <Label htmlFor="water-purifier">全棟除氯軟水系統</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="zero-food" />
                      <Label htmlFor="zero-food">零食區</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="password-lock" />
                      <Label htmlFor="password-lock">密碼鎖進出</Label>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox id="portable-wifi" />
                        <Label htmlFor="portable-wifi">攜帶式 WIFI 分享器</Label>
                      </div>
                      <Select defaultValue="free">
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free">免費提供</SelectItem>
                          <SelectItem value="paid">需額外付費</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox id="car-rental" />
                        <Label htmlFor="car-rental">機車租借</Label>
                      </div>
                      <Select defaultValue="free">
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free">免費提供</SelectItem>
                          <SelectItem value="paid">需額外付費</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox id="chademo-charger" />
                        <Label htmlFor="chademo-charger">CHAdeMO電動車充電設備</Label>
                      </div>
                      <Select defaultValue="free">
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free">免費提供</SelectItem>
                          <SelectItem value="paid">需額外付費</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox id="gas-station" />
                        <Label htmlFor="gas-station">外包油壓按摩</Label>
                      </div>
                      <Select defaultValue="free">
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free">免費提供</SelectItem>
                          <SelectItem value="paid">需額外付費</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Column 2 */}
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox id="shuttle" defaultChecked />
                      <Label htmlFor="shuttle" className="text-stat-green">交通廳</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="public-fridge" defaultChecked />
                      <Label htmlFor="public-fridge" className="text-stat-green">公用冰箱</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="currency-exchange" />
                      <Label htmlFor="currency-exchange">外幣兌換</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="gym" />
                      <Label htmlFor="gym">健身房</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="indoor-pool" />
                      <Label htmlFor="indoor-pool">室內游泳池</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="lift" />
                      <Label htmlFor="lift">需上下樓梯</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="beach" defaultChecked />
                      <Label htmlFor="beach" className="text-stat-green">沖沙處</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="vending-machine" />
                      <Label htmlFor="vending-machine">自動販賣機</Label>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox id="luggage-storage" defaultChecked />
                        <Label htmlFor="luggage-storage" className="text-stat-green">行李寄放</Label>
                      </div>
                      <Select defaultValue="free">
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free">免費提供</SelectItem>
                          <SelectItem value="paid">需額外付費</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox id="message-cabinet" />
                        <Label htmlFor="message-cabinet">寄放櫃</Label>
                      </div>
                      <Select defaultValue="free">
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free">免費提供</SelectItem>
                          <SelectItem value="paid">需額外付費</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox id="bbq" />
                        <Label htmlFor="bbq">BBQ 燒烤設備</Label>
                      </div>
                      <Select defaultValue="free">
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free">免費提供</SelectItem>
                          <SelectItem value="paid">需額外付費</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox id="j1772-charger" />
                        <Label htmlFor="j1772-charger">J1772電動車充電設備</Label>
                      </div>
                      <Select defaultValue="free">
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free">免費提供</SelectItem>
                          <SelectItem value="paid">需額外付費</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox id="pet-friendly" defaultChecked />
                        <Label htmlFor="pet-friendly" className="text-stat-green">寵物友善</Label>
                      </div>
                      <Select defaultValue="purchase">
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free">免費提供</SelectItem>
                          <SelectItem value="purchase">需額外購買，現場付費</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Column 3 */}
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox id="public-computer" />
                      <Label htmlFor="public-computer">公共電腦</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="dehumidifier" />
                      <Label htmlFor="dehumidifier">變壓器</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="travel-ticket" />
                      <Label htmlFor="travel-ticket">代售旅遊票券</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="public-bath" />
                      <Label htmlFor="public-bath">公共浴池</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="outdoor-pool" defaultChecked />
                      <Label htmlFor="outdoor-pool" className="text-stat-green">戶外游泳池</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="rotator" />
                      <Label htmlFor="rotator">轉接頭</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="wheelchair-repair" />
                      <Label htmlFor="wheelchair-repair">輪椅車維修區</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="souvenir-shop" />
                      <Label htmlFor="souvenir-shop">販賣商店</Label>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox id="laundry" />
                        <Label htmlFor="laundry">自助洗衣設備</Label>
                      </div>
                      <Select defaultValue="free">
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free">免費提供</SelectItem>
                          <SelectItem value="paid">需額外付費</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox id="parking" defaultChecked />
                        <Label htmlFor="parking" className="text-stat-green">停車場</Label>
                      </div>
                      <Select defaultValue="free">
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free">免費提供</SelectItem>
                          <SelectItem value="paid">需額外付費</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox id="land-parking" />
                        <Label htmlFor="land-parking">提供場地租借</Label>
                      </div>
                      <Select defaultValue="free">
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free">免費提供</SelectItem>
                          <SelectItem value="paid">需額外付費</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox id="ccs1-charger" />
                        <Label htmlFor="ccs1-charger">CCS1電動車充電設備</Label>
                      </div>
                      <Select defaultValue="free">
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free">免費提供</SelectItem>
                          <SelectItem value="paid">需額外付費</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox id="ear-plug" />
                        <Label htmlFor="ear-plug">耳塞</Label>
                      </div>
                      <Select defaultValue="free">
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free">免費提供</SelectItem>
                          <SelectItem value="paid">需額外付費</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Column 4 */}
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox id="public-wifi" defaultChecked />
                      <Label htmlFor="public-wifi" className="text-stat-green">公共區域 WIFI</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="baby-bed" />
                      <Label htmlFor="baby-bed">嬰兒床</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="nursing-cloth" />
                      <Label htmlFor="nursing-cloth">奧斗 / 燙衣板</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="rooftop-bath" />
                      <Label htmlFor="rooftop-bath">露天浴池</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="garden" defaultChecked />
                      <Label htmlFor="garden" className="text-stat-green">花園</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="owner-live" />
                      <Label htmlFor="owner-live">與主人同住</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="arcade" />
                      <Label htmlFor="arcade">(醫位外) 公用街浴 / 集中浴間</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="no-pet" />
                      <Label htmlFor="no-pet">禁止寵物</Label>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox id="dry-cloth" />
                        <Label htmlFor="dry-cloth">自助烘衣設備</Label>
                      </div>
                      <Select defaultValue="free">
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free">免費提供</SelectItem>
                          <SelectItem value="paid">需額外付費</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox id="airport-shuttle" />
                        <Label htmlFor="airport-shuttle">機場接送</Label>
                      </div>
                      <Select defaultValue="free">
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free">免費提供</SelectItem>
                          <SelectItem value="paid">需額外付費</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox id="tesla-charger" defaultChecked />
                        <Label htmlFor="tesla-charger" className="text-stat-green">TESLA電動車充電設備</Label>
                      </div>
                      <Select defaultValue="free">
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free">免費提供</SelectItem>
                          <SelectItem value="paid">需額外付費</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox id="ccs2-charger" />
                        <Label htmlFor="ccs2-charger">CCS2電動車充電設備</Label>
                      </div>
                      <Select defaultValue="free">
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free">免費提供</SelectItem>
                          <SelectItem value="paid">需額外付費</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox id="port-shuttle" />
                        <Label htmlFor="port-shuttle">港口接送</Label>
                      </div>
                      <Select defaultValue="free">
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free">免費提供</SelectItem>
                          <SelectItem value="paid">需額外付費</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 餐飲設施 */}
          <Card>
            <CardHeader>
              <CardTitle>餐飲設施</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-6">
                <div className="flex items-center space-x-2">
                  <Checkbox id="restaurant" defaultChecked />
                  <Label htmlFor="restaurant" className="text-stat-green">餐廳</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="coffee" defaultChecked />
                  <Label htmlFor="coffee" className="text-stat-green">咖啡</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="public-kitchen" defaultChecked />
                  <Label htmlFor="public-kitchen" className="text-stat-green">公用廚房</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="reservation-service" defaultChecked />
                  <Label htmlFor="reservation-service" className="text-stat-green">代客訂餐服務</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="tea-coffee" />
                  <Label htmlFor="tea-coffee">茶 / 咖啡沖泡設施</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="public-tableware" defaultChecked />
                  <Label htmlFor="public-tableware" className="text-stat-green">公用用餐區</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="child-high-chair" defaultChecked />
                  <Label htmlFor="child-high-chair" className="text-stat-green">兒童高腳椅</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="water-dispenser" />
                  <Label htmlFor="water-dispenser">氣泡水機</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="pancake-machine" />
                  <Label htmlFor="pancake-machine">膠囊咖啡機</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="oven" />
                  <Label htmlFor="oven">烤箱</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="stove" />
                  <Label htmlFor="stove">爐台</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="toaster" />
                  <Label htmlFor="toaster">烤麵包機</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="dishwasher" />
                  <Label htmlFor="dishwasher">洗碗機</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="kettle" defaultChecked />
                  <Label htmlFor="kettle" className="text-stat-green">電熱水壺</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="independent-kitchen" />
                  <Label htmlFor="independent-kitchen">獨立廚房</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="outdoor-tableware" defaultChecked />
                  <Label htmlFor="outdoor-tableware" className="text-stat-green">戶外用餐區</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="kitchen-utensils" defaultChecked />
                  <Label htmlFor="kitchen-utensils" className="text-stat-green">廚房用具</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="microwave" defaultChecked />
                  <Label htmlFor="microwave" className="text-stat-green">微波爐</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="fridge" defaultChecked />
                  <Label htmlFor="fridge" className="text-stat-green">冰箱</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="tea-coffee-bath" />
                  <Label htmlFor="tea-coffee-bath">茶 / 咖啡沖泡設備</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="coffee-maker" />
                  <Label htmlFor="coffee-maker">咖啡機</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="free-coffee" />
                  <Label htmlFor="free-coffee">免費即溶咖啡</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="free-drink" defaultChecked />
                  <Label htmlFor="free-drink" className="text-stat-green">免費迎賓飲料</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="free-tea" />
                  <Label htmlFor="free-tea">免費茶包</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="drinking-machine" defaultChecked />
                  <Label htmlFor="drinking-machine" className="text-stat-green">飲水機</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="cup" defaultChecked />
                  <Label htmlFor="cup" className="text-stat-green">杯子</Label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 安全設施 */}
          <Card>
            <CardHeader>
              <CardTitle>安全設施</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-6">
                <div className="flex items-center space-x-2">
                  <Checkbox id="monitor" defaultChecked />
                  <Label htmlFor="monitor" className="text-stat-green">監視器</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="safe-box" defaultChecked />
                  <Label htmlFor="safe-box" className="text-stat-green">醫藥箱</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="fire-extinguisher" defaultChecked />
                  <Label htmlFor="fire-extinguisher" className="text-stat-green">滅火器</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="escape-equipment" defaultChecked />
                  <Label htmlFor="escape-equipment" className="text-stat-green">逃生設備</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="water-sprinkler" />
                  <Label htmlFor="water-sprinkler">灑水設備</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="smoke-detector" />
                  <Label htmlFor="smoke-detector">煙霧偵測器</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="co-detector" />
                  <Label htmlFor="co-detector">一氧化碳偵測器</Label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 休閒娛樂設施 */}
          <Card>
            <CardHeader>
              <CardTitle>休閒娛樂設施</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-6">
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox id="karaoke" defaultChecked />
                    <Label htmlFor="karaoke" className="text-stat-green">卡拉OK</Label>
                  </div>
                  <Select defaultValue="select">
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="select">請選擇</SelectItem>
                      <SelectItem value="free">免費提供</SelectItem>
                      <SelectItem value="paid">需額外付費</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="board-game" />
                  <Label htmlFor="board-game">桌遊</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="mahjong" />
                  <Label htmlFor="mahjong">麻將桌</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="e-mahjong" defaultChecked />
                  <Label htmlFor="e-mahjong" className="text-stat-green">電動麻將桌</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="bike-rental" />
                  <Label htmlFor="bike-rental">自行車租借</Label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 服務語言 */}
          <Card>
            <CardHeader>
              <CardTitle>服務語言</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-6">
                <div className="flex items-center space-x-2">
                  <Checkbox id="lang-zh" defaultChecked />
                  <Label htmlFor="lang-zh" className="text-stat-green">中文</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="lang-en" defaultChecked />
                  <Label htmlFor="lang-en" className="text-stat-green">英文</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="lang-ja" />
                  <Label htmlFor="lang-ja">日文</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="lang-ko" />
                  <Label htmlFor="lang-ko">韓文</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="lang-cant" />
                  <Label htmlFor="lang-cant">粵語</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="lang-thai" />
                  <Label htmlFor="lang-thai">泰文</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="lang-hokkien" defaultChecked />
                  <Label htmlFor="lang-hokkien" className="text-stat-green">閩南語</Label>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default WebsiteContent;
