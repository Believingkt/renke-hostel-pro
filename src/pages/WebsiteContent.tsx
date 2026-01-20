import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Globe, Plus, Trash2, Edit2, GripVertical, MapPin, Image as ImageIcon, Upload, Info, Wrench, Package, HelpCircle, Navigation, icons, AlertCircle, BookOpen, Home, Clock } from "lucide-react";
import { invalidateAccommodationCache } from "@/hooks/use-accommodation-cache";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { AboutFeatureForm } from "@/components/AboutFeatureForm";
import { ResponsiveTabs, TabItem } from "@/components/ResponsiveTabs";
import { WebInfoSection } from "@/components/website-content/WebInfoSection";
import { AboutFeaturesSection } from "@/components/website-content/AboutFeaturesSection";
import { SocialSharingSection } from "@/components/website-content/SocialSharingSection";
import { HeaderFooterSection } from "@/components/website-content/HeaderFooterSection";
import { SaveButtonContainer } from "@/components/ui/save-button-container";
import { ValidatedInput } from "@/components/ui/validated-input";
import { ValidatedTextarea } from "@/components/ui/validated-textarea";
import { ValidatedNumberInput } from "@/components/ui/validated-number-input";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { TimePicker, CheckOutTimePicker } from "@/components/ui/time-picker";
import { compressImage, validateImageFile, formatFileSize } from "@/utils/imageCompression";
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
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/PageHeader";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { TabsSkeleton } from "@/components/skeletons/TabsSkeleton";
import { LogoCropDialog } from "@/components/LogoCropDialog";
import { HeroCarouselPreviewDialog } from "@/components/HeroCarouselPreviewDialog";
import { OgImagePreview } from "@/components/OgImagePreview";
import { OgImageCropDialog } from "@/components/OgImageCropDialog";
import { bookingSettingsSchema, addonSettingsSchema } from "@/utils/roomValidation";
import { useAccommodation } from "@/contexts/AccommodationContext";
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
    { id: 'shuttle', name: '交誼廳', hasPrice: false },
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
    { id: 'wheelchair-repair', name: '腳踏車維修區', hasPrice: false },
    { id: 'souvenir-shop', name: '誠實商店', hasPrice: false },
    { id: 'laundry', name: '自助洗衣設備', hasPrice: true },
    { id: 'parking', name: '停車場', hasPrice: true },
    { id: 'land-parking', name: '提供場地租借', hasPrice: true },
    { id: 'ccs1-charger', name: 'CCS1電動車充電設備', hasPrice: true },
    { id: 'ear-plug', name: '耳塞', hasPrice: true },
    { id: 'public-wifi', name: '公共區域 WIFI', hasPrice: false },
    { id: 'baby-bed', name: '嬰兒床', hasPrice: false },
    { id: 'nursing-cloth', name: '熨斗 / 燙衣板', hasPrice: false },
    { id: 'rooftop-bath', name: '露天浴池', hasPrice: false },
    { id: 'garden', name: '花園', hasPrice: false },
    { id: 'owner-live', name: '與主人同住', hasPrice: false },
    { id: 'arcade', name: '(營位外) 公用衛浴 / 集中浴廁', hasPrice: false },
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
  title?: string | null;
  subtitle?: string | null;
  cta_text?: string | null;
  cta_link?: string | null;
}

interface SortablePhotoItemProps {
  photo: Photo;
  index: number;
  onDelete: (photoId: string) => void;
  onEdit?: (photo: Photo) => void;
}

const SortablePhotoItem = ({ photo, index, onDelete, onEdit }: SortablePhotoItemProps) => {
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
      className="relative group aspect-[4/3] overflow-hidden rounded-xl border-2 border-border bg-background shadow-sm hover:shadow-lg transition-all touch-manipulation"
    >
      <img
        src={photo.photo_url}
        alt={`照片 ${index + 1}`}
        className="w-full h-full object-cover md:transition-transform md:group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-100 md:opacity-0 md:group-hover:opacity-100 md:transition-opacity flex items-center justify-center gap-3 md:gap-4 p-4 md:p-0">
        {onEdit && (
          <Button
            size="default"
            variant="secondary"
            onClick={() => onEdit(photo)}
            className="shadow-lg min-h-[48px] min-w-[48px] touch-manipulation"
          >
            <Edit2 className="h-5 w-5 md:h-4 md:w-4" />
          </Button>
        )}
        <Button
          size="default"
          variant="destructive"
          onClick={() => onDelete(photo.id)}
          className="shadow-lg min-h-[48px] min-w-[48px] touch-manipulation"
        >
          <Trash2 className="h-5 w-5 md:h-4 md:w-4" />
        </Button>
      </div>
      <div className="absolute bottom-3 left-3 md:bottom-2 md:left-2 bg-background/95 backdrop-blur-sm text-foreground px-4 py-2 md:px-3 md:py-1.5 rounded-lg text-sm md:text-xs font-medium shadow-md border border-border/50">
        順序 {photo.display_order}
      </div>
      <div
        {...attributes}
        {...listeners}
        className="absolute top-3 right-3 md:top-2 md:right-2 cursor-grab active:cursor-grabbing bg-background/95 backdrop-blur-sm hover:bg-background rounded-lg p-3 md:p-2.5 transition-all shadow-md border border-border/50 min-h-[48px] min-w-[48px] flex items-center justify-center touch-manipulation"
      >
        <GripVertical className="h-5 w-5 md:h-4 md:w-4 text-muted-foreground" />
      </div>
    </div>
  );
};

// 可排序的特色區塊項目
interface SortableFeatureItemProps {
  feature: any;
  index: number;
  onEdit: (feature: any) => void;
  onDelete: (featureId: string) => void;
}

