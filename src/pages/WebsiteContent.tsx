import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Globe } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// 定義所有設施項目
const facilitiesData = {
  public: [
    { id: 'meeting-room', name: '會議室', hasPrice: false },
    { id: 'business-center', name: '商務中心', hasPrice: false },
    { id: 'baby-pool', name: '嬰兒澡盆', hasPrice: false },
    { id: 'hot-spring', name: '溫泉', hasPrice: false },
    { id: 'kids-play-area', name: '兒童遊戲區', hasPrice: false },
    { id: 'elevator', name: '電梯', hasPrice: false },
    { id: 'water-purifier', name: '全棟除氯軟水系統', hasPrice: false },
    { id: 'zero-food', name: '零食區', hasPrice: false },
    { id: 'password-lock', name: '密碼鎖進出', hasPrice: false },
    { id: 'portable-wifi', name: '攜帶式 WIFI 分享器', hasPrice: true },
    { id: 'car-rental', name: '機車租借', hasPrice: true },
    { id: 'chademo-charger', name: 'CHAdeMO電動車充電設備', hasPrice: true },
    { id: 'gas-station', name: '外包油壓按摩', hasPrice: true },
    { id: 'shuttle', name: '交通廳', hasPrice: false },
    { id: 'public-fridge', name: '公用冰箱', hasPrice: false },
    { id: 'currency-exchange', name: '外幣兌換', hasPrice: false },
    { id: 'gym', name: '健身房', hasPrice: false },
    { id: 'indoor-pool', name: '室內游泳池', hasPrice: false },
    { id: 'lift', name: '需上下樓梯', hasPrice: false },
    { id: 'beach', name: '沖沙處', hasPrice: false },
    { id: 'vending-machine', name: '自動販賣機', hasPrice: false },
    { id: 'luggage-storage', name: '行李寄放', hasPrice: true },
    { id: 'message-cabinet', name: '寄放櫃', hasPrice: true },
    { id: 'bbq', name: 'BBQ 燒烤設備', hasPrice: true },
    { id: 'j1772-charger', name: 'J1772電動車充電設備', hasPrice: true },
    { id: 'pet-friendly', name: '寵物友善', hasPrice: true },
    { id: 'public-computer', name: '公共電腦', hasPrice: false },
    { id: 'dehumidifier', name: '變壓器', hasPrice: false },
    { id: 'travel-ticket', name: '代售旅遊票券', hasPrice: false },
    { id: 'public-bath', name: '公共浴池', hasPrice: false },
    { id: 'outdoor-pool', name: '戶外游泳池', hasPrice: false },
    { id: 'rotator', name: '轉接頭', hasPrice: false },
    { id: 'wheelchair-repair', name: '輪椅車維修區', hasPrice: false },
    { id: 'souvenir-shop', name: '販賣商店', hasPrice: false },
    { id: 'laundry', name: '自助洗衣設備', hasPrice: true },
    { id: 'parking', name: '停車場', hasPrice: true },
    { id: 'land-parking', name: '提供場地租借', hasPrice: true },
    { id: 'ccs1-charger', name: 'CCS1電動車充電設備', hasPrice: true },
    { id: 'ear-plug', name: '耳塞', hasPrice: true },
    { id: 'public-wifi', name: '公共區域 WIFI', hasPrice: false },
    { id: 'baby-bed', name: '嬰兒床', hasPrice: false },
    { id: 'nursing-cloth', name: '奧斗 / 燙衣板', hasPrice: false },
    { id: 'rooftop-bath', name: '露天浴池', hasPrice: false },
    { id: 'garden', name: '花園', hasPrice: false },
    { id: 'owner-live', name: '與主人同住', hasPrice: false },
    { id: 'arcade', name: '(醫位外) 公用街浴 / 集中浴間', hasPrice: false },
    { id: 'no-pet', name: '禁止寵物', hasPrice: false },
    { id: 'dry-cloth', name: '自助烘衣設備', hasPrice: true },
    { id: 'airport-shuttle', name: '機場接送', hasPrice: true },
    { id: 'tesla-charger', name: 'TESLA電動車充電設備', hasPrice: true },
    { id: 'ccs2-charger', name: 'CCS2電動車充電設備', hasPrice: true },
    { id: 'port-shuttle', name: '港口接送', hasPrice: true },
  ],
  dining: [
    { id: 'restaurant', name: '餐廳', hasPrice: false },
    { id: 'coffee', name: '咖啡', hasPrice: false },
    { id: 'public-kitchen', name: '公用廚房', hasPrice: false },
    { id: 'reservation-service', name: '代客訂餐服務', hasPrice: false },
    { id: 'tea-coffee', name: '茶 / 咖啡沖泡設施', hasPrice: false },
    { id: 'public-tableware', name: '公用用餐區', hasPrice: false },
    { id: 'child-high-chair', name: '兒童高腳椅', hasPrice: false },
    { id: 'water-dispenser', name: '氣泡水機', hasPrice: false },
    { id: 'pancake-machine', name: '膠囊咖啡機', hasPrice: false },
    { id: 'oven', name: '烤箱', hasPrice: false },
    { id: 'stove', name: '爐台', hasPrice: false },
    { id: 'toaster', name: '烤麵包機', hasPrice: false },
    { id: 'dishwasher', name: '洗碗機', hasPrice: false },
    { id: 'kettle', name: '電熱水壺', hasPrice: false },
    { id: 'independent-kitchen', name: '獨立廚房', hasPrice: false },
    { id: 'outdoor-tableware', name: '戶外用餐區', hasPrice: false },
    { id: 'kitchen-utensils', name: '廚房用具', hasPrice: false },
    { id: 'microwave', name: '微波爐', hasPrice: false },
    { id: 'fridge', name: '冰箱', hasPrice: false },
    { id: 'tea-coffee-bath', name: '茶 / 咖啡沖泡設備', hasPrice: false },
    { id: 'coffee-maker', name: '咖啡機', hasPrice: false },
    { id: 'free-coffee', name: '免費即溶咖啡', hasPrice: false },
    { id: 'free-drink', name: '免費迎賓飲料', hasPrice: false },
    { id: 'free-tea', name: '免費茶包', hasPrice: false },
    { id: 'drinking-machine', name: '飲水機', hasPrice: false },
    { id: 'cup', name: '杯子', hasPrice: false },
  ],
  safety: [
    { id: 'monitor', name: '監視器', hasPrice: false },
    { id: 'safe-box', name: '醫藥箱', hasPrice: false },
    { id: 'fire-extinguisher', name: '滅火器', hasPrice: false },
    { id: 'escape-equipment', name: '逃生設備', hasPrice: false },
    { id: 'water-sprinkler', name: '灑水設備', hasPrice: false },
    { id: 'smoke-detector', name: '煙霧偵測器', hasPrice: false },
    { id: 'co-detector', name: '一氧化碳偵測器', hasPrice: false },
  ],
  entertainment: [
    { id: 'karaoke', name: '卡拉OK', hasPrice: true },
    { id: 'board-game', name: '桌遊', hasPrice: false },
    { id: 'mahjong', name: '麻將桌', hasPrice: false },
    { id: 'e-mahjong', name: '電動麻將桌', hasPrice: false },
    { id: 'bike-rental', name: '自行車租借', hasPrice: false },
  ],
  language: [
    { id: 'lang-zh', name: '中文', hasPrice: false },
    { id: 'lang-en', name: '英文', hasPrice: false },
    { id: 'lang-ja', name: '日文', hasPrice: false },
    { id: 'lang-ko', name: '韓文', hasPrice: false },
    { id: 'lang-cant', name: '粵語', hasPrice: false },
    { id: 'lang-thai', name: '泰文', hasPrice: false },
    { id: 'lang-hokkien', name: '閩南語', hasPrice: false },
  ],
};

