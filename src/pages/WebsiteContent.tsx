import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Globe, Plus, Trash2, Edit2, GripVertical, MapPin, Image as ImageIcon, Upload } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

interface FaqItem {
  id: string;
  question: string;
  answer: string;
  display_order: number;
  is_published: boolean;
}

interface NearbyAttraction {
  name: string;
  distance: string;
  description: string;
}

interface Photo {
  id: string;
  photo_url: string;
  display_order: number;
}

interface SortablePhotoItemProps {
  photo: Photo;
  index: number;
  onDelete: (photoId: string) => void;
}

const SortablePhotoItem = ({ photo, index, onDelete }: SortablePhotoItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: photo.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative group aspect-square overflow-hidden rounded-lg border bg-background"
    >
      <img
        src={photo.photo_url}
        alt={`照片 ${index + 1}`}
        className="w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onDelete(photo.id)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="absolute bottom-2 left-2 bg-black/70 text-white px-2 py-1 rounded text-xs">
        順序: {photo.display_order}
      </div>
      <div
        {...attributes}
        {...listeners}
        className="absolute top-2 right-2 cursor-grab active:cursor-grabbing bg-white/90 hover:bg-white rounded-lg p-2 transition-colors"
      >
        <GripVertical className="h-4 w-4 text-gray-700" />
      </div>
    </div>
  );
};

