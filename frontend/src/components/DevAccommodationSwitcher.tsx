import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2, X, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { isNativeApp } from "@/lib/appMode";

interface Accommodation {
  id: string;
  name: string;
  short_url_alias: string | null;
}

const DEV_ACC_STORAGE_KEY = "dev_selected_accommodation";

export function DevAccommodationSwitcher() {
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [currentAccId, setCurrentAccId] = useState<string | null>(null);
  const navigate = useNavigate();

  // 只在 Vite 開發模式或 Lovable 編輯器預覽顯示；原生 App(Capacitor)一律隱藏
  const isNative = isNativeApp();
  const isDevOrPreview =
    !isNative &&
    (import.meta.env.DEV || window.location.hostname.includes('lovableproject.com'));

  useEffect(() => {
    if (!isDevOrPreview) return;

    const loadAccommodations = async () => {
      const { data, error } = await supabase
        .from("accommodation_info")
        .select("id, name, short_url_alias")
        .order("name");

      if (!error && data) {
        setAccommodations(data);
      }
    };

    loadAccommodations();

    // 從 URL 或 localStorage 獲取當前選擇
    // 注意：前台使用 accId 參數，需同時檢查 accId 和 acc
    const urlParams = new URLSearchParams(window.location.search);
    const accIdParam = urlParams.get('accId') || urlParams.get('acc');
    const savedAcc = localStorage.getItem(DEV_ACC_STORAGE_KEY);
    
    setCurrentAccId(accIdParam || savedAcc || null);
  }, [isDevOrPreview]);

  if (!isDevOrPreview || accommodations.length === 0) {
    return null;
  }

  const handleSwitch = (accIdOrAlias: string) => {
    const acc = accommodations.find(a => a.id === accIdOrAlias);
    if (!acc) return;

    // 儲存選擇 - 同時更新前台和後台使用的 localStorage key
    localStorage.setItem(DEV_ACC_STORAGE_KEY, acc.short_url_alias || acc.id);
    localStorage.setItem('lastSelectedAccommodation', acc.id); // 後台 AccommodationContext 使用的正確 key

    // 更新 URL 並刷新 - 使用 accId 參數（與 Index.tsx 一致）
    const url = new URL(window.location.href);
    url.searchParams.delete('acc'); // 移除舊參數
    url.searchParams.set('accId', acc.id); // 使用 accommodation ID
    window.location.href = url.toString();
  };

  const handleGoToBackend = () => {
    navigate('/auth');
  };

  const currentAcc = accommodations.find(a => 
    a.id === currentAccId || 
    a.short_url_alias === currentAccId
  );

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 left-4 z-[9999] shadow-lg bg-violet-600 hover:bg-violet-700 text-white"
        size="sm"
      >
        <Building2 className="h-4 w-4 mr-2" />
        {currentAcc?.name || "切換民宿"}
      </Button>
    );
  }

  return (
    <div className="fixed bottom-4 left-4 z-[9999] bg-background border rounded-lg shadow-xl p-4 min-w-[280px]">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm font-medium text-violet-600">
          <Building2 className="h-4 w-4" />
          開發環境切換器
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => setIsOpen(false)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      
      <Select
        value={currentAcc?.id || ""}
        onValueChange={handleSwitch}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="選擇民宿" />
        </SelectTrigger>
        <SelectContent className="z-[10000]">
          {accommodations.map((acc) => (
            <SelectItem key={acc.id} value={acc.id}>
              {acc.name}
              {acc.short_url_alias && (
                <span className="ml-2 text-xs text-muted-foreground">
                  ({acc.short_url_alias})
                </span>
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        onClick={handleGoToBackend}
        className="w-full mt-3 bg-emerald-600 hover:bg-emerald-700 text-white"
        size="sm"
      >
        <Settings className="h-4 w-4 mr-2" />
        進入民宿後台
      </Button>

      <p className="text-xs text-muted-foreground mt-2">
        此元件僅在開發/預覽環境顯示
      </p>
    </div>
  );
}