const SortableFeatureItem = ({ feature, index, onEdit, onDelete }: SortableFeatureItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: feature.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // 根據圖標名稱獲取對應的 Lucide 圖標組件
  const getIconComponent = () => {
    if (feature.icon_type === 'lucide' && feature.icon_name) {
      const IconComponent = icons[feature.icon_name as keyof typeof icons];
      if (IconComponent) {
        return <IconComponent className="w-6 h-6 text-primary" />;
      }
    }
    return null;
  };

  return (
    <Card ref={setNodeRef} style={style} className="relative">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded transition-colors flex-shrink-0"
          >
            <GripVertical className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            {feature.icon_type === 'lucide' ? (
              getIconComponent() || <span className="text-primary text-sm">{feature.icon_name}</span>
            ) : feature.icon_url ? (
              <img src={feature.icon_url} alt="圖示" className="w-6 h-6 object-contain" />
            ) : (
              <span className="text-muted-foreground text-xs">無</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm mb-1">{feature.title}</h4>
            <p className="text-xs text-muted-foreground line-clamp-2">{feature.description}</p>
            <div className="text-xs text-muted-foreground mt-1">順序: {feature.display_order + 1}</div>
          </div>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onEdit(feature)}
            >
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost-destructive"
              size="icon"
              className="h-8 w-8"
              onClick={() => onDelete(feature.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const WebsiteContent = () => {
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();
  const { currentAccommodationId } = useAccommodation();
  const [activeTab, setActiveTab] = useState("basic-info");
  const [selectedFacilities, setSelectedFacilities] = useState<Record<string, boolean>>({});
  const [pricingTypes, setPricingTypes] = useState<Record<string, string>>({});
  const [accommodationId, setAccommodationId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // 麵包屑名稱映射
  const getBreadcrumbTitle = () => {
    const titleMap: Record<string, string> = {
      'basic-info': '網頁設定',
      'facilities': '設施服務',
      'addon-plans': '加購方案',
      'gallery': '精選照片',
      'booking-info': '訂房須知',
      'faq': '常見問題',
      'location': '交通地圖'
    };
    return titleMap[activeTab] || '官網內容';
  };
  
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
    tiktok_url: "",
    header_logo_url: "",
    footer_logo_url: "",
    og_title: "",
    og_description: "",
    og_image_url: "",
    website_url: "",
    hero_main_title: "",
    hero_subtitle: "",
    hero_description: "",
    hero_overlay_opacity: 40,
    hero_autoplay_delay: 8
  });
  const [uploadingHeaderLogo, setUploadingHeaderLogo] = useState(false);
  const [uploadingFooterLogo, setUploadingFooterLogo] = useState(false);
  const [uploadingOgImage, setUploadingOgImage] = useState(false);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState("");
  const [cropLogoType, setCropLogoType] = useState<'header' | 'footer'>('header');
  const [ogImageCropDialogOpen, setOgImageCropDialogOpen] = useState(false);
  const [ogImageCropSrc, setOgImageCropSrc] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteLogoType, setDeleteLogoType] = useState<'header' | 'footer' | null>(null);
  
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
  
  // 訂房設定驗證錯誤
  const [bookingErrors, setBookingErrors] = useState<Record<string, string>>({});

  // FAQ 狀態
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteFaqDialogOpen, setDeleteFaqDialogOpen] = useState(false);
  const [deletingFaqId, setDeletingFaqId] = useState<string | null>(null);
  const [deletePhotoDialogOpen, setDeletePhotoDialogOpen] = useState(false);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [deleteHeroPhotoDialogOpen, setDeleteHeroPhotoDialogOpen] = useState(false);
  const [deletingHeroPhotoId, setDeletingHeroPhotoId] = useState<string | null>(null);
  const [deleteFeatureDialogOpen, setDeleteFeatureDialogOpen] = useState(false);
  const [deletingFeatureId, setDeletingFeatureId] = useState<string | null>(null);
  const [deleteOgImageDialogOpen, setDeleteOgImageDialogOpen] = useState(false);
  const [editingFaq, setEditingFaq] = useState<FaqItem | null>(null);
  const [faqFormData, setFaqFormData] = useState({
    question: "",
    answer: "",
    is_published: true,
  });

  // Location state
  const [drivingInfo, setDrivingInfo] = useState("");
  const [publicTransportInfo, setPublicTransportInfo] = useState("");
  const [nearbyAttractions, setNearbyAttractions] = useState<NearbyAttraction[]>([
    { name: "", distance: "", description: "" }
  ]);
  const [showMapPreview, setShowMapPreview] = useState(true);

  // Gallery state
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });

  // Hero carousel state
  const [heroPhotos, setHeroPhotos] = useState<Photo[]>([]);
  const [uploadingHeroPhoto, setUploadingHeroPhoto] = useState(false);
  const [isCarouselPreviewOpen, setIsCarouselPreviewOpen] = useState(false);
  const MAX_HERO_PHOTOS = 5;

  // Addon plans state
  const [petPlan, setPetPlan] = useState({
    enabled: true,
    pricePerUnit: 600,
    maxQuantity: 2,
    description: "每隻寵物",
    detailedDescription: ""
  });

  const [mealPlan, setMealPlan] = useState({
    enabled: true,
    pricePerUnit: 900,
    weekdayMinQuantity: 12,
    weekendMinQuantity: 18,
    maxQuantity: 30,
    description: "每人每日",
    detailedDescription: ""
  });

  // 加購方案驗證錯誤
  const [petPlanErrors, setPetPlanErrors] = useState<Record<string, string>>({});
  const [mealPlanErrors, setMealPlanErrors] = useState<Record<string, string>>({});

  // About section state
  const [aboutSection, setAboutSection] = useState({
    sectionTitle: "自然中的秘境 X 宿泊空間",
    sectionDescription: ""
  });
  const [aboutFeatures, setAboutFeatures] = useState<any[]>([]);
  const [featureFormOpen, setFeatureFormOpen] = useState(false);
  const [editingFeature, setEditingFeature] = useState<any | null>(null);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  // 加載現有設施資料、訂房須知和常見問題
  const loadData = async (targetAccommodationId?: string) => {
    try {
      // 使用傳入的 ID 或從 context 取得的 ID
      const accIdToUse = targetAccommodationId || currentAccommodationId;
      
      // 構建查詢
      let query = supabase
        .from("accommodation_info")
        .select("id, name, description, address, check_in_notice, phone, email, line_id, facebook_url, instagram_url, threads_url, youtube_url, tiktok_url, header_logo_url, footer_logo_url, og_title, og_description, og_image_url, website_url, hero_main_title, hero_subtitle, hero_description, hero_overlay_opacity, hero_autoplay_delay");
      
      // 如果有指定 accommodation ID，則使用它來過濾
      if (accIdToUse) {
        query = query.eq("id", accIdToUse);
      }
      
      const { data: infoData } = await query.maybeSingle();

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
          tiktok_url: infoData.tiktok_url || "",
          header_logo_url: infoData.header_logo_url || "",
          footer_logo_url: infoData.footer_logo_url || "",
          og_title: infoData.og_title || "",
          og_description: infoData.og_description || "",
          og_image_url: infoData.og_image_url || "",
          website_url: infoData.website_url || "",
          hero_main_title: infoData.hero_main_title || "",
          hero_subtitle: infoData.hero_subtitle || "",
          hero_description: infoData.hero_description || "",
          hero_overlay_opacity: infoData.hero_overlay_opacity ?? 40,
          hero_autoplay_delay: infoData.hero_autoplay_delay ?? 8
        });

        // 更新瀏覽器標題
        if (infoData.name) {
          document.title = infoData.name;
        }

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

        // 加載首頁輪播圖
        const { data: heroPhotosData } = await supabase
          .from("accommodation_photos")
          .select("*")
          .eq("accommodation_id", infoData.id)
          .eq("photo_type", "hero")
          .order("display_order");

        if (heroPhotosData) {
          setHeroPhotos(heroPhotosData);
        }

        // 加載相簿照片
        const { data: photosData } = await supabase
          .from("accommodation_photos")
          .select("*")
          .eq("accommodation_id", infoData.id)
          .eq("photo_type", "gallery")
          .order("display_order");

        if (photosData) {
          setPhotos(photosData);
        }

        // 加載加購方案設定
        const { data: addonData } = await supabase
          .from("addon_settings")
          .select("*")
          .eq("accommodation_id", infoData.id);

        if (addonData) {
          const petData = addonData.find(a => a.addon_type === 'pet');
          const mealData = addonData.find(a => a.addon_type === 'meal');

          if (petData) {
            setPetPlan({
              enabled: petData.enabled || true,
              pricePerUnit: petData.price_per_unit,
              maxQuantity: petData.max_quantity,
              description: petData.unit_label || "每隻寵物",
              detailedDescription: petData.detailed_description || ""
            });
          }

          if (mealData) {
            setMealPlan({
              enabled: mealData.enabled || true,
              pricePerUnit: mealData.price_per_unit,
              weekdayMinQuantity: mealData.weekday_min_quantity || 12,
              weekendMinQuantity: mealData.weekend_min_quantity || 18,
              maxQuantity: mealData.max_quantity,
              description: mealData.unit_label || "每人每日",
              detailedDescription: mealData.detailed_description || ""
            });
          }
        }

        // 加載特色說明
        const { data: aboutData } = await supabase
          .from("about_section")
          .select("*")
          .eq("accommodation_id", infoData.id)
          .maybeSingle();

        if (aboutData) {
          setAboutSection({
            sectionTitle: aboutData.section_title || "自然中的秘境 X 宿泊空間",
            sectionDescription: aboutData.section_description || ""
          });
        }

        // 加載特色區塊
        const { data: featuresData } = await supabase
          .from("about_features")
          .select("*")
          .eq("accommodation_id", infoData.id)
          .order("display_order");

        if (featuresData) {
          setAboutFeatures(featuresData);
        }
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error loading data:', error);
      }
      toast.error('載入資料失敗');
    }
  };

  // 初始載入資料和當 currentAccommodationId 變化時重新載入
  useEffect(() => {
    loadData(currentAccommodationId || undefined);
  }, [currentAccommodationId]);

  // 當切換 tab 時重新載入對應資料
  useEffect(() => {
    if (!accommodationId) return;

    const reloadTabData = async () => {
      try {
        switch (activeTab) {
          case 'basic-info':
            // 重新載入基本資訊、Hero 輪播、特色說明和社群分享
            const { data: infoData } = await supabase
              .from("accommodation_info")
              .select("*")
              .eq("id", accommodationId)
              .maybeSingle();

            if (infoData) {
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
                tiktok_url: infoData.tiktok_url || "",
                header_logo_url: infoData.header_logo_url || "",
                footer_logo_url: infoData.footer_logo_url || "",
                og_title: infoData.og_title || "",
                og_description: infoData.og_description || "",
                og_image_url: infoData.og_image_url || "",
                website_url: infoData.website_url || "",
                hero_main_title: infoData.hero_main_title || "",
                hero_subtitle: infoData.hero_subtitle || "",
                hero_description: infoData.hero_description || "",
                hero_overlay_opacity: infoData.hero_overlay_opacity ?? 40,
                hero_autoplay_delay: infoData.hero_autoplay_delay ?? 8
              });

              // 重新載入首頁輪播圖
              const { data: heroData } = await supabase
                .from("accommodation_photos")
                .select("*")
                .eq("accommodation_id", accommodationId)
                .eq("photo_type", "hero")
                .order("display_order");
              if (heroData) setHeroPhotos(heroData);

              // 重新載入特色說明
              const { data: aboutData } = await supabase
                .from("about_section")
                .select("*")
                .eq("accommodation_id", accommodationId)
                .maybeSingle();
              if (aboutData) {
                setAboutSection({
                  sectionTitle: aboutData.section_title || "自然中的秘境 X 宿泊空間",
                  sectionDescription: aboutData.section_description || ""
                });
              }

              // 重新載入特色區塊
              const { data: featuresData } = await supabase
                .from("about_features")
                .select("*")
                .eq("accommodation_id", accommodationId)
                .order("display_order");
              if (featuresData) setAboutFeatures(featuresData);
            }
            break;

          case 'facilities':
            // 重新載入設施資料
            const { data: facilities } = await supabase
              .from("accommodation_facilities")
              .select("*")
              .eq("accommodation_id", accommodationId)
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
            break;

          case 'addon-plans':
            // 重新載入加購方案資料
            const { data: addonData } = await supabase
              .from("addon_settings")
              .select("*")
              .eq("accommodation_id", accommodationId);

            if (addonData) {
              const petData = addonData.find(a => a.addon_type === 'pet');
              const mealData = addonData.find(a => a.addon_type === 'meal');

              if (petData) {
                setPetPlan({
                  enabled: petData.enabled || true,
                  pricePerUnit: petData.price_per_unit,
                  maxQuantity: petData.max_quantity,
                  description: petData.unit_label || "每隻寵物",
                  detailedDescription: petData.detailed_description || ""
                });
              }

              if (mealData) {
                setMealPlan({
                  enabled: mealData.enabled || true,
                  pricePerUnit: mealData.price_per_unit,
                  weekdayMinQuantity: mealData.weekday_min_quantity || 12,
                  weekendMinQuantity: mealData.weekend_min_quantity || 18,
                  maxQuantity: mealData.max_quantity,
                  description: mealData.unit_label || "每人每日",
                  detailedDescription: mealData.detailed_description || ""
                });
              }
            }
            break;

          case 'gallery':
            // 重新載入相簿照片
            const { data: photosData } = await supabase
              .from("accommodation_photos")
              .select("*")
              .eq("accommodation_id", accommodationId)
              .eq("photo_type", "gallery")
              .order("display_order");

            if (photosData) setPhotos(photosData);
            break;

          case 'booking-info':
            // 重新載入訂房須知資料
            const { data: bookingSettings } = await supabase
              .from("booking_settings")
              .select("*")
              .eq("accommodation_id", accommodationId)
              .maybeSingle();

            // 同時載入 check_in_notice（不論 bookingSettings 是否存在）
            const { data: checkInNoticeData } = await supabase
              .from("accommodation_info")
              .select("check_in_notice")
              .eq("id", accommodationId)
              .maybeSingle();

            // 即使 bookingSettings 為 null 也要初始化表單（使用預設值）
            setBookingInfo({
              checkInTime: bookingSettings?.check_in_time || "15:00",
              checkOutTime: bookingSettings?.check_out_time || "11:00",
              paymentMethods: Array.isArray(bookingSettings?.payment_methods) 
                ? (bookingSettings.payment_methods as string[])
                : [],
              cancellationPolicy: bookingSettings?.cancellation_policy || "",
              checkInNotice: checkInNoticeData?.check_in_notice || "",
              petPolicy: bookingSettings?.pet_policy || "",
              otherNotes: bookingSettings?.other_notes || ""
            });
            break;

          case 'faq':
            // 重新載入常見問題
            const { data: faqData } = await supabase
              .from("faqs")
              .select("*")
              .eq("accommodation_id", accommodationId)
              .order("display_order");

            if (faqData) setFaqs(faqData);
            break;

          case 'location':
            // 重新載入交通地圖資料
            const { data: locationData } = await supabase
              .from("location_info")
              .select("*")
              .eq("accommodation_id", accommodationId)
              .maybeSingle();

            if (locationData) {
              setDrivingInfo(locationData.driving_info || "");
              setPublicTransportInfo(locationData.public_transport_info || "");
              
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
              }
            }
            break;
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('Error reloading tab data:', error);
        }
      }
    };
    
    reloadTabData();
  }, [activeTab, accommodationId]);

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

      // 重新載入設施資料
      const { data: updatedFacilities } = await supabase
        .from("accommodation_facilities")
        .select("*")
        .eq("accommodation_id", accommodationId)
        .eq("is_available", true);

      if (updatedFacilities) {
        const selected: Record<string, boolean> = {};
        const pricing: Record<string, string> = {};

        updatedFacilities.forEach(facility => {
          selected[facility.facility_name] = true;
          if (facility.pricing_type) {
            pricing[facility.facility_name] = facility.pricing_type;
          }
        });

        setSelectedFacilities(selected);
        setPricingTypes(pricing);
      }

      // 清除前台快取
      if (accommodationId) invalidateAccommodationCache(accommodationId);
      toast.success('設施資料已儲存');
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error saving facilities:', error);
      }
      toast.error('儲存失敗，請稍後再試');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveBookingInfo = async () => {
    if (!accommodationId) {
      toast.error('找不到旅宿資訊');
      return;
    }

    // 完整表單驗證
    const formData = {
      check_in_time: bookingInfo.checkInTime,
      check_out_time: bookingInfo.checkOutTime,
      cancellation_policy: bookingInfo.cancellationPolicy,
      pet_policy: bookingInfo.petPolicy,
      other_notes: bookingInfo.otherNotes,
    };

    const result = bookingSettingsSchema.safeParse(formData);
    
    if (!result.success) {
      const newErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) {
          newErrors[err.path[0].toString()] = err.message;
        }
      });
      setBookingErrors(newErrors);
      toast.error('請檢查表單欄位');
      return;
    }

    setIsSaving(true);
    try {
      // 使用 upsert 確保無資料時會建立新資料列
      const { error: bookingError } = await supabase
        .from("booking_settings")
        .upsert({
          accommodation_id: accommodationId,
          check_in_time: bookingInfo.checkInTime,
          check_out_time: bookingInfo.checkOutTime,
          payment_methods: bookingInfo.paymentMethods,
          cancellation_policy: bookingInfo.cancellationPolicy,
          pet_policy: bookingInfo.petPolicy,
          other_notes: bookingInfo.otherNotes,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'accommodation_id'
        });

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

      // 重新載入訂房須知資料
      const { data: updatedBookingSettings } = await supabase
        .from("booking_settings")
        .select("*")
        .eq("accommodation_id", accommodationId)
        .maybeSingle();

      if (updatedBookingSettings) {
        const { data: updatedInfo } = await supabase
          .from("accommodation_info")
          .select("check_in_notice")
          .eq("id", accommodationId)
          .maybeSingle();

        setBookingInfo({
          checkInTime: updatedBookingSettings.check_in_time || "15:00",
          checkOutTime: updatedBookingSettings.check_out_time || "11:00",
          paymentMethods: Array.isArray(updatedBookingSettings.payment_methods) 
            ? (updatedBookingSettings.payment_methods as string[])
            : [],
          cancellationPolicy: updatedBookingSettings.cancellation_policy || "",
          checkInNotice: updatedInfo?.check_in_notice || "",
          petPolicy: updatedBookingSettings.pet_policy || "",
          otherNotes: updatedBookingSettings.other_notes || ""
        });
      }

      // 清除前台快取
      if (accommodationId) invalidateAccommodationCache(accommodationId);
      toast.success('訂房須知已儲存');
      setBookingErrors({});
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error saving booking info:', error);
      }
      toast.error('儲存失敗，請稍後再試');
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

  // 訂房設定單一欄位驗證
  const validateBookingField = (fieldName: string, value: string) => {
    const result = bookingSettingsSchema.shape[fieldName as keyof typeof bookingSettingsSchema.shape]?.safeParse(value);
    
    if (result && !result.success) {
      setBookingErrors(prev => ({
        ...prev,
        [fieldName]: result.error.errors[0]?.message || "驗證失敗"
      }));
      return false;
    } else {
      setBookingErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[fieldName];
        return newErrors;
      });
      return true;
    }
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

  const handleDeleteFaqClick = (id: string) => {
    setDeletingFaqId(id);
    setDeleteFaqDialogOpen(true);
  };

  const handleDeleteFaq = async () => {
    if (!deletingFaqId) return;

    try {
      const { error } = await supabase.from("faqs").delete().eq("id", deletingFaqId);

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
      
      setDeleteFaqDialogOpen(false);
      setDeletingFaqId(null);
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
      // 更新 accommodation_info 中的地址
      const { error: addressError } = await supabase
        .from("accommodation_info")
        .update({ address: basicInfo.address })
        .eq("id", accommodationId);

      if (addressError) throw addressError;

      // 更新 location_info
      const { data: existing, error: fetchError } = await supabase
        .from("location_info")
        .select("id")
        .eq("accommodation_id", accommodationId)
        .maybeSingle();

      if (fetchError) throw fetchError;

      const locationData = {
        accommodation_id: accommodationId,
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

      // 儲存成功後重新載入資料
      const { data: updatedLocationData } = await supabase
        .from("location_info")
        .select("*")
        .eq("accommodation_id", accommodationId)
        .maybeSingle();

      if (updatedLocationData) {
        setDrivingInfo(updatedLocationData.driving_info || "");
        setPublicTransportInfo(updatedLocationData.public_transport_info || "");
        
        const attractions = updatedLocationData.nearby_attractions;
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
        }
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

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>, logoType: 'header' | 'footer') => {
    const file = event.target.files?.[0];
    if (!file || !accommodationId) return;

    // 驗證文件
    const validation = validateImageFile(file, 10 * 1024 * 1024); // 10MB 上限
    if (!validation.valid) {
      toast.error(validation.error);
      event.target.value = '';
      return;
    }

    try {
      // 先壓縮圖片
      toast.info('正在優化圖片...');
      const { blob, originalSize, compressedSize, compressionRatio } = await compressImage(file, {
        maxWidth: 800,
        maxHeight: 240,
        quality: 0.9
      });

      // 顯示壓縮信息
      if (compressionRatio > 5) {
        toast.success(
          `圖片已優化！原始大小：${formatFileSize(originalSize)}\n優化後：${formatFileSize(compressedSize)}\n節省：${compressionRatio.toFixed(1)}%`,
          { duration: 4000 }
        );
      }

      // 創建圖片預覽 URL
      const imageUrl = URL.createObjectURL(blob);
      setCropImageSrc(imageUrl);
      setCropLogoType(logoType);
      setCropDialogOpen(true);
    } catch (error) {
      console.error('圖片處理失敗:', error);
      toast.error('圖片處理失敗，請稍後再試');
    }

    // 清除 input 值
    event.target.value = '';
  };

  const handleCropComplete = async (croppedImage: Blob) => {
    if (!accommodationId) return;

    const setUploading = cropLogoType === 'header' ? setUploadingHeaderLogo : setUploadingFooterLogo;
    setUploading(true);

    try {
      // 驗證裁剪後的圖片尺寸
      const img = new Image();
      const imageUrl = URL.createObjectURL(croppedImage);
      
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = imageUrl;
      });

      // 建議尺寸
      const recommendedWidth = 200;
      const recommendedHeight = 60;
      const tolerance = 0.2; // 20% 容差

      const widthDiff = Math.abs(img.width - recommendedWidth) / recommendedWidth;
      const heightDiff = Math.abs(img.height - recommendedHeight) / recommendedHeight;

      // 如果尺寸差異超過容差，顯示警告
      if (widthDiff > tolerance || heightDiff > tolerance) {
        toast.warning(
          `圖片尺寸為 ${img.width}x${img.height} 像素，建議尺寸為 ${recommendedWidth}x${recommendedHeight} 像素。\n圖片仍會上傳，但可能影響顯示效果。`,
          { duration: 5000 }
        );
      }

      // 清理臨時 URL
      URL.revokeObjectURL(imageUrl);
      URL.revokeObjectURL(cropImageSrc);

      // 生成唯一檔案名（使用 webp 擴展名）
      const fileName = `${accommodationId}/${cropLogoType}-logo-${Date.now()}.webp`;

      // 上傳到 Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(fileName, croppedImage, {
          cacheControl: '3600',
          upsert: true,
          contentType: 'image/webp'
        });

      if (uploadError) throw uploadError;

      // 獲取公開 URL
      const { data: { publicUrl } } = supabase.storage
        .from('logos')
        .getPublicUrl(fileName);

      // 立即保存到資料庫
      const updateField = cropLogoType === 'header' ? 'header_logo_url' : 'footer_logo_url';
      const { error: dbError } = await supabase
        .from('accommodation_info')
        .update({ [updateField]: publicUrl })
        .eq('id', accommodationId);

      if (dbError) throw dbError;

      // 更新狀態
      if (cropLogoType === 'header') {
        setBasicInfo(prev => ({ ...prev, header_logo_url: publicUrl }));
      } else {
        setBasicInfo(prev => ({ ...prev, footer_logo_url: publicUrl }));
      }

      // 清除前台快取
      if (accommodationId) invalidateAccommodationCache(accommodationId);
      toast.success(`${cropLogoType === 'header' ? '頁首' : '頁尾'} Logo 已上傳`);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error uploading logo:', error);
      }
      toast.error('上傳失敗，請稍後再試');
    } finally {
      setUploading(false);
    }
  };

  const openDeleteConfirm = (logoType: 'header' | 'footer') => {
    setDeleteLogoType(logoType);
    setDeleteConfirmOpen(true);
  };

  const confirmLogoDelete = async () => {
    if (!accommodationId || !deleteLogoType) return;

    const currentLogoUrl = deleteLogoType === 'header' ? basicInfo.header_logo_url : basicInfo.footer_logo_url;
    if (!currentLogoUrl) return;

    try {
      // 從 URL 提取文件路徑
      const urlParts = currentLogoUrl.split('/logos/');
      if (urlParts.length > 1) {
        const filePath = urlParts[1].split('?')[0]; // 移除查詢參數

        // 從 storage 中刪除文件
        const { error: deleteError } = await supabase.storage
          .from('logos')
          .remove([filePath]);

        if (deleteError) {
          console.error('Error deleting from storage:', deleteError);
        }
      }

      // 從資料庫中清除 logo URL
      const updateField = deleteLogoType === 'header' ? 'header_logo_url' : 'footer_logo_url';
      const { error: updateError } = await supabase
        .from('accommodation_info')
        .update({ [updateField]: null })
        .eq('id', accommodationId);

      if (updateError) throw updateError;

      // 更新狀態
      if (deleteLogoType === 'header') {
        setBasicInfo(prev => ({ ...prev, header_logo_url: '' }));
      } else {
        setBasicInfo(prev => ({ ...prev, footer_logo_url: '' }));
      }

      toast.success(`${deleteLogoType === 'header' ? '頁首' : '頁尾'} Logo 已刪除`);
      setDeleteConfirmOpen(false);
      setDeleteLogoType(null);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error deleting logo:', error);
      }
      toast.error('刪除失敗，請稍後再試');
    }
  };

  const handleOgImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !accommodationId) return;

    // 驗證文件
    const validation = validateImageFile(file, 10 * 1024 * 1024); // 10MB 上限
    if (!validation.valid) {
      toast.error(validation.error);
      event.target.value = '';
      return;
    }

    try {
      const originalSize = file.size;

      // 壓縮圖片
      toast.info('正在優化圖片，請稍候...');
      const { blob, dataUrl, compressedSize, compressionRatio } = await compressImage(file, {
        maxWidth: 1200,
        maxHeight: 630,
        quality: 0.9
      });

      // 顯示壓縮信息
      if (compressionRatio > 5) {
        toast.success(
          `圖片已自動優化並轉換為 WebP 格式！\n原始：${formatFileSize(originalSize)} → 優化後：${formatFileSize(compressedSize)}\n節省：${compressionRatio.toFixed(1)}%`,
          { duration: 5000 }
        );
      }

      // 檢查圖片尺寸
      const img = new Image();
      img.onload = () => {
        const width = img.width;
        const height = img.height;
        const recommendedWidth = 1200;
        const recommendedHeight = 630;

        // 檢查圖片尺寸
        if (width < recommendedWidth || height < recommendedHeight) {
          toast.warning(
            `圖片解析度較低（${width} x ${height} px），可能影響社群平台顯示品質。\n建議使用至少 ${recommendedWidth} x ${recommendedHeight} px 的圖片以獲得最佳效果。`,
            {
              duration: 6000,
            }
          );
        }

        // 顯示裁切對話框
        setOgImageCropSrc(dataUrl);
        setOgImageCropDialogOpen(true);
      };
      img.src = dataUrl;
    } catch (error) {
      console.error('圖片處理失敗:', error);
      toast.error('圖片處理失敗，請稍後再試');
    }

    event.target.value = '';
  };

  const handleOgImageCropComplete = async (croppedImage: Blob) => {
    if (!accommodationId) return;

    setUploadingOgImage(true);

    try {
      // 生成唯一檔案名（使用 webp 擴展名）
      const fileName = `${accommodationId}/og-image-${Date.now()}.webp`;

      // 上傳到 Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('og-images')
        .upload(fileName, croppedImage, {
          cacheControl: '3600',
          upsert: true,
          contentType: 'image/webp'
        });

      if (uploadError) throw uploadError;

      // 獲取公開 URL
      const { data: { publicUrl } } = supabase.storage
        .from('og-images')
        .getPublicUrl(fileName);

      // 更新狀態
      setBasicInfo(prev => ({ ...prev, og_image_url: publicUrl }));

      toast.success('社群分享縮圖已上傳（WebP 格式）');
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error uploading OG image:', error);
      }
      toast.error('上傳失敗，請稍後再試');
    } finally {
      setUploadingOgImage(false);
    }
  };

  const handleDeleteOgImageClick = () => {
    setDeleteOgImageDialogOpen(true);
  };

  const handleDeleteOgImage = async () => {
    if (!accommodationId || !basicInfo.og_image_url) return;

    try {
      // 從 URL 提取文件路徑
      const urlParts = basicInfo.og_image_url.split('/og-images/');
      if (urlParts.length > 1) {
        const filePath = urlParts[1];
        
        // 從 Storage 刪除文件
        const { error: deleteError } = await supabase.storage
          .from('og-images')
          .remove([filePath]);

        if (deleteError) throw deleteError;
      }

      // 更新狀態
      setBasicInfo(prev => ({ ...prev, og_image_url: '' }));

      toast.success('社群分享縮圖已刪除');
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error deleting OG image:', error);
      }
      toast.error('刪除失敗，請稍後再試');
    } finally {
      setDeleteOgImageDialogOpen(false);
    }
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
          tiktok_url: basicInfo.tiktok_url,
          header_logo_url: basicInfo.header_logo_url,
          footer_logo_url: basicInfo.footer_logo_url,
          og_title: basicInfo.og_title,
          og_description: basicInfo.og_description,
          og_image_url: basicInfo.og_image_url,
          hero_main_title: basicInfo.hero_main_title,
          hero_subtitle: basicInfo.hero_subtitle,
          hero_description: basicInfo.hero_description,
          hero_overlay_opacity: basicInfo.hero_overlay_opacity,
          hero_autoplay_delay: basicInfo.hero_autoplay_delay
        })
        .eq("id", accommodationId);

      if (error) throw error;

      // 重新載入網頁設定資料
      const { data: updatedInfo } = await supabase
        .from("accommodation_info")
        .select("id, name, description, address, phone, email, line_id, facebook_url, instagram_url, threads_url, youtube_url, tiktok_url, header_logo_url, footer_logo_url, og_title, og_description, og_image_url, website_url, hero_main_title, hero_subtitle, hero_description, hero_overlay_opacity, hero_autoplay_delay")
        .eq("id", accommodationId)
        .maybeSingle();

      if (updatedInfo) {
        setBasicInfo({
          name: updatedInfo.name || "",
          description: updatedInfo.description || "",
          address: updatedInfo.address || "",
          phone: updatedInfo.phone || "",
          email: updatedInfo.email || "",
          line_id: updatedInfo.line_id || "",
          facebook_url: updatedInfo.facebook_url || "",
          instagram_url: updatedInfo.instagram_url || "",
          threads_url: updatedInfo.threads_url || "",
          youtube_url: updatedInfo.youtube_url || "",
          tiktok_url: updatedInfo.tiktok_url || "",
          header_logo_url: updatedInfo.header_logo_url || "",
          footer_logo_url: updatedInfo.footer_logo_url || "",
          og_title: updatedInfo.og_title || "",
          og_description: updatedInfo.og_description || "",
          og_image_url: updatedInfo.og_image_url || "",
          website_url: updatedInfo.website_url || "",
          hero_main_title: updatedInfo.hero_main_title || "",
          hero_subtitle: updatedInfo.hero_subtitle || "",
          hero_description: updatedInfo.hero_description || "",
          hero_overlay_opacity: updatedInfo.hero_overlay_opacity ?? 40,
          hero_autoplay_delay: updatedInfo.hero_autoplay_delay ?? 8
        });
      }

      // 更新瀏覽器標題
      if (basicInfo.name) {
        document.title = basicInfo.name;
      }

      // 清除前台快取
      if (accommodationId) invalidateAccommodationCache(accommodationId);
      toast.success('網頁設定已儲存');
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

    const files = Array.from(event.target.files);
    const totalFiles = files.length;
    
    setUploadingPhoto(true);
    setUploadProgress({ current: 0, total: totalFiles });
    
    try {
      // 驗證所有文件
      for (const file of files) {
        const validation = validateImageFile(file, 10 * 1024 * 1024); // 10MB 上限
        if (!validation.valid) {
          toast.error(`${file.name}: ${validation.error}`);
          event.target.value = '';
          setUploadingPhoto(false);
          setUploadProgress({ current: 0, total: 0 });
          return;
        }
      }
      
      const uploadedPhotos: typeof photos = [];
      let currentMaxOrder = photos.length > 0 
        ? Math.max(...photos.map(p => p.display_order)) 
        : 0;
      
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgress({ current: i + 1, total: totalFiles });
        
        try {
          // 壓縮圖片
          const { blob, originalSize, compressedSize, compressionRatio } = await compressImage(file, {
            maxWidth: 1600,
            maxHeight: 1200,
            quality: 0.85
          });

          const fileName = `gallery-${Date.now()}-${i}.webp`;
          const filePath = `${accommodationId}/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from('room-photos')
            .upload(filePath, blob, {
              contentType: 'image/webp',
              cacheControl: '3600'
            });

          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage
            .from('room-photos')
            .getPublicUrl(filePath);

          currentMaxOrder++;

          const { error: insertError, data: newPhoto } = await supabase
            .from('accommodation_photos')
            .insert([
              {
                accommodation_id: accommodationId,
                photo_url: publicUrl,
                display_order: currentMaxOrder,
                photo_type: 'gallery'
              }
            ])
            .select()
            .single();

          if (insertError) throw insertError;

          uploadedPhotos.push(newPhoto);
          successCount++;
        } catch (error) {
          failCount++;
          if (import.meta.env.DEV) {
            console.error(`Error uploading photo ${file.name}:`, error);
          }
        }
      }

      if (uploadedPhotos.length > 0) {
        setPhotos([...photos, ...uploadedPhotos]);
      }

      if (successCount > 0 && failCount === 0) {
        toast.success(`已成功上傳 ${successCount} 張照片`);
      } else if (successCount > 0 && failCount > 0) {
        toast.warning(`已上傳 ${successCount} 張照片，${failCount} 張失敗`);
      } else {
        toast.error('所有照片上傳失敗');
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error uploading photos:', error);
      }
      toast.error('上傳失敗，請稍後再試');
    } finally {
      setUploadingPhoto(false);
      setUploadProgress({ current: 0, total: 0 });
      event.target.value = '';
    }
  };

  const handleDeletePhotoClick = (photoId: string) => {
    setDeletingPhotoId(photoId);
    setDeletePhotoDialogOpen(true);
  };

  const handleDeletePhoto = async () => {
    if (!deletingPhotoId) return;

    try {
      const { error } = await supabase
        .from('accommodation_photos')
        .delete()
        .eq('id', deletingPhotoId);

      if (error) throw error;

      setPhotos(photos.filter(p => p.id !== deletingPhotoId));
      toast.success('照片已刪除');
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error deleting photo:', error);
      }
      toast.error('刪除失敗，請稍後再試');
    } finally {
      setDeletePhotoDialogOpen(false);
      setDeletingPhotoId(null);
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
        .eq('photo_type', 'gallery')
        .order('display_order');
      if (data) setPhotos(data);
    }
  };

  // Hero carousel handlers
  const handleHeroPhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!accommodationId || !event.target.files || event.target.files.length === 0) {
      return;
    }

    if (heroPhotos.length >= MAX_HERO_PHOTOS) {
      toast.error(`最多只能上傳 ${MAX_HERO_PHOTOS} 張輪播圖`);
      return;
    }

    setUploadingHeroPhoto(true);
    try {
      const file = event.target.files[0];

      // 驗證文件
      const validation = validateImageFile(file, 10 * 1024 * 1024); // 10MB 上限
      if (!validation.valid) {
        toast.error(validation.error);
        event.target.value = '';
        setUploadingHeroPhoto(false);
        return;
      }

      // 壓縮圖片
      toast.info('正在優化圖片...');
      const { blob, originalSize, compressedSize, compressionRatio } = await compressImage(file, {
        maxWidth: 1920,
        maxHeight: 1080,
        quality: 0.85
      });

      // 顯示壓縮信息
      if (compressionRatio > 5) {
        toast.success(
          `圖片已優化為 WebP 格式！\n原始：${formatFileSize(originalSize)} → 優化後：${formatFileSize(compressedSize)}\n節省：${compressionRatio.toFixed(1)}%`,
          { duration: 4000 }
        );
      }

      const fileName = `hero-${Date.now()}.webp`;
      const filePath = `${accommodationId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('room-photos')
        .upload(filePath, blob, {
          contentType: 'image/webp',
          cacheControl: '3600'
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('room-photos')
        .getPublicUrl(filePath);

      const maxOrder = heroPhotos.length > 0 
        ? Math.max(...heroPhotos.map(p => p.display_order || 0)) 
        : 0;

      const { error: insertError, data: newPhoto } = await supabase
        .from('accommodation_photos')
        .insert([
          {
            accommodation_id: accommodationId,
            photo_url: publicUrl,
            display_order: maxOrder + 1,
            photo_type: 'hero'
          }
        ])
        .select()
        .single();

      if (insertError) throw insertError;

      setHeroPhotos([...heroPhotos, newPhoto]);
      toast.success('輪播圖已上傳');
      event.target.value = '';
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error uploading hero photo:', error);
      }
      toast.error('上傳失敗，請稍後再試');
    } finally {
      setUploadingHeroPhoto(false);
    }
  };

  const handleDeleteHeroPhotoClick = (photoId: string) => {
    setDeletingHeroPhotoId(photoId);
    setDeleteHeroPhotoDialogOpen(true);
  };

  const handleDeleteHeroPhoto = async () => {
    if (!deletingHeroPhotoId) return;

    try {
      const { error } = await supabase
        .from('accommodation_photos')
        .delete()
        .eq('id', deletingHeroPhotoId);

      if (error) throw error;

      setHeroPhotos(heroPhotos.filter(p => p.id !== deletingHeroPhotoId));
      toast.success('輪播圖已刪除');
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error deleting hero photo:', error);
      }
      toast.error('刪除失敗，請稍後再試');
    } finally {
      setDeleteHeroPhotoDialogOpen(false);
      setDeletingHeroPhotoId(null);
    }
  };

  const handleHeroPhotoReorder = async (newOrder: any[]) => {
    try {
      // 更新本地狀態
      setHeroPhotos(newOrder);

      // 批量更新數據庫中的 display_order
      const updates = newOrder.map((photo, index) => ({
        id: photo.id,
        display_order: index + 1
      }));

      for (const update of updates) {
        const { error } = await supabase
          .from('accommodation_photos')
          .update({ display_order: update.display_order })
          .eq('id', update.id);

        if (error) throw error;
      }

      toast.success('輪播圖順序已更新');
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error reordering hero photos:', error);
      }
      toast.error('更新順序失敗，請稍後再試');
    }
  };

  const handlePreviewCarousel = () => {
    setIsCarouselPreviewOpen(true);
  };

  const handleHeroPhotoDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id || !accommodationId) {
      return;
    }

    const oldIndex = heroPhotos.findIndex((p) => p.id === active.id);
    const newIndex = heroPhotos.findIndex((p) => p.id === over.id);

    const updatedPhotos = arrayMove(heroPhotos, oldIndex, newIndex).map((photo, index) => ({
      ...photo,
      display_order: index + 1,
    }));

    setHeroPhotos(updatedPhotos);

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
        console.error('Error updating hero photo order:', error);
      }
      toast.error('更新失敗，請稍後再試');
      // Reload photos on error
      const { data } = await supabase
        .from('accommodation_photos')
        .select('*')
        .eq('accommodation_id', accommodationId!)
        .eq('photo_type', 'hero')
        .order('display_order');
      if (data) setHeroPhotos(data);
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // 加購方案單一欄位驗證
  const validateAddonField = (
    planType: 'pet' | 'meal',
    fieldName: string,
    value: string
  ) => {
    const result = addonSettingsSchema.shape[fieldName as keyof typeof addonSettingsSchema.shape]?.safeParse(value);
    
    if (result && !result.success) {
      if (planType === 'pet') {
        setPetPlanErrors(prev => ({
          ...prev,
          [fieldName]: result.error.errors[0]?.message || "驗證失敗"
        }));
      } else {
        setMealPlanErrors(prev => ({
          ...prev,
          [fieldName]: result.error.errors[0]?.message || "驗證失敗"
        }));
      }
      return false;
    } else {
      if (planType === 'pet') {
        setPetPlanErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors[fieldName];
          return newErrors;
        });
      } else {
        setMealPlanErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors[fieldName];
          return newErrors;
        });
      }
      return true;
    }
  };

  const handleSaveAddonPlans = async () => {
    if (!accommodationId) {
      toast.error('找不到旅宿資訊');
      return;
    }

    // 驗證寵物方案
    const petData = {
      description: petPlan.description,
      detailed_description: petPlan.detailedDescription,
      unit_label: petPlan.description,
      price_per_unit: petPlan.pricePerUnit.toString(),
      max_quantity: petPlan.maxQuantity.toString(),
      min_quantity: "0"
    };

    const petResult = addonSettingsSchema.safeParse(petData);
    
    if (!petResult.success && petPlan.enabled) {
      const newErrors: Record<string, string> = {};
      petResult.error.errors.forEach((err) => {
        if (err.path[0]) {
          newErrors[err.path[0].toString()] = err.message;
        }
      });
      setPetPlanErrors(newErrors);
      toast.error('請檢查寵物方案表單欄位');
      return;
    }

    // 驗證餐食方案
    const mealData = {
      description: mealPlan.description,
      detailed_description: mealPlan.detailedDescription,
      unit_label: mealPlan.description,
      price_per_unit: mealPlan.pricePerUnit.toString(),
      max_quantity: mealPlan.maxQuantity.toString(),
      min_quantity: "0",
      weekday_min_quantity: mealPlan.weekdayMinQuantity.toString(),
      weekend_min_quantity: mealPlan.weekendMinQuantity.toString()
    };

    const mealResult = addonSettingsSchema.safeParse(mealData);
    
    if (!mealResult.success && mealPlan.enabled) {
      const newErrors: Record<string, string> = {};
      mealResult.error.errors.forEach((err) => {
        if (err.path[0]) {
          newErrors[err.path[0].toString()] = err.message;
        }
      });
      setMealPlanErrors(newErrors);
      toast.error('請檢查餐食方案表單欄位');
      return;
    }

    setIsSaving(true);
    try {
      // 保存寵物方案
      const { error: petError } = await supabase
        .from("addon_settings")
        .upsert({
          accommodation_id: accommodationId,
          addon_type: 'pet',
          enabled: petPlan.enabled,
          price_per_unit: petPlan.pricePerUnit,
          min_quantity: 0,
          max_quantity: petPlan.maxQuantity,
          unit_label: petPlan.description,
          description: `每隻 NT$ ${petPlan.pricePerUnit} / 每晚`,
          detailed_description: petPlan.detailedDescription
        }, {
          onConflict: 'accommodation_id,addon_type'
        });

      if (petError) throw petError;

      // 保存餐食方案
      const { error: mealError } = await supabase
        .from("addon_settings")
        .upsert({
          accommodation_id: accommodationId,
          addon_type: 'meal',
          enabled: mealPlan.enabled,
          price_per_unit: mealPlan.pricePerUnit,
          min_quantity: 0,
          max_quantity: mealPlan.maxQuantity,
          weekday_min_quantity: mealPlan.weekdayMinQuantity,
          weekend_min_quantity: mealPlan.weekendMinQuantity,
          unit_label: mealPlan.description,
          description: `每人 NT$ ${mealPlan.pricePerUnit} / 每日`,
          detailed_description: mealPlan.detailedDescription
        }, {
          onConflict: 'accommodation_id,addon_type'
        });

      if (mealError) throw mealError;

      // 重新載入加購方案資料
      const { data: updatedAddonData } = await supabase
        .from("addon_settings")
        .select("*")
        .eq("accommodation_id", accommodationId);

      if (updatedAddonData) {
        const petData = updatedAddonData.find(a => a.addon_type === 'pet');
        const mealData = updatedAddonData.find(a => a.addon_type === 'meal');

        if (petData) {
          setPetPlan({
            enabled: petData.enabled || true,
            pricePerUnit: petData.price_per_unit,
            maxQuantity: petData.max_quantity,
            description: petData.unit_label || "每隻寵物",
            detailedDescription: petData.detailed_description || ""
          });
        }

        if (mealData) {
          setMealPlan({
            enabled: mealData.enabled || true,
            pricePerUnit: mealData.price_per_unit,
            maxQuantity: mealData.max_quantity,
            weekdayMinQuantity: mealData.weekday_min_quantity || 0,
            weekendMinQuantity: mealData.weekend_min_quantity || 0,
            description: mealData.unit_label || "每人每日",
            detailedDescription: mealData.detailed_description || ""
          });
        }
      }

      toast.success('加購方案設定已儲存');
      setPetPlanErrors({});
      setMealPlanErrors({});
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error saving addon plans:', error);
      }
      toast.error('儲存失敗，請稍後再試');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAboutSection = async () => {
    if (!accommodationId) {
      toast.error('找不到旅宿資訊');
      return;
    }

    setIsSaving(true);
    try {
      // 保存特色說明主標題和描述
      const { error: sectionError } = await supabase
        .from("about_section")
        .upsert({
          accommodation_id: accommodationId,
          section_title: aboutSection.sectionTitle,
          section_description: aboutSection.sectionDescription
        }, {
          onConflict: 'accommodation_id'
        });

      if (sectionError) throw sectionError;

      // 重新載入特色說明資料
      const { data: updatedSection } = await supabase
        .from("about_section")
        .select("*")
        .eq("accommodation_id", accommodationId)
        .maybeSingle();

      if (updatedSection) {
        setAboutSection({
          sectionTitle: updatedSection.section_title || "自然中的秘境 X 宿泊空間",
          sectionDescription: updatedSection.section_description || ""
        });
      }

      toast.success('特色說明已儲存');
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error saving about section:', error);
      }
      toast.error('儲存失敗，請稍後再試');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveFeature = async (feature: any) => {
    if (!accommodationId) {
      toast.error('找不到旅宿資訊');
      return;
    }

    try {
      if (feature.id) {
        // 更新現有特色
        const { error } = await supabase
          .from("about_features")
          .update({
            title: feature.title,
            description: feature.description,
            icon_type: feature.icon_type,
            icon_name: feature.icon_name,
            icon_url: feature.icon_url,
            display_order: feature.display_order
          })
          .eq("id", feature.id);

        if (error) throw error;
      } else {
        // 新增特色
        const { error } = await supabase
          .from("about_features")
          .insert({
            accommodation_id: accommodationId,
            title: feature.title,
            description: feature.description,
            icon_type: feature.icon_type,
            icon_name: feature.icon_name,
            icon_url: feature.icon_url,
            display_order: aboutFeatures.length
          });

        if (error) throw error;
      }

      // 重新載入特色區塊
      const { data: featuresData } = await supabase
        .from("about_features")
        .select("*")
        .eq("accommodation_id", accommodationId)
        .order("display_order");

      if (featuresData) {
        setAboutFeatures(featuresData);
      }

      toast.success(feature.id ? '特色已更新' : '特色已新增');
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error saving feature:', error);
      }
      toast.error('儲存失敗，請稍後再試');
    }
  };

  const handleDeleteFeatureClick = (featureId: string) => {
    setDeletingFeatureId(featureId);
    setDeleteFeatureDialogOpen(true);
  };

  const handleDeleteFeature = async () => {
    if (!accommodationId || !deletingFeatureId) return;

    try {
      const { error } = await supabase
        .from("about_features")
        .delete()
        .eq("id", deletingFeatureId);

      if (error) throw error;

      // 重新載入特色區塊
      const { data: featuresData } = await supabase
        .from("about_features")
        .select("*")
        .eq("accommodation_id", accommodationId)
        .order("display_order");

      if (featuresData) {
        setAboutFeatures(featuresData);
      }

      toast.success("特色區塊已刪除");
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Error deleting feature:", error);
      }
      toast.error("刪除失敗，請稍後再試");
    } finally {
      setDeleteFeatureDialogOpen(false);
      setDeletingFeatureId(null);
    }
  };

  const handleFeatureDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id || !accommodationId) {
      return;
    }

    const oldIndex = aboutFeatures.findIndex((f) => f.id === active.id);
    const newIndex = aboutFeatures.findIndex((f) => f.id === over.id);

    const updatedFeatures = arrayMove(aboutFeatures, oldIndex, newIndex).map((feature, index) => ({
      ...feature,
      display_order: index,
    }));

    setAboutFeatures(updatedFeatures);

    // 儲存到資料庫
    try {
      const updates = updatedFeatures.map((feature) =>
        supabase
          .from('about_features')
          .update({ display_order: feature.display_order })
          .eq('id', feature.id)
      );

      await Promise.all(updates);
      toast.success('排序已更新');
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error updating feature order:', error);
      }
      toast.error('更新失敗，請稍後再試');
      // 發生錯誤時重新載入
      const { data } = await supabase
        .from('about_features')
        .select('*')
        .eq('accommodation_id', accommodationId)
        .order('display_order');
      if (data) setAboutFeatures(data);
    }
  };

  return (
    <div className="p-4 md:p-0">
      <Breadcrumb className="mb-4 md:mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/admin" className="flex items-center hover:opacity-70 transition-opacity">
                <Home className="h-4 w-4" />
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/admin/website-content" className="hover:opacity-70 transition-opacity">
                官網內容
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{getBreadcrumbTitle()}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsContent value="basic-info" className="space-y-6">
          <PageHeader title="網頁設定" icon={Info} />
          <WebInfoSection
            accommodationId={accommodationId || ''}
            heroPhotos={heroPhotos}
            heroMainTitle={basicInfo.hero_main_title}
            heroSubtitle={basicInfo.hero_subtitle}
            heroDescription={basicInfo.hero_description}
            heroOverlayOpacity={basicInfo.hero_overlay_opacity}
            heroAutoplayDelay={basicInfo.hero_autoplay_delay}
            onUpdate={loadData}
            onHeroPhotoUpload={handleHeroPhotoUpload}
            onDeleteHeroPhoto={handleDeleteHeroPhotoClick}
            onHeroPhotoReorder={handleHeroPhotoReorder}
            onPreviewCarousel={handlePreviewCarousel}
            onHeroTitleChange={(field, value) => {
              setBasicInfo(prev => ({ ...prev, [field]: value }));
            }}
            onHeroSettingChange={(field, value) => {
              setBasicInfo(prev => ({ ...prev, [field]: value }));
            }}
            uploadingHeroPhoto={uploadingHeroPhoto}
            onSave={handleSaveBasicInfo}
            isSaving={isSaving}
          />

          <HeroCarouselPreviewDialog
            open={isCarouselPreviewOpen}
            onOpenChange={setIsCarouselPreviewOpen}
            photos={heroPhotos}
          />

          <AboutFeaturesSection
            accommodationId={accommodationId || ''}
            sectionTitle={aboutSection.sectionTitle}
            sectionDescription={aboutSection.sectionDescription}
            features={aboutFeatures}
            onUpdate={loadData}
            onEditFeature={(feature) => {
              setEditingFeature(feature);
              setFeatureFormOpen(true);
            }}
            onDeleteFeature={handleDeleteFeatureClick}
            onAddFeature={() => {
              if (aboutFeatures.length >= 4) {
                toast.error('最多只能添加 4 個特色區塊');
                return;
              }
              setEditingFeature(null);
              setFeatureFormOpen(true);
            }}
          />

          <SocialSharingSection
            accommodationId={accommodationId || ''}
            ogTitle={basicInfo.og_title}
            ogDescription={basicInfo.og_description}
            ogImageUrl={basicInfo.og_image_url}
            onUpdate={loadData}
            onOgImageUpload={handleOgImageUpload}
            onDeleteOgImage={handleDeleteOgImageClick}
            uploadingOgImage={uploadingOgImage}
          />

          <HeaderFooterSection
            accommodationId={accommodationId || ''}
            name={basicInfo.name}
            headerLogoUrl={basicInfo.header_logo_url}
            footerLogoUrl={basicInfo.footer_logo_url}
            address={basicInfo.address}
            phone={basicInfo.phone}
            email={basicInfo.email}
            lineId={basicInfo.line_id}
            facebookUrl={basicInfo.facebook_url}
            instagramUrl={basicInfo.instagram_url}
            threadsUrl={basicInfo.threads_url}
            youtubeUrl={basicInfo.youtube_url}
            tiktokUrl={basicInfo.tiktok_url}
            onUpdate={loadData}
            onLogoUpload={handleLogoUpload}
            onDeleteLogo={openDeleteConfirm}
            uploadingHeaderLogo={uploadingHeaderLogo}
            uploadingFooterLogo={uploadingFooterLogo}
          />
        </TabsContent>

        <TabsContent value="facilities" className="space-y-6">
          <PageHeader title="設施服務" icon={Wrench} />
          {/* 公共區設施與服務 */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-1.5 bg-primary rounded-full" />
                <div>
                  <CardTitle className="text-xl">公共區設施與服務</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">選擇提供的公共設施與服務項目</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
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
                          className="h-5 w-5 touch-manipulation"
                        />
                        <Label htmlFor={facility.id}>{facility.name}</Label>
                      </div>
                      {facility.hasPrice && selectedFacilities[facility.name] && (
                        <Select
                          value={pricingTypes[facility.name] || 'free'}
                          onValueChange={(value) => handlePricingTypeChange(facility.name, value)}
                        >
                          <SelectTrigger className="w-full h-12 text-base sm:h-10 sm:text-sm touch-manipulation">
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
            </CardContent>
          </Card>

          {/* 餐飲設施 */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-1.5 bg-primary rounded-full" />
                <div>
                  <CardTitle className="text-xl">餐飲設施</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">設定餐飲相關的設施與服務</p>
                </div>
              </div>
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
                      className="h-5 w-5 touch-manipulation"
                    />
                    <Label htmlFor={facility.id}>{facility.name}</Label>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 安全設施 */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-1.5 bg-primary rounded-full" />
                <div>
                  <CardTitle className="text-xl">安全設施</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">確保住客安全的相關設備</p>
                </div>
              </div>
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
                      className="h-5 w-5 touch-manipulation"
                    />
                    <Label htmlFor={facility.id}>{facility.name}</Label>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 休閒娛樂設施 */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-1.5 bg-primary rounded-full" />
                <div>
                  <CardTitle className="text-xl">休閒娛樂設施</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">提供的休閒與娛樂設施選項</p>
                </div>
              </div>
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
                          className="h-5 w-5 touch-manipulation"
                        />
                        <Label htmlFor={facility.id}>{facility.name}</Label>
                      </div>
                    {facility.hasPrice && selectedFacilities[facility.name] && (
                      <Select
                        value={pricingTypes[facility.name] || 'free'}
                        onValueChange={(value) => handlePricingTypeChange(facility.name, value)}
                      >
                        <SelectTrigger className="w-full h-12 text-base sm:h-10 sm:text-sm touch-manipulation">
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
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-1.5 bg-primary rounded-full" />
                <div>
                  <CardTitle className="text-xl">服務語言</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">選擇可提供服務的語言</p>
                </div>
              </div>
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
                      className="h-5 w-5 touch-manipulation"
                    />
                    <Label htmlFor={facility.id}>{facility.name}</Label>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <SaveButtonContainer 
            onSave={handleSaveFacilities} 
            isSaving={isSaving}
            saveText="儲存變更"
          />
        </TabsContent>

        <TabsContent value="addon-plans" className="space-y-6">
          <PageHeader title="加購方案" icon={Package} />
          {/* 寵物方案 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>寵物方案</span>
                <div className="flex items-center gap-2">
                  <Label htmlFor="pet-enabled" className="text-sm font-normal">啟用</Label>
                  <Switch
                    id="pet-enabled"
                    checked={petPlan.enabled}
                    onCheckedChange={(checked) => setPetPlan({ ...petPlan, enabled: checked })}
                    className="touch-manipulation"
                  />
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <ValidatedNumberInput
                  label="價格 (每隻/每晚)"
                  prefix="NT$"
                  value={petPlan.pricePerUnit}
                  error={petPlanErrors.price_per_unit}
                  min="0"
                  disabled={!petPlan.enabled}
                  onChange={(value) => {
                    setPetPlan({ ...petPlan, pricePerUnit: value });
                  }}
                  onValidate={(value) => validateAddonField('pet', 'price_per_unit', value)}
                />
                <ValidatedNumberInput
                  label="數量上限 (隻)"
                  value={petPlan.maxQuantity}
                  error={petPlanErrors.max_quantity}
                  min="1"
                  disabled={!petPlan.enabled}
                  onChange={(value) => {
                    setPetPlan({ ...petPlan, maxQuantity: value });
                  }}
                  onValidate={(value) => validateAddonField('pet', 'max_quantity', value)}
                />
              </div>
              <ValidatedInput
                label="簡短說明"
                placeholder="例如：每隻寵物"
                value={petPlan.description}
                error={petPlanErrors.description}
                maxLength={100}
                showCharCount
                disabled={!petPlan.enabled}
                onChange={(value) => {
                  setPetPlan({ ...petPlan, description: value });
                }}
                onValidate={(value) => validateAddonField('pet', 'description', value)}
              />
              <div className="space-y-2">
                <Label>詳細說明（顯示在前台「詳細內容」按鈕中）</Label>
                <RichTextEditor
                  value={petPlan.detailedDescription}
                  onChange={(value) => {
                    setPetPlan({ ...petPlan, detailedDescription: value });
                    validateAddonField('pet', 'detailed_description', value);
                  }}
                  placeholder="請輸入寵物方案的詳細說明，包含注意事項、規則等..."
                  error={petPlanErrors.detailed_description}
                />
              </div>
            </CardContent>
          </Card>

          {/* 餐食方案 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>餐食方案</span>
                <div className="flex items-center gap-2">
                  <Label htmlFor="meal-enabled" className="text-sm font-normal">啟用</Label>
                  <Switch
                    id="meal-enabled"
                    checked={mealPlan.enabled}
                    onCheckedChange={(checked) => setMealPlan({ ...mealPlan, enabled: checked })}
                    className="touch-manipulation"
                  />
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <ValidatedNumberInput
                  label="價格 (每人/每日)"
                  prefix="NT$"
                  value={mealPlan.pricePerUnit}
                  error={mealPlanErrors.price_per_unit}
                  min="0"
                  disabled={!mealPlan.enabled}
                  onChange={(value) => {
                    setMealPlan({ ...mealPlan, pricePerUnit: value });
                  }}
                  onValidate={(value) => validateAddonField('meal', 'price_per_unit', value)}
                />
                <ValidatedNumberInput
                  label="數量上限 (人)"
                  value={mealPlan.maxQuantity}
                  error={mealPlanErrors.max_quantity}
                  min="1"
                  disabled={!mealPlan.enabled}
                  onChange={(value) => {
                    setMealPlan({ ...mealPlan, maxQuantity: value });
                  }}
                  onValidate={(value) => validateAddonField('meal', 'max_quantity', value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-6">
                <ValidatedNumberInput
                  label="平日基本人數"
                  value={mealPlan.weekdayMinQuantity}
                  error={mealPlanErrors.weekday_min_quantity}
                  min="0"
                  disabled={!mealPlan.enabled}
                  onChange={(value) => {
                    setMealPlan({ ...mealPlan, weekdayMinQuantity: value });
                  }}
                  onValidate={(value) => validateAddonField('meal', 'weekday_min_quantity', value)}
                />
                <ValidatedNumberInput
                  label="假日基本人數"
                  value={mealPlan.weekendMinQuantity}
                  error={mealPlanErrors.weekend_min_quantity}
                  min="0"
                  disabled={!mealPlan.enabled}
                  onChange={(value) => {
                    setMealPlan({ ...mealPlan, weekendMinQuantity: value });
                  }}
                  onValidate={(value) => validateAddonField('meal', 'weekend_min_quantity', value)}
                />
              </div>
              <ValidatedInput
                label="簡短說明"
                placeholder="例如：每人每日"
                value={mealPlan.description}
                error={mealPlanErrors.description}
                maxLength={100}
                showCharCount
                disabled={!mealPlan.enabled}
                onChange={(value) => {
                  setMealPlan({ ...mealPlan, description: value });
                }}
                onValidate={(value) => validateAddonField('meal', 'description', value)}
              />
              <div className="space-y-2">
                <Label>詳細說明（顯示在前台「詳細內容」按鈕中）</Label>
                <RichTextEditor
                  value={mealPlan.detailedDescription}
                  onChange={(value) => {
                    setMealPlan({ ...mealPlan, detailedDescription: value });
                    validateAddonField('meal', 'detailed_description', value);
                  }}
                  placeholder="請輸入餐食方案的詳細說明，包含菜單內容、用餐時間等..."
                  error={mealPlanErrors.detailed_description}
                />
              </div>
            </CardContent>
          </Card>

          <SaveButtonContainer 
            onSave={handleSaveAddonPlans} 
            isSaving={isSaving}
            saveText="儲存變更"
          />
        </TabsContent>

        {/* 相簿管理 Tab */}
        <TabsContent value="gallery" className="space-y-6">
          <PageHeader 
            title="精選照片" 
            icon={ImageIcon}
            action={
              <Button
                onClick={() => document.getElementById('photo-upload')?.click()}
                disabled={uploadingPhoto}
                size="default"
                className="gap-2 h-11 sm:h-10 touch-manipulation"
              >
                <Upload className="h-4 w-4" />
                {uploadingPhoto 
                  ? uploadProgress.total > 0 
                    ? `上傳中 ${uploadProgress.current}/${uploadProgress.total}` 
                    : '上傳中...'
                  : '上傳照片'}
              </Button>
            }
          />
          <input
            id="photo-upload"
            type="file"
            accept="image/*"
            multiple
            onChange={handlePhotoUpload}
            className="hidden"
          />
          {uploadingPhoto && uploadProgress.total > 0 && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="py-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">正在上傳照片...</span>
                    <span className="font-medium">{uploadProgress.current}/{uploadProgress.total}</span>
                  </div>
                  <Progress value={(uploadProgress.current / uploadProgress.total) * 100} className="h-2" />
                  <p className="text-xs text-muted-foreground">
                    已完成 {Math.round((uploadProgress.current / uploadProgress.total) * 100)}%
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="pt-6 space-y-6">

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
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
                      {photos.map((photo, index) => (
                        <SortablePhotoItem
                          key={photo.id}
                          photo={photo}
                          index={index}
                          onDelete={handleDeletePhotoClick}
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
          <PageHeader title="訂房須知" icon={BookOpen} />
          {/* 入住退房時間 */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-1.5 bg-primary rounded-full" />
                <div>
                  <CardTitle className="text-xl">入住時間</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">設定入住與退房的時間</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-base font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" />
                    入住時間
                  </Label>
                  <TimePicker
                    value={bookingInfo.checkInTime}
                    error={bookingErrors.check_in_time}
                    onChange={(value) => {
                      setBookingInfo(prev => ({ ...prev, checkInTime: value }));
                      validateBookingField("check_in_time", value);
                    }}
                  />
                  <p className="text-xs text-muted-foreground">訪客可在此時間之後辦理入住</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-base font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" />
                    退房時間
                  </Label>
                  <CheckOutTimePicker
                    value={bookingInfo.checkOutTime}
                    error={bookingErrors.check_out_time}
                    onChange={(value) => {
                      setBookingInfo(prev => ({ ...prev, checkOutTime: value }));
                      validateBookingField("check_out_time", value);
                    }}
                  />
                  <p className="text-xs text-muted-foreground">訪客須在此時間之前退房</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 付款方式 */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-1.5 bg-primary rounded-full" />
                <div>
                  <CardTitle className="text-xl">付款方式</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">選擇接受的付款方式</p>
                </div>
              </div>
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
                        className="h-5 w-5 touch-manipulation"
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
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-1.5 bg-primary rounded-full" />
                <div>
                  <CardTitle className="text-xl">取消政策</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">設定訂單取消的相關規定</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label>政策說明</Label>
                <RichTextEditor
                  value={bookingInfo.cancellationPolicy}
                  onChange={(value) => setBookingInfo(prev => ({ ...prev, cancellationPolicy: value }))}
                  placeholder="例如：入住前7天免費取消，7天內取消收取50%費用"
                  error={bookingErrors.cancellation_policy}
                />
              </div>
            </CardContent>
          </Card>

          {/* 重要事項 */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-1.5 bg-primary rounded-full" />
                <div>
                  <CardTitle className="text-xl">重要事項</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">提醒訪客入住時的重要注意事項</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label>入住須知</Label>
                <RichTextEditor
                  value={bookingInfo.checkInNotice}
                  onChange={(value) => setBookingInfo(prev => ({ ...prev, checkInNotice: value }))}
                  placeholder="例如：請出示身分證件、禁止吸菸、不可攜帶寵物"
                />
              </div>
            </CardContent>
          </Card>

          {/* 寵物入住守則 */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-1.5 bg-primary rounded-full" />
                <div>
                  <CardTitle className="text-xl">寵物入住守則</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">說明寵物入住的規範與要求</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label>守則說明</Label>
                <RichTextEditor
                  value={bookingInfo.petPolicy}
                  onChange={(value) => setBookingInfo(prev => ({ ...prev, petPolicy: value }))}
                  placeholder="例如：歡迎攜帶寵物入住、寵物需加收清潔費用、請主人隨時清理寵物排泄物、寵物不可上床"
                  error={bookingErrors.pet_policy}
                />
              </div>
            </CardContent>
          </Card>

          {/* 其他注意事項 */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-1.5 bg-primary rounded-full" />
                <div>
                  <CardTitle className="text-xl">其他注意事項</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">補充其他需要告知訪客的事項</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label>注意事項說明</Label>
                <RichTextEditor
                  value={bookingInfo.otherNotes}
                  onChange={(value) => setBookingInfo(prev => ({ ...prev, otherNotes: value }))}
                  placeholder="例如：房間內禁止吸菸、晚上10點後請降低音量、使用設施請遵守安全規範、貴重物品請自行保管"
                  error={bookingErrors.other_notes}
                />
              </div>
            </CardContent>
          </Card>

          <SaveButtonContainer 
            onSave={handleSaveBookingInfo} 
            isSaving={isSaving}
            saveText="儲存變更"
          />
        </TabsContent>

        <TabsContent value="faq" className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 md:pb-6 border-b border-primary/20 mb-4 md:mb-6">
            <h2 className="text-2xl md:text-3xl font-bold flex items-center gap-2 md:gap-3">
              <HelpCircle className="h-6 w-6 md:h-7 md:w-7 text-primary" />
              常見問題
            </h2>
            <Button onClick={() => setIsDialogOpen(true)} className="w-full sm:w-auto h-11 sm:h-10 touch-manipulation">
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
                      className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4 p-4 sm:p-5 border rounded-lg bg-card"
                    >
                      <GripVertical className="hidden sm:block h-5 w-5 text-muted-foreground mt-1 cursor-move flex-shrink-0" />
                      <div className="flex-1 space-y-3 min-w-0">
                        <div className="space-y-2">
                          <h3 className="font-semibold text-base sm:text-lg leading-tight">{faq.question}</h3>
                          <p className="text-sm text-muted-foreground leading-relaxed break-words">
                            {faq.answer}
                          </p>
                        </div>
                        
                        {/* Mobile: Controls below content */}
                        <div className="flex flex-col sm:hidden gap-3 pt-2 border-t">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Label htmlFor={`publish-${faq.id}`} className="text-sm font-medium">
                                {faq.is_published ? "已發布" : "已隱藏"}
                              </Label>
                              <Switch
                                id={`publish-${faq.id}`}
                                checked={faq.is_published}
                                onCheckedChange={() => handleTogglePublishFaq(faq)}
                                className="touch-manipulation"
                              />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditFaq(faq)}
                              className="flex-1 h-11 touch-manipulation"
                            >
                              <Edit2 className="h-4 w-4 mr-2" />
                              編輯
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteFaqClick(faq.id)}
                              className="flex-1 h-11 touch-manipulation text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              刪除
                            </Button>
                          </div>
                        </div>
                      </div>
                      
                      {/* Desktop: Controls on the right */}
                      <div className="hidden sm:flex sm:flex-col sm:items-end gap-3 flex-shrink-0">
                        <div className="flex items-center gap-2">
                          <Label htmlFor={`publish-desktop-${faq.id}`} className="text-sm">
                            {faq.is_published ? "已發布" : "已隱藏"}
                          </Label>
                          <Switch
                            id={`publish-desktop-${faq.id}`}
                            checked={faq.is_published}
                            onCheckedChange={() => handleTogglePublishFaq(faq)}
                            className="touch-manipulation"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditFaq(faq)}
                            className="h-9 w-9 touch-manipulation"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost-destructive"
                            size="icon"
                            onClick={() => handleDeleteFaqClick(faq.id)}
                            className="h-9 w-9 touch-manipulation"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="location" className="space-y-6">
          <PageHeader title="交通地圖" icon={Navigation} />
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                交通地圖
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="map-address">Google Map 地址</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowMapPreview(!showMapPreview)}
                  className="h-10 sm:h-9 touch-manipulation"
                >
                  {showMapPreview ? "隱藏" : "顯示"}地圖預覽
                </Button>
                </div>
                <Input
                  id="map-address"
                  value={basicInfo.address}
                  onChange={(e) => setBasicInfo({ ...basicInfo, address: e.target.value })}
                  placeholder="請輸入完整地址，用於前台 Google Map 顯示"
                  className="h-12 text-base sm:h-10 sm:text-sm touch-manipulation"
                />
                <p className="text-xs text-muted-foreground">
                  此地址將用於前台頁面的 Google Map 嵌入顯示
                </p>
              </div>

              {showMapPreview && basicInfo.address && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">地圖預覽</Label>
                  <div className="relative w-full h-[400px] rounded-lg overflow-hidden border border-border bg-muted">
                    <iframe
                      width="100%"
                      height="100%"
                      frameBorder="0"
                      style={{ border: 0 }}
                      referrerPolicy="no-referrer-when-downgrade"
                      src={`https://maps.google.com/maps?q=${encodeURIComponent(basicInfo.address)}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
                      allowFullScreen
                      loading="lazy"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    預覽與前台顯示效果相同，請確認地圖標記位置是否正確
                  </p>
                </div>
              )}

              {showMapPreview && !basicInfo.address && (
                <div className="p-8 text-center border border-dashed border-border rounded-lg bg-muted/50">
                  <MapPin className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    請輸入地址以顯示地圖預覽
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="driving-info">自行開車</Label>
                <RichTextEditor
                  value={drivingInfo}
                  onChange={setDrivingInfo}
                  placeholder="從台北出發：國道3號 → 名間交流道 → 台16線 → 台21線 → 約3.5小時"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="public-transport-info">大眾運輸</Label>
                <RichTextEditor
                  value={publicTransportInfo}
                  onChange={setPublicTransportInfo}
                  placeholder="高鐵 + 巴士：高鐵台中站 → 轉乘南投客運 → 東埔站 → 步行約10分鐘"
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>周邊景點</Label>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleAddAttraction}
                    className="h-10 sm:h-9 touch-manipulation"
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
                              className="h-12 text-base sm:h-10 sm:text-sm touch-manipulation"
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
                              className="h-12 text-base sm:h-10 sm:text-sm touch-manipulation"
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
                              className="touch-manipulation"
                            />
                          </div>
                        </div>

                        {nearbyAttractions.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost-destructive"
                            size="icon"
                            onClick={() => handleRemoveAttraction(index)}
                            className="mt-6 h-11 w-11 sm:h-9 sm:w-9 touch-manipulation"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <SaveButtonContainer 
                onSave={handleSaveLocationInfo}
                saveText="儲存變更"
                className="w-full"
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* FAQ Dialog */}
      {isMobile ? (
        <Drawer open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DrawerContent className="max-h-[90vh]">
            <DrawerHeader>
              <DrawerTitle>
                {editingFaq ? "編輯常見問題" : "新增常見問題"}
              </DrawerTitle>
            </DrawerHeader>

            <div className="space-y-4 px-4 overflow-y-auto pb-4">
              <div className="space-y-2">
                <Label htmlFor="question">問題</Label>
                <Input
                  id="question"
                  placeholder="請輸入問題"
                  value={faqFormData.question}
                  onChange={(e) =>
                    setFaqFormData({ ...faqFormData, question: e.target.value })
                  }
                  className="h-12 text-base touch-manipulation"
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
                  className="min-h-[120px] text-base touch-manipulation"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="is_published"
                  checked={faqFormData.is_published}
                  onCheckedChange={(checked) =>
                    setFaqFormData({ ...faqFormData, is_published: checked })
                  }
                  className="touch-manipulation"
                />
                <Label htmlFor="is_published">立即發布</Label>
              </div>
            </div>

            <DrawerFooter className="pt-2">
              <Button onClick={handleSaveFaq} className="w-full h-12 touch-manipulation">
                {editingFaq ? "更新" : "新增"}
              </Button>
              <Button variant="outline" onClick={handleCloseFaqDialog} className="w-full h-12 touch-manipulation">
                取消
              </Button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : (
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
                  className="touch-manipulation"
                />
                <Label htmlFor="is_published">立即發布</Label>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleCloseFaqDialog} className="h-11 sm:h-10 touch-manipulation">
                取消
              </Button>
              <Button onClick={handleSaveFaq} className="h-11 sm:h-10 touch-manipulation">
                {editingFaq ? "更新" : "新增"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Logo 裁剪對話框 */}
      <LogoCropDialog
        open={cropDialogOpen}
        onOpenChange={setCropDialogOpen}
        imageSrc={cropImageSrc}
        onCropComplete={handleCropComplete}
        logoType={cropLogoType}
      />

      {/* OG 圖片裁剪對話框 */}
      <OgImageCropDialog
        open={ogImageCropDialogOpen}
        onOpenChange={setOgImageCropDialogOpen}
        imageSrc={ogImageCropSrc}
        onCropComplete={handleOgImageCropComplete}
      />

      {/* Logo 刪除確認對話框 */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除 Logo</AlertDialogTitle>
            <AlertDialogDescription>
              您確定要刪除{deleteLogoType === 'header' ? '頁首' : '頁尾'} Logo 嗎？此操作無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          {deleteLogoType && (
            <div className="flex justify-center py-4">
              <div className="relative w-48 h-24 border rounded overflow-hidden bg-muted">
                <img
                  src={deleteLogoType === 'header' ? basicInfo.header_logo_url : basicInfo.footer_logo_url}
                  alt={`${deleteLogoType === 'header' ? '頁首' : '頁尾'} Logo 預覽`}
                  className="w-full h-full object-contain"
                />
              </div>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmLogoDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              確認刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 特色區塊編輯對話框 */}
      <AboutFeatureForm
        open={featureFormOpen}
        onOpenChange={setFeatureFormOpen}
        feature={editingFeature}
        onSave={handleSaveFeature}
      />

      {/* FAQ 刪除確認對話框 */}
      <AlertDialog open={deleteFaqDialogOpen} onOpenChange={setDeleteFaqDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除</AlertDialogTitle>
            <AlertDialogDescription>
              確定要刪除此常見問題嗎？此操作無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteFaq}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              確認刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 照片刪除確認對話框 */}
      <AlertDialog open={deletePhotoDialogOpen} onOpenChange={setDeletePhotoDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除</AlertDialogTitle>
            <AlertDialogDescription>
              確定要刪除此照片嗎？此操作無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeletePhoto}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              確認刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 輪播圖刪除確認對話框 */}
      <AlertDialog open={deleteHeroPhotoDialogOpen} onOpenChange={setDeleteHeroPhotoDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除</AlertDialogTitle>
            <AlertDialogDescription>
              確定要刪除此輪播圖嗎？此操作無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteHeroPhoto}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              確認刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 特色區塊刪除確認對話框 */}
      <AlertDialog open={deleteFeatureDialogOpen} onOpenChange={setDeleteFeatureDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除</AlertDialogTitle>
            <AlertDialogDescription>
              確定要刪除此特色區塊嗎？此操作無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteFeature}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              確認刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* OG 圖片刪除確認對話框 */}
      <AlertDialog open={deleteOgImageDialogOpen} onOpenChange={setDeleteOgImageDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除</AlertDialogTitle>
            <AlertDialogDescription>
              確定要刪除社群分享縮圖嗎？此操作無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteOgImage}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              確認刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default WebsiteContent;