const WebsiteContent = () => {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState("basic-info");
  const [selectedFacilities, setSelectedFacilities] = useState<Record<string, boolean>>({});
  const [pricingTypes, setPricingTypes] = useState<Record<string, string>>({});
  const [accommodationId, setAccommodationId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // 基本資料狀態
  const [basicInfo, setBasicInfo] = useState({
    name: "",
    description: "",
    address: "",
    phone: "",
    email: "",
    line_id: "",
    facebook_url: "",
    instagram_url: "",
    threads_url: "",
    youtube_url: "",
    tiktok_url: ""
  });
  
  // 訂房須知狀態
  const [bookingInfo, setBookingInfo] = useState({
    checkInTime: "15:00",
    checkOutTime: "11:00",
    paymentMethods: [] as string[],
    cancellationPolicy: "",
    checkInNotice: "",
    petPolicy: "",
    otherNotes: ""
  });

  // FAQ 狀態
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingFaq, setEditingFaq] = useState<FaqItem | null>(null);
  const [faqFormData, setFaqFormData] = useState({
    question: "",
    answer: "",
    is_published: true,
  });

  // Location state
  const [locationDescription, setLocationDescription] = useState("");
  const [drivingInfo, setDrivingInfo] = useState("");
  const [publicTransportInfo, setPublicTransportInfo] = useState("");
  const [nearbyAttractions, setNearbyAttractions] = useState<NearbyAttraction[]>([
    { name: "", distance: "", description: "" }
  ]);

  // Gallery state
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  // 加載現有設施資料、訂房須知和常見問題
  useEffect(() => {
    const loadData = async () => {
      try {
        // 獲取 accommodation ID 和基本資料
        const { data: infoData } = await supabase
          .from("accommodation_info")
          .select("id, name, description, address, check_in_notice, phone, email, line_id, facebook_url, instagram_url, threads_url, youtube_url, tiktok_url")
          .maybeSingle();

        if (infoData) {
          setAccommodationId(infoData.id);
          
          // 設置基本資料
          setBasicInfo({
            name: infoData.name || "",
            description: infoData.description || "",
            address: infoData.address || "",
            phone: infoData.phone || "",
            email: infoData.email || "",
            line_id: infoData.line_id || "",
            facebook_url: infoData.facebook_url || "",
            instagram_url: infoData.instagram_url || "",
            threads_url: infoData.threads_url || "",
            youtube_url: infoData.youtube_url || "",
            tiktok_url: infoData.tiktok_url || ""
          });

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

          // 加載訂房設定
          const { data: bookingSettings } = await supabase
            .from("booking_settings")
            .select("*")
            .eq("accommodation_id", infoData.id)
            .maybeSingle();

          if (bookingSettings) {
            setBookingInfo({
              checkInTime: bookingSettings.check_in_time || "15:00",
              checkOutTime: bookingSettings.check_out_time || "11:00",
              paymentMethods: Array.isArray(bookingSettings.payment_methods) 
                ? (bookingSettings.payment_methods as string[])
                : [],
              cancellationPolicy: bookingSettings.cancellation_policy || "",
              checkInNotice: infoData.check_in_notice || "",
              petPolicy: bookingSettings.pet_policy || "",
              otherNotes: bookingSettings.other_notes || ""
            });
          } else {
            // 如果沒有設定，使用預設值但保留入住須知
            setBookingInfo(prev => ({
              ...prev,
              checkInNotice: infoData.check_in_notice || ""
            }));
          }

          // 加載常見問題
          const { data: faqData } = await supabase
            .from("faqs")
            .select("*")
            .eq("accommodation_id", infoData.id)
            .order("display_order");

          if (faqData) {
            setFaqs(faqData);
          }

          // 加載交通與地圖資訊
          const { data: locationData } = await supabase
            .from("location_info")
            .select("*")
            .eq("accommodation_id", infoData.id)
            .maybeSingle();

          if (locationData) {
            setLocationDescription(locationData.location_description || "");
            setDrivingInfo(locationData.driving_info || "");
            setPublicTransportInfo(locationData.public_transport_info || "");
            
            // 安全地處理 nearby_attractions 類型
            const attractions = locationData.nearby_attractions;
            if (attractions && Array.isArray(attractions)) {
              const typedAttractions = attractions as Array<{
                name?: string;
                distance?: string;
                description?: string;
              }>;
              setNearbyAttractions(
                typedAttractions.map(a => ({
                  name: a.name || "",
                  distance: a.distance || "",
                  description: a.description || ""
                }))
              );
            } else {
              setNearbyAttractions([{ name: "", distance: "", description: "" }]);
            }
          }

          // 加載相簿照片
          const { data: photosData } = await supabase
            .from("accommodation_photos")
            .select("*")
            .eq("accommodation_id", infoData.id)
            .order("display_order");

          if (photosData) {
            setPhotos(photosData);
          }
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('Error loading data:', error);
        }
        toast.error('載入資料失敗');
      }
    };

    loadData();
  }, []);

  const handleCheckboxChange = (facilityName: string, checked: boolean) => {
    setSelectedFacilities(prev => ({
      ...prev,
      [facilityName]: checked
    }));
  };

  const handlePricingTypeChange = (facilityName: string, value: string) => {
    setPricingTypes(prev => ({
      ...prev,
      [facilityName]: value
    }));
  };

  const handleSaveFacilities = async () => {
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
          if (selectedFacilities[item.name]) {
            facilitiesToInsert.push({
              accommodation_id: accommodationId,
              facility_name: item.name,
              category: category,
              pricing_type: item.hasPrice ? (pricingTypes[item.name] || 'free') : 'included',
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
      if (import.meta.env.DEV) {
        console.error('Error saving facilities:', error);
      }
      toast.error('保存失敗，請稍後再試');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveBookingInfo = async () => {
    if (!accommodationId) {
      toast.error('找不到旅宿資訊');
      return;
    }

    setIsSaving(true);
    try {
      // 更新 booking_settings
      const { error: bookingError } = await supabase
        .from("booking_settings")
        .update({
          check_in_time: bookingInfo.checkInTime,
          check_out_time: bookingInfo.checkOutTime,
          payment_methods: bookingInfo.paymentMethods,
          cancellation_policy: bookingInfo.cancellationPolicy,
          pet_policy: bookingInfo.petPolicy,
          other_notes: bookingInfo.otherNotes,
          updated_at: new Date().toISOString()
        })
        .eq("accommodation_id", accommodationId);

      if (bookingError) throw bookingError;

      // 更新 accommodation_info 的 check_in_notice
      const { error: infoError } = await supabase
        .from("accommodation_info")
        .update({
          check_in_notice: bookingInfo.checkInNotice,
          updated_at: new Date().toISOString()
        })
        .eq("id", accommodationId);

      if (infoError) throw infoError;

      toast.success('訂房須知已保存');
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error saving booking info:', error);
      }
      toast.error('保存失敗，請稍後再試');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePaymentMethodToggle = (method: string, checked: boolean) => {
    setBookingInfo(prev => ({
      ...prev,
      paymentMethods: checked
        ? [...prev.paymentMethods, method]
        : prev.paymentMethods.filter(m => m !== method)
    }));
  };

  // FAQ handlers
  const handleSaveFaq = async () => {
    if (!accommodationId) {
      toast.error("找不到旅宿資訊");
      return;
    }

    if (!faqFormData.question.trim() || !faqFormData.answer.trim()) {
      toast.error("問題和答案不能為空");
      return;
    }

    try {
      if (editingFaq) {
        const { error } = await supabase
          .from("faqs")
          .update({
            question: faqFormData.question,
            answer: faqFormData.answer,
            is_published: faqFormData.is_published,
          })
          .eq("id", editingFaq.id);

        if (error) throw error;
        toast.success("更新成功");
      } else {
        const maxOrder = faqs.length > 0 ? Math.max(...faqs.map(f => f.display_order)) : 0;
        
        const { error } = await supabase
          .from("faqs")
          .insert({
            accommodation_id: accommodationId,
            question: faqFormData.question,
            answer: faqFormData.answer,
            is_published: faqFormData.is_published,
            display_order: maxOrder + 1,
          });

        if (error) throw error;
        toast.success("新增成功");
      }

      // 重新載入 FAQs
      const { data: faqData } = await supabase
        .from("faqs")
        .select("*")
        .eq("accommodation_id", accommodationId)
        .order("display_order");

      if (faqData) {
        setFaqs(faqData);
      }

      handleCloseFaqDialog();
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Error saving FAQ:", error);
      }
      toast.error("儲存失敗");
    }
  };

  const handleDeleteFaq = async (id: string) => {
    if (!confirm("確定要刪除此常見問題嗎？")) return;

    try {
      const { error } = await supabase.from("faqs").delete().eq("id", id);

      if (error) throw error;
      toast.success("刪除成功");
      
      // 重新載入 FAQs
      if (accommodationId) {
        const { data: faqData } = await supabase
          .from("faqs")
          .select("*")
          .eq("accommodation_id", accommodationId)
          .order("display_order");

        if (faqData) {
          setFaqs(faqData);
        }
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Error deleting FAQ:", error);
      }
      toast.error("刪除失敗");
    }
  };

  const handleEditFaq = (faq: FaqItem) => {
    setEditingFaq(faq);
    setFaqFormData({
      question: faq.question,
      answer: faq.answer,
      is_published: faq.is_published,
    });
    setIsDialogOpen(true);
  };

  const handleCloseFaqDialog = () => {
    setIsDialogOpen(false);
    setEditingFaq(null);
    setFaqFormData({
      question: "",
      answer: "",
      is_published: true,
    });
  };

  const handleTogglePublishFaq = async (faq: FaqItem) => {
    try {
      const { error } = await supabase
        .from("faqs")
        .update({ is_published: !faq.is_published })
        .eq("id", faq.id);

      if (error) throw error;
      toast.success(faq.is_published ? "已隱藏" : "已發布");
      
      // 重新載入 FAQs
      if (accommodationId) {
        const { data: faqData } = await supabase
          .from("faqs")
          .select("*")
          .eq("accommodation_id", accommodationId)
          .order("display_order");

        if (faqData) {
          setFaqs(faqData);
        }
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Error toggling publish:", error);
      }
      toast.error("操作失敗");
    }
  };

  // Location functions
  const handleSaveLocationInfo = async () => {
    if (!accommodationId) {
      toast.error('找不到旅宿資訊');
      return;
    }

    setIsSaving(true);
    try {
      const { data: existing, error: fetchError } = await supabase
        .from("location_info")
        .select("id")
        .eq("accommodation_id", accommodationId)
        .maybeSingle();

      if (fetchError) throw fetchError;

      const locationData = {
        accommodation_id: accommodationId,
        location_description: locationDescription,
        driving_info: drivingInfo,
        public_transport_info: publicTransportInfo,
        nearby_attractions: nearbyAttractions.filter(
          a => a.name || a.distance || a.description
        ) as any, // 轉換為 Json 類型
      };

      if (existing) {
        const { error } = await supabase
          .from("location_info")
          .update(locationData)
          .eq("id", existing.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("location_info")
          .insert([locationData]);

        if (error) throw error;
      }

      toast.success('交通與地圖資訊已儲存');
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error saving location info:', error);
      }
      toast.error('儲存失敗，請稍後再試');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddAttraction = () => {
    setNearbyAttractions([...nearbyAttractions, { name: "", distance: "", description: "" }]);
  };

  const handleSaveBasicInfo = async () => {
    if (!accommodationId) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("accommodation_info")
        .update({
          name: basicInfo.name,
          description: basicInfo.description,
          address: basicInfo.address,
          phone: basicInfo.phone,
          email: basicInfo.email,
          line_id: basicInfo.line_id,
          facebook_url: basicInfo.facebook_url,
          instagram_url: basicInfo.instagram_url,
          threads_url: basicInfo.threads_url,
          youtube_url: basicInfo.youtube_url,
          tiktok_url: basicInfo.tiktok_url
        })
        .eq("id", accommodationId);

      if (error) throw error;

      toast.success('基本資料已儲存');
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Error saving basic info:", error);
      }
      toast.error('儲存失敗，請稍後再試');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveAttraction = (index: number) => {
    setNearbyAttractions(nearbyAttractions.filter((_, i) => i !== index));
  };

  const handleAttractionChange = (
    index: number,
    field: keyof NearbyAttraction,
    value: string
  ) => {
    const updated = [...nearbyAttractions];
    updated[index][field] = value;
    setNearbyAttractions(updated);
  };

  // Gallery handlers
  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!accommodationId || !event.target.files || event.target.files.length === 0) {
      return;
    }

    setUploadingPhoto(true);
    try {
      const file = event.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${accommodationId}/${fileName}`;

      const { error: uploadError, data } = await supabase.storage
        .from('room-photos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('room-photos')
        .getPublicUrl(filePath);

      const maxOrder = photos.length > 0 
        ? Math.max(...photos.map(p => p.display_order)) 
        : 0;

      const { error: insertError, data: newPhoto } = await supabase
        .from('accommodation_photos')
        .insert([
          {
            accommodation_id: accommodationId,
            photo_url: publicUrl,
            display_order: maxOrder + 1
          }
        ])
        .select()
        .single();

      if (insertError) throw insertError;

      setPhotos([...photos, newPhoto]);
      toast.success('照片已上傳');
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error uploading photo:', error);
      }
      toast.error('上傳失敗，請稍後再試');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    try {
      const { error } = await supabase
        .from('accommodation_photos')
        .delete()
        .eq('id', photoId);

      if (error) throw error;

      setPhotos(photos.filter(p => p.id !== photoId));
      toast.success('照片已刪除');
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error deleting photo:', error);
      }
      toast.error('刪除失敗，請稍後再試');
    }
  };

  const handlePhotoDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = photos.findIndex((p) => p.id === active.id);
    const newIndex = photos.findIndex((p) => p.id === over.id);

    const newPhotos = arrayMove(photos, oldIndex, newIndex);
    
    // Update display_order for all photos
    const updatedPhotos = newPhotos.map((photo, index) => ({
      ...photo,
      display_order: index + 1,
    }));

    setPhotos(updatedPhotos);

    // Save to database
    try {
      const updates = updatedPhotos.map((photo) =>
        supabase
          .from('accommodation_photos')
          .update({ display_order: photo.display_order })
          .eq('id', photo.id)
      );

      await Promise.all(updates);
      toast.success('順序已更新');
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error updating photo order:', error);
      }
      toast.error('更新失敗，請稍後再試');
      // Reload photos on error
      const { data } = await supabase
        .from('accommodation_photos')
        .select('*')
        .eq('accommodation_id', accommodationId!)
        .order('display_order');
      if (data) setPhotos(data);
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Globe className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold tracking-tight">官網內容</h1>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="basic-info">基本資料</TabsTrigger>
          <TabsTrigger value="facilities">設施與服務</TabsTrigger>
          <TabsTrigger value="gallery">精選照片</TabsTrigger>
          <TabsTrigger value="location">交通 & 地圖</TabsTrigger>
          <TabsTrigger value="booking-info">訂房須知</TabsTrigger>
          <TabsTrigger value="faq">常見問題</TabsTrigger>
        </TabsList>

        {/* 基本資料 Tab */}
        <TabsContent value="basic-info" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>基本資料</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>名稱</Label>
                <Input 
                  value={basicInfo.name}
                  onChange={(e) => setBasicInfo({ ...basicInfo, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>描述</Label>
                <Textarea 
                  value={basicInfo.description}
                  onChange={(e) => setBasicInfo({ ...basicInfo, description: e.target.value })}
                  rows={4}
                  placeholder="請輸入住宿描述..."
                />
              </div>
              <div className="space-y-2">
                <Label>地址</Label>
                <Input 
                  value={basicInfo.address}
                  onChange={(e) => setBasicInfo({ ...basicInfo, address: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>電話</Label>
                <Input 
                  value={basicInfo.phone}
                  onChange={(e) => setBasicInfo({ ...basicInfo, phone: e.target.value })}
                  placeholder="例如：0903178518"
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input 
                  type="email"
                  value={basicInfo.email}
                  onChange={(e) => setBasicInfo({ ...basicInfo, email: e.target.value })}
                  placeholder="例如：info@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label>LINE ID</Label>
                <Input 
                  value={basicInfo.line_id}
                  onChange={(e) => setBasicInfo({ ...basicInfo, line_id: e.target.value })}
                  placeholder="例如：@042deypa"
                />
              </div>
              <div className="space-y-2">
                <Label>Facebook</Label>
                <Input 
                  value={basicInfo.facebook_url}
                  onChange={(e) => setBasicInfo({ ...basicInfo, facebook_url: e.target.value })}
                  placeholder="請輸入完整 Facebook 網址"
                />
              </div>
              <div className="space-y-2">
                <Label>Instagram</Label>
                <Input 
                  value={basicInfo.instagram_url}
                  onChange={(e) => setBasicInfo({ ...basicInfo, instagram_url: e.target.value })}
                  placeholder="請輸入完整 Instagram 網址"
                />
              </div>
              <div className="space-y-2">
                <Label>Threads</Label>
                <Input 
                  value={basicInfo.threads_url}
                  onChange={(e) => setBasicInfo({ ...basicInfo, threads_url: e.target.value })}
                  placeholder="請輸入完整 Threads 網址"
                />
              </div>
              <div className="space-y-2">
                <Label>YouTube</Label>
                <Input 
                  value={basicInfo.youtube_url}
                  onChange={(e) => setBasicInfo({ ...basicInfo, youtube_url: e.target.value })}
                  placeholder="請輸入完整 YouTube 網址"
                />
              </div>
              <div className="space-y-2">
                <Label>TikTok</Label>
                <Input 
                  value={basicInfo.tiktok_url}
                  onChange={(e) => setBasicInfo({ ...basicInfo, tiktok_url: e.target.value })}
                  placeholder="請輸入完整 TikTok 網址"
                />
              </div>
              <Button onClick={handleSaveBasicInfo} disabled={isSaving}>
                {isSaving ? "儲存中..." : "儲存變更"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="facilities" className="space-y-6">
          {/* 公共區設施與服務 */}
          <Card>
            <CardHeader>
              <CardTitle>設施與服務</CardTitle>
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
                          checked={selectedFacilities[facility.name] || false}
                          onCheckedChange={(checked) => 
                            handleCheckboxChange(facility.name, checked as boolean)
                          }
                        />
                        <Label htmlFor={facility.id}>{facility.name}</Label>
                      </div>
                      {facility.hasPrice && selectedFacilities[facility.name] && (
                        <Select
                          value={pricingTypes[facility.name] || 'free'}
                          onValueChange={(value) => handlePricingTypeChange(facility.name, value)}
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
              <h3 className="font-semibold">餐飲設施</h3>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {facilitiesData.dining.map((facility) => (
                  <div key={facility.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={facility.id}
                      checked={selectedFacilities[facility.name] || false}
                      onCheckedChange={(checked) => 
                        handleCheckboxChange(facility.name, checked as boolean)
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
              <h3 className="font-semibold">安全設施</h3>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {facilitiesData.safety.map((facility) => (
                  <div key={facility.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={facility.id}
                      checked={selectedFacilities[facility.name] || false}
                      onCheckedChange={(checked) => 
                        handleCheckboxChange(facility.name, checked as boolean)
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
              <h3 className="font-semibold">休閒娛樂設施</h3>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {facilitiesData.entertainment.map((facility) => (
                  <div key={facility.id} className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id={facility.id}
                        checked={selectedFacilities[facility.name] || false}
                        onCheckedChange={(checked) => 
                          handleCheckboxChange(facility.name, checked as boolean)
                        }
                      />
                      <Label htmlFor={facility.id}>{facility.name}</Label>
                    </div>
                    {facility.hasPrice && selectedFacilities[facility.name] && (
                      <Select
                        value={pricingTypes[facility.name] || 'free'}
                        onValueChange={(value) => handlePricingTypeChange(facility.name, value)}
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
              <h3 className="font-semibold">服務語言</h3>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {facilitiesData.language.map((facility) => (
                  <div key={facility.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={facility.id}
                      checked={selectedFacilities[facility.name] || false}
                      onCheckedChange={(checked) => 
                        handleCheckboxChange(facility.name, checked as boolean)
                      }
                    />
                    <Label htmlFor={facility.id}>{facility.name}</Label>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={handleSaveFacilities} disabled={isSaving} size="lg">
              {isSaving ? '保存中...' : '保存設定'}
            </Button>
          </div>
        </TabsContent>

        {/* 相簿管理 Tab */}
        <TabsContent value="gallery" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>精選照片</CardTitle>
              <CardDescription>上傳和管理住宿精選照片</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 上傳按鈕 */}
              <div className="flex items-center gap-4">
                <Button
                  onClick={() => document.getElementById('photo-upload')?.click()}
                  disabled={uploadingPhoto}
                  className="gap-2"
                >
                  <Upload className="h-4 w-4" />
                  {uploadingPhoto ? '上傳中...' : '上傳照片'}
                </Button>
                <input
                  id="photo-upload"
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
                <p className="text-sm text-muted-foreground">
                  支援 JPG、PNG 格式，建議尺寸 1200x800 以上
                </p>
              </div>

              {/* 照片網格 */}
              {photos.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed rounded-lg">
                  <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">尚無照片，請上傳您的第一張照片</p>
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handlePhotoDragEnd}
                >
                  <SortableContext
                    items={photos.map((p) => p.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {photos.map((photo, index) => (
                        <SortablePhotoItem
                          key={photo.id}
                          photo={photo}
                          index={index}
                          onDelete={handleDeletePhoto}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="booking-info" className="space-y-6">
          {/* 入住退房時間 */}
          <Card>
            <CardHeader>
              <CardTitle>入住退房時間</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>入住時間</Label>
                  <Input
                    type="time"
                    value={bookingInfo.checkInTime}
                    onChange={(e) => setBookingInfo(prev => ({
                      ...prev,
                      checkInTime: e.target.value
                    }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>退房時間</Label>
                  <Input
                    type="time"
                    value={bookingInfo.checkOutTime}
                    onChange={(e) => setBookingInfo(prev => ({
                      ...prev,
                      checkOutTime: e.target.value
                    }))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 付款方式 */}
          <Card>
            <CardHeader>
              <CardTitle>付款方式</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {['信用卡', '現金', '線上支付', 'ATM轉帳', '行動支付'].map((method) => (
                    <div key={method} className="flex items-center space-x-2">
                      <Checkbox
                        id={`payment-${method}`}
                        checked={bookingInfo.paymentMethods.includes(method)}
                        onCheckedChange={(checked) => 
                          handlePaymentMethodToggle(method, checked as boolean)
                        }
                      />
                      <Label htmlFor={`payment-${method}`}>{method}</Label>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 取消政策 */}
          <Card>
            <CardHeader>
              <CardTitle>取消政策</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label>政策說明</Label>
                <Textarea
                  rows={6}
                  placeholder="例如：入住前7天免費取消，7天內取消收取50%費用"
                  value={bookingInfo.cancellationPolicy}
                  onChange={(e) => setBookingInfo(prev => ({
                    ...prev,
                    cancellationPolicy: e.target.value
                  }))}
                />
              </div>
            </CardContent>
          </Card>

          {/* 重要事項 */}
          <Card>
            <CardHeader>
              <CardTitle>重要事項</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label>入住須知</Label>
                <Textarea
                  rows={8}
                  placeholder="例如：&#10;請出示身分證件&#10;禁止吸菸&#10;不可攜帶寵物"
                  value={bookingInfo.checkInNotice}
                  onChange={(e) => setBookingInfo(prev => ({
                    ...prev,
                    checkInNotice: e.target.value
                  }))}
                />
              </div>
            </CardContent>
          </Card>

          {/* 寵物入住守則 */}
          <Card>
            <CardHeader>
              <CardTitle>寵物入住守則</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label>守則說明</Label>
                <Textarea
                  rows={8}
                  placeholder="例如：&#10;歡迎攜帶寵物入住&#10;寵物需加收清潔費用&#10;請主人隨時清理寵物排泄物&#10;寵物不可上床"
                  value={bookingInfo.petPolicy}
                  onChange={(e) => setBookingInfo(prev => ({
                    ...prev,
                    petPolicy: e.target.value
                  }))}
                />
              </div>
            </CardContent>
          </Card>

          {/* 其他注意事項 */}
          <Card>
            <CardHeader>
              <CardTitle>其他注意事項</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label>注意事項說明</Label>
                <Textarea
                  rows={8}
                  placeholder="例如：&#10;房間內禁止吸菸&#10;晚上10點後請降低音量&#10;使用設施請遵守安全規範&#10;貴重物品請自行保管"
                  value={bookingInfo.otherNotes}
                  onChange={(e) => setBookingInfo(prev => ({
                    ...prev,
                    otherNotes: e.target.value
                  }))}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={handleSaveBookingInfo} disabled={isSaving}>
              {isSaving ? '保存中...' : '保存設定'}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="faq" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">常見問題管理</h2>
            </div>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              新增問題
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>問題列表</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {faqs.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    尚無常見問題，點擊上方按鈕新增
                  </p>
                ) : (
                  faqs.map((faq) => (
                    <div
                      key={faq.id}
                      className="flex items-start gap-4 p-4 border rounded-lg"
                    >
                      <GripVertical className="h-5 w-5 text-muted-foreground mt-1 cursor-move" />
                      <div className="flex-1 space-y-2">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <h3 className="font-semibold">{faq.question}</h3>
                            <p className="text-sm text-muted-foreground mt-1">
                              {faq.answer}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-2">
                              <Label htmlFor={`publish-${faq.id}`} className="text-sm">
                                {faq.is_published ? "已發布" : "已隱藏"}
                              </Label>
                              <Switch
                                id={`publish-${faq.id}`}
                                checked={faq.is_published}
                                onCheckedChange={() => handleTogglePublishFaq(faq)}
                              />
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditFaq(faq)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteFaq(faq.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Location Tab */}
        <TabsContent value="location" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                交通 & 地圖
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="location-description">位置資訊描述</Label>
                <Textarea
                  id="location-description"
                  value={locationDescription}
                  onChange={(e) => setLocationDescription(e.target.value)}
                  placeholder="位於風景秀麗的山區，周邊有多處自然景點與步道"
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="driving-info">自行開車</Label>
                <Textarea
                  id="driving-info"
                  value={drivingInfo}
                  onChange={(e) => setDrivingInfo(e.target.value)}
                  placeholder="從台北出發：國道3號 → 名間交流道 → 台16線 → 台21線 → 約3.5小時&#10;旅宿提供免費停車場，無需預約"
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="public-transport-info">大眾運輸</Label>
                <Textarea
                  id="public-transport-info"
                  value={publicTransportInfo}
                  onChange={(e) => setPublicTransportInfo(e.target.value)}
                  placeholder="高鐵 + 巴士：高鐵台中站 → 轉乘南投客運 → 東埔站 → 步行約10分鐘&#10;建議提前預約接駁服務（需額外付費）"
                  rows={4}
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>周邊景點</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddAttraction}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    新增景點
                  </Button>
                </div>

                {nearbyAttractions.map((attraction, index) => (
                  <Card key={index}>
                    <CardContent className="pt-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 space-y-3">
                          <div className="space-y-2">
                            <Label htmlFor={`attraction-name-${index}`}>景點名稱</Label>
                            <Input
                              id={`attraction-name-${index}`}
                              value={attraction.name}
                              onChange={(e) =>
                                handleAttractionChange(index, "name", e.target.value)
                              }
                              placeholder="例：東埔溫泉"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor={`attraction-distance-${index}`}>距離</Label>
                            <Input
                              id={`attraction-distance-${index}`}
                              value={attraction.distance}
                              onChange={(e) =>
                                handleAttractionChange(index, "distance", e.target.value)
                              }
                              placeholder="例：步行5分鐘"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor={`attraction-description-${index}`}>
                              景點描述
                            </Label>
                            <Textarea
                              id={`attraction-description-${index}`}
                              value={attraction.description}
                              onChange={(e) =>
                                handleAttractionChange(index, "description", e.target.value)
                              }
                              placeholder="例：著名的碳酸氫鈉泉，有美人湯之稱"
                              rows={2}
                            />
                          </div>
                        </div>

                        {nearbyAttractions.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveAttraction(index)}
                            className="mt-6"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Button onClick={handleSaveLocationInfo} className="w-full">
                保存資訊
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* FAQ Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingFaq ? "編輯常見問題" : "新增常見問題"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="question">問題</Label>
              <Input
                id="question"
                placeholder="請輸入問題"
                value={faqFormData.question}
                onChange={(e) =>
                  setFaqFormData({ ...faqFormData, question: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="answer">答案</Label>
              <Textarea
                id="answer"
                placeholder="請輸入答案"
                value={faqFormData.answer}
                onChange={(e) =>
                  setFaqFormData({ ...faqFormData, answer: e.target.value })
                }
                rows={6}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="is_published"
                checked={faqFormData.is_published}
                onCheckedChange={(checked) =>
                  setFaqFormData({ ...faqFormData, is_published: checked })
                }
              />
              <Label htmlFor="is_published">立即發布</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseFaqDialog}>
              取消
            </Button>
            <Button onClick={handleSaveFaq}>
              {editingFaq ? "更新" : "新增"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WebsiteContent;
