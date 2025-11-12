import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface RoomFacilitiesFormProps {
  accommodationId: string;
}

const FACILITY_CATEGORIES = {
  general: {
    title: "一般客房設施",
    items: [
      "空調", "祈禱墊", "轉換插頭", "衣櫥", "洗衣機", "烘衣機",
      "無障礙設施", "風扇", "暖氣", "書桌", "電話", "沙發",
      "燙衣設備", "保險箱", "蚊帳", "燈條", "帳篷內燈", "直立式檯燈",
      "延長線 / 動力線", "烘鞋機", "加濕器", "褲線熱壓機", "離子夾", "行李秤重計",
      "睡衣", "衣服芳香噴霧", "指甲剪", "市景 / 街景", "海景", "無窗",
      "山景", "湖景", "河景", "游池景", "中庭景觀", "寢具用品",
      "Morning call服務(喚醒服務)", "遮光窗簾", "鬧鐘", "電蚊拍", "熱水壺"
    ]
  },
  bedTypes: {
    title: "床型",
    items: [
      "單人床", "雙人床", "大雙人床", "上下舖", "超大雙人床", "沙發床",
      "榻榻米", "睡袋", "睡墊", "草地營位", "碎石營位", "木板營位",
      "水泥地營位", "充氣床墊(單人)", "充氣床墊(雙人)", "加床－另外付費 (折疊床、床墊、行軍床)", "加人－另外付費", "通舖",
      "加大單人床", "自備睡袋"
    ]
  },
  ventilation: {
    title: "進階客房設施",
    items: [
      "防蟲紗", "陽台", "無兒床", "隔音設備", "私人花園", "共用花園",
      "私人浴池", "私人三溫暖", "獨立客廳", "健身房", "高樓層", "地毯",
      "按摩椅", "室內游泳按摩", "電系統", "房外自行車停放", "房內自行車停放", "提裏",
      "溫泉", "戶外共用按摩浴缸"
    ]
  },
  bathroom: {
    title: "浴室設施",
    items: [
      "私人衛浴", "共用浴室", "浴缸", "淋浴", "獨立淋浴間", "獨立廁所",
      "免治馬桶", "按摩浴缸", "吹風機", "浴袍", "免費盥洗用品", "拖鞋",
      "浴帽", "沐浴精", "潤髮乳", "毛巾", "付費毛巾", "牙刷/牙膏",
      "香皂/沐浴乳", "浴巾", "鑽子", "體重秤測機", "耳塞", "化妝品",
      "購花棒"
    ]
  },
  media: {
    title: "媒體與科技",
    items: [
      "免費無線上網", "逆叟機", "電動遊戲", "公用電腦", "購買機/建印另外收費", "CD播放機",
      "DVD播放機", "除蚊管雷聲", "平面電視", "iPad", "有線頻道", "付費電電前節目",
      "衛星電視節目", "iPod裝置", "可攜式WiFi分享器", "智慧型手機", "線上串流影片服務", "應急文化導覽/實質/另收費",
      "電影之夜", "藝術頻道", "圖書室", "棋類遊戲", "經典室", "經典/棋類/藍絲/羽球",
      "Wii遊戲機", "DVD"
    ]
  },
  foodBeverage: {
    title: "餐飲服務",
    items: [
      "電熱水壺", "卡式爐", "用餐區", "餐桌", "臨時洗杯", "瓶裝水",
      "塑膠水壺", "迷你吧", "酒/響串", "BBQ燒烤設備", "烤箱", "礦台",
      "烤麵包機", "洗碗機", "獨立廚房", "戶外用餐區", "廚房用具", "微波爐",
      "冰箱", "茶/咖啡沖泡設備", "咖啡機", "兒童高腳椅", "杯子", "免費即沖咖啡",
      "免費迎賓飲料", "免費茶包", "飲水機", "自動飯賣機"
    ]
  },
  family: {
    title: "家庭服務",
    items: [
      "兒童安全門欄", "兒童書籍或玩具", "插座安全蓋"
    ]
  }
};