const WebsiteContent = () => {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState("facilities");
  const [selectedFacilities, setSelectedFacilities] = useState<Record<string, boolean>>({});
  const [pricingTypes, setPricingTypes] = useState<Record<string, string>>({});
  const [accommodationId, setAccommodationId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  // 加載現有設施資料
  useEffect(() => {
    const loadFacilities = async () => {
      try {
        // 獲取 accommodation ID
        const { data: infoData } = await supabase
          .from("accommodation_info")
          .select("id")
          .maybeSingle();

        if (infoData) {
          setAccommodationId(infoData.id);

          // 加載現有設施
          const { data: facilities } = await supabase
            .from("accommodation_facilities")
            .select("*")
            .eq("accommodation_id", infoData.id)
            .eq("is_available", true);

          if (facilities) {
            const selected: Record<string, boolean> = {};
            const pricing: Record<string, string> = {};

            facilities.forEach(facility => {
              selected[facility.facility_name] = true;
              if (facility.pricing_type) {
                pricing[facility.facility_name] = facility.pricing_type;
              }
            });

            setSelectedFacilities(selected);
            setPricingTypes(pricing);
          }
        }
      } catch (error) {
        console.error('Error loading facilities:', error);
        toast.error('載入設施資料失敗');
      }
    };

    loadFacilities();
  }, []);

  const handleCheckboxChange = (facilityId: string, checked: boolean) => {
    setSelectedFacilities(prev => ({
      ...prev,
      [facilityId]: checked
    }));
  };

  const handlePricingTypeChange = (facilityId: string, value: string) => {
    setPricingTypes(prev => ({
      ...prev,
      [facilityId]: value
    }));
  };

  const handleSave = async () => {
    if (!accommodationId) {
      toast.error('找不到旅宿資訊');
      return;
    }

    setIsSaving(true);
    try {
      // 先刪除所有現有設施
      await supabase
        .from("accommodation_facilities")
        .delete()
        .eq("accommodation_id", accommodationId);

      // 準備要插入的設施資料
      const facilitiesToInsert = [];
      
      for (const [category, items] of Object.entries(facilitiesData)) {
        for (const item of items) {
          if (selectedFacilities[item.id]) {
            facilitiesToInsert.push({
              accommodation_id: accommodationId,
              facility_name: item.name,
              category: category,
              pricing_type: item.hasPrice ? (pricingTypes[item.id] || 'free') : 'included',
              is_available: true
            });
          }
        }
      }

      // 插入新資料
      if (facilitiesToInsert.length > 0) {
        const { error } = await supabase
          .from("accommodation_facilities")
          .insert(facilitiesToInsert);

        if (error) throw error;
      }

      toast.success('設施資料已保存');
    } catch (error) {
      console.error('Error saving facilities:', error);
      toast.error('保存失敗，請稍後再試');
    } finally {
      setIsSaving(false);
    }
  };

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
          <TabsTrigger value="facilities">設施與服務</TabsTrigger>
        </TabsList>

        <TabsContent value="facilities" className="space-y-6">
          {/* 公共區設施與服務 */}
          <Card>
            <CardHeader>
              <CardTitle>旅宿設施</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <h3 className="font-semibold">公共區設施與服務</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {facilitiesData.public.map((facility) => (
                    <div key={facility.id} className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={facility.id}
                          checked={selectedFacilities[facility.id] || false}
                          onCheckedChange={(checked) => 
                            handleCheckboxChange(facility.id, checked as boolean)
                          }
                        />
                        <Label htmlFor={facility.id}>{facility.name}</Label>
                      </div>
                      {facility.hasPrice && selectedFacilities[facility.id] && (
                        <Select
                          value={pricingTypes[facility.id] || 'free'}
                          onValueChange={(value) => handlePricingTypeChange(facility.id, value)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="free">免費提供</SelectItem>
                            <SelectItem value="paid">需額外付費</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  ))}
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
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {facilitiesData.dining.map((facility) => (
                  <div key={facility.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={facility.id}
                      checked={selectedFacilities[facility.id] || false}
                      onCheckedChange={(checked) => 
                        handleCheckboxChange(facility.id, checked as boolean)
                      }
                    />
                    <Label htmlFor={facility.id}>{facility.name}</Label>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 安全設施 */}
          <Card>
            <CardHeader>
              <CardTitle>安全設施</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {facilitiesData.safety.map((facility) => (
                  <div key={facility.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={facility.id}
                      checked={selectedFacilities[facility.id] || false}
                      onCheckedChange={(checked) => 
                        handleCheckboxChange(facility.id, checked as boolean)
                      }
                    />
                    <Label htmlFor={facility.id}>{facility.name}</Label>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 休閒娛樂設施 */}
          <Card>
            <CardHeader>
              <CardTitle>休閒娛樂設施</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {facilitiesData.entertainment.map((facility) => (
                  <div key={facility.id} className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id={facility.id}
                        checked={selectedFacilities[facility.id] || false}
                        onCheckedChange={(checked) => 
                          handleCheckboxChange(facility.id, checked as boolean)
                        }
                      />
                      <Label htmlFor={facility.id}>{facility.name}</Label>
                    </div>
                    {facility.hasPrice && selectedFacilities[facility.id] && (
                      <Select
                        value={pricingTypes[facility.id] || 'free'}
                        onValueChange={(value) => handlePricingTypeChange(facility.id, value)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="select">請選擇</SelectItem>
                          <SelectItem value="free">免費提供</SelectItem>
                          <SelectItem value="paid">需額外付費</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 服務語言 */}
          <Card>
            <CardHeader>
              <CardTitle>服務語言</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {facilitiesData.language.map((facility) => (
                  <div key={facility.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={facility.id}
                      checked={selectedFacilities[facility.id] || false}
                      onCheckedChange={(checked) => 
                        handleCheckboxChange(facility.id, checked as boolean)
                      }
                    />
                    <Label htmlFor={facility.id}>{facility.name}</Label>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={isSaving} size="lg">
              {isSaving ? '保存中...' : '保存設定'}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default WebsiteContent;