export const RoomFacilitiesForm = ({ accommodationId }: RoomFacilitiesFormProps) => {
  const [roomTypes, setRoomTypes] = useState<any[]>([]);
  const [selectedRoomTypeId, setSelectedRoomTypeId] = useState<string>("");
  const [selectedFacilities, setSelectedFacilities] = useState<Record<string, string[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadRoomTypes();
  }, [accommodationId]);

  useEffect(() => {
    if (selectedRoomTypeId) {
      loadFacilities();
    }
  }, [selectedRoomTypeId]);

  const loadRoomTypes = async () => {
    if (!accommodationId) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('room_types')
        .select('id, name')
        .eq('accommodation_id', accommodationId)
        .order('display_order', { ascending: true });

      if (error) throw error;

      setRoomTypes(data || []);
      if (data && data.length > 0) {
        setSelectedRoomTypeId(data[0].id);
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error loading room types:', error);
      }
      toast.error("無法載入房型資料");
    } finally {
      setIsLoading(false);
    }
  };

  const loadFacilities = async () => {
    if (!selectedRoomTypeId) return;

    try {
      const { data, error } = await supabase
        .from('room_amenities')
        .select('category, amenity_name')
        .eq('room_type_id', selectedRoomTypeId);

      if (error) throw error;

      const facilityMap: Record<string, string[]> = {};
      data?.forEach(item => {
        if (item.category) {
          if (!facilityMap[item.category]) {
            facilityMap[item.category] = [];
          }
          facilityMap[item.category].push(item.amenity_name);
        }
      });

      setSelectedFacilities(facilityMap);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error loading facilities:', error);
      }
      toast.error("無法載入設施資料");
    }
  };

  const handleCheckboxChange = (category: string, item: string, checked: boolean) => {
    setSelectedFacilities(prev => {
      const categoryItems = prev[category] || [];
      if (checked) {
        return { ...prev, [category]: [...categoryItems, item] };
      } else {
        return { ...prev, [category]: categoryItems.filter(i => i !== item) };
      }
    });
  };

  const handleSave = async () => {
    if (!selectedRoomTypeId) return;

    setIsSaving(true);
    try {
      // Delete existing facilities for this room type
      await supabase
        .from('room_amenities')
        .delete()
        .eq('room_type_id', selectedRoomTypeId);

      // Insert new facilities
      const facilitiesToInsert = Object.entries(selectedFacilities).flatMap(([category, items]) =>
        items.map(item => ({
          room_type_id: selectedRoomTypeId,
          category,
          amenity_name: item
        }))
      );

      if (facilitiesToInsert.length > 0) {
        const { error } = await supabase
          .from('room_amenities')
          .insert(facilitiesToInsert);

        if (error) throw error;
      }

      toast.success("設施資料已儲存");
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error saving facilities:', error);
      }
      toast.error("無法儲存設施資料");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8 text-muted-foreground">載入中...</div>
        </CardContent>
      </Card>
    );
  }

  if (roomTypes.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8 text-muted-foreground">
            請先在「房型管理」建立房型
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>選擇房型</CardTitle>
          <CardDescription>為不同房型設定客房設施</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={selectedRoomTypeId} onValueChange={setSelectedRoomTypeId}>
            <SelectTrigger className="w-full md:w-[300px]">
              <SelectValue placeholder="選擇房型" />
            </SelectTrigger>
            <SelectContent className="bg-background">
              {roomTypes.map((roomType) => (
                <SelectItem key={roomType.id} value={roomType.id}>
                  {roomType.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {Object.entries(FACILITY_CATEGORIES).map(([key, { title, items }]) => (
        <Card key={key}>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {items.map((item) => (
                <div key={item} className="flex items-center space-x-2">
                  <Checkbox
                    id={`${key}-${item}`}
                    checked={selectedFacilities[key]?.includes(item) || false}
                    onCheckedChange={(checked) => 
                      handleCheckboxChange(key, item, checked as boolean)
                    }
                  />
                  <Label
                    htmlFor={`${key}-${item}`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    {item}
                  </Label>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "儲存中..." : "儲存設施"}
        </Button>
      </div>
    </div>
  );
};
