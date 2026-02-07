import { useState, useCallback, useRef, useEffect, useMemo } from "react";
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
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SortableSectionItem } from './SortableSectionItem';
import { LayoutGrid, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { invalidateAccommodationCache } from "@/hooks/use-accommodation-cache";

// Section key to label mapping (built-in sections only)
const SECTION_LABELS: Record<string, { label: string; description: string }> = {
  about: { label: '關於我們', description: '控制首頁是否顯示關於我們區塊' },
  rooms: { label: '房型介紹', description: '控制首頁是否顯示房型介紹區塊' },
  facilities: { label: '設施服務', description: '控制首頁是否顯示設施服務區塊' },
  gallery: { label: '精選照片', description: '控制首頁是否顯示精選照片區塊' },
  reviews: { label: '旅客評價', description: '控制首頁是否顯示旅客評價區塊' },
  faq: { label: '常見問題', description: '控制首頁是否顯示常見問題區塊' },
  location: { label: '地點交通', description: '控制首頁是否顯示地點交通區塊' },
  booking_info: { label: '訂房須知', description: '控制首頁是否顯示訂房須知區塊' },
};

interface CustomSection {
  id: string;
  title: string | null;
  is_enabled: boolean;
}

interface HomepageSectionsBlockProps {
  accommodationId: string | null;
  sectionsOrder: string[];
  showAboutSection: boolean;
  showRoomsSection: boolean;
  showFacilitiesSection: boolean;
  showGallerySection: boolean;
  showReviewsSection: boolean;
  showFaqSection: boolean;
  showLocationSection: boolean;
  showBookingInfoSection: boolean;
  customSections?: CustomSection[];
  onSectionsOrderChange: (newOrder: string[]) => void;
  onShowAboutSectionChange: (value: boolean) => void;
  onShowRoomsSectionChange: (value: boolean) => void;
  onShowFacilitiesSectionChange: (value: boolean) => void;
  onShowGallerySectionChange: (value: boolean) => void;
  onShowReviewsSectionChange: (value: boolean) => void;
  onShowFaqSectionChange: (value: boolean) => void;
  onShowLocationSectionChange: (value: boolean) => void;
  onShowBookingInfoSectionChange: (value: boolean) => void;
  onCustomSectionToggle?: (id: string, enabled: boolean) => void;
}

// Helper to check if a key is a custom section key
const isCustomSectionKey = (key: string) => key.startsWith('custom_');
const getCustomSectionId = (key: string) => key.replace('custom_', '');

export const HomepageSectionsBlock = ({
  accommodationId,
  sectionsOrder,
  showAboutSection,
  showRoomsSection,
  showFacilitiesSection,
  showGallerySection,
  showReviewsSection,
  showFaqSection,
  showLocationSection,
  showBookingInfoSection,
  customSections = [],
  onSectionsOrderChange,
  onShowAboutSectionChange,
  onShowRoomsSectionChange,
  onShowFacilitiesSectionChange,
  onShowGallerySectionChange,
  onShowReviewsSectionChange,
  onShowFaqSectionChange,
  onShowLocationSectionChange,
  onShowBookingInfoSectionChange,
  onCustomSectionToggle,
}: HomepageSectionsBlockProps) => {
  const [isSaving, setIsSaving] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Create a map of custom sections for quick lookup
  const customSectionsMap = useMemo(() => {
    const map = new Map<string, CustomSection>();
    customSections.forEach(s => map.set(s.id, s));
    return map;
  }, [customSections]);

  // Merge sectionsOrder with custom sections that might not be in the order yet
  const mergedSectionsOrder = useMemo(() => {
    const result = [...sectionsOrder];
    
    // Remove old 'custom_images' key if present
    const customImagesIndex = result.indexOf('custom_images');
    if (customImagesIndex !== -1) {
      result.splice(customImagesIndex, 1);
    }
    
    // Add any custom sections that are not in the order yet
    customSections.forEach(section => {
      const key = `custom_${section.id}`;
      if (!result.includes(key)) {
        result.push(key);
      }
    });
    
    // Remove custom section keys for deleted sections
    return result.filter(key => {
      if (isCustomSectionKey(key)) {
        const id = getCustomSectionId(key);
        return customSectionsMap.has(id);
      }
      return true;
    });
  }, [sectionsOrder, customSections, customSectionsMap]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Auto-save function
  const autoSave = useCallback(async (updates: Record<string, any>) => {
    if (!accommodationId) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("accommodation_info")
        .update(updates)
        .eq("id", accommodationId);

      if (error) throw error;

      // Invalidate cache to ensure frontend gets updated data
      invalidateAccommodationCache(accommodationId);
    } catch (error) {
      console.error('Auto-save failed:', error);
      toast.error('自動儲存失敗');
    } finally {
      setIsSaving(false);
    }
  }, [accommodationId]);

  // Debounced save for order changes
  const debouncedSaveOrder = useCallback((newOrder: string[]) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      autoSave({ homepage_sections_order: newOrder });
    }, 500);
  }, [autoSave]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const handleSectionDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = mergedSectionsOrder.indexOf(active.id as string);
      const newIndex = mergedSectionsOrder.indexOf(over.id as string);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(mergedSectionsOrder, oldIndex, newIndex);
        onSectionsOrderChange(newOrder);
        debouncedSaveOrder(newOrder);
      }
    }
  };

  // Handler wrappers that auto-save
  const createToggleHandler = (
    fieldName: string,
    onChange: (value: boolean) => void
  ) => {
    return (value: boolean) => {
      onChange(value);
      autoSave({ [fieldName]: value });
    };
  };

  // Handler for custom section toggle
  const handleCustomSectionToggle = useCallback(async (sectionId: string, enabled: boolean) => {
    if (!accommodationId) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("custom_sections")
        .update({ is_enabled: enabled })
        .eq("id", sectionId);

      if (error) throw error;

      // Notify parent of the change
      onCustomSectionToggle?.(sectionId, enabled);
      
      // Invalidate cache
      invalidateAccommodationCache(accommodationId);
    } catch (error) {
      console.error('Toggle custom section failed:', error);
      toast.error('更新失敗');
    } finally {
      setIsSaving(false);
    }
  }, [accommodationId, onCustomSectionToggle]);

  const getSectionConfig = (key: string) => {
    // Check if it's a custom section
    if (isCustomSectionKey(key)) {
      const id = getCustomSectionId(key);
      const section = customSectionsMap.get(id);
      if (!section) return null;
      
      return {
        key,
        label: section.title || '自訂區塊',
        description: '自訂圖片區塊',
        checked: section.is_enabled,
        onCheckedChange: (value: boolean) => handleCustomSectionToggle(id, value),
      };
    }

    // Built-in section
    const config = SECTION_LABELS[key];
    if (!config) return null;

    const visibilityMap: Record<string, { checked: boolean; onChange: (v: boolean) => void }> = {
      about: { checked: showAboutSection, onChange: createToggleHandler('show_about_section', onShowAboutSectionChange) },
      rooms: { checked: showRoomsSection, onChange: createToggleHandler('show_rooms_section', onShowRoomsSectionChange) },
      facilities: { checked: showFacilitiesSection, onChange: createToggleHandler('show_facilities_section', onShowFacilitiesSectionChange) },
      gallery: { checked: showGallerySection, onChange: createToggleHandler('show_gallery_section', onShowGallerySectionChange) },
      reviews: { checked: showReviewsSection, onChange: createToggleHandler('show_reviews_section', onShowReviewsSectionChange) },
      faq: { checked: showFaqSection, onChange: createToggleHandler('show_faq_section', onShowFaqSectionChange) },
      location: { checked: showLocationSection, onChange: createToggleHandler('show_location_section', onShowLocationSectionChange) },
      booking_info: { checked: showBookingInfoSection, onChange: createToggleHandler('show_booking_info_section', onShowBookingInfoSectionChange) },
    };

    const visibility = visibilityMap[key];
    if (!visibility) return null;

    return {
      key,
      label: config.label,
      description: config.description,
      checked: visibility.checked,
      onCheckedChange: visibility.onChange,
    };
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <LayoutGrid className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2">
              首頁區塊顯示
              {isSaving && (
                <span className="flex items-center gap-1 text-sm font-normal text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  儲存中...
                </span>
              )}
            </CardTitle>
            <CardDescription>
              設定首頁各區塊的顯示與否及排列順序（自動儲存）
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              開關控制區塊顯示，拖曳調整顯示順序
            </p>
          </div>
          
          <div className="p-4 rounded-lg bg-muted/30 border">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleSectionDragEnd}
            >
              <SortableContext
                items={mergedSectionsOrder}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-1">
                  {mergedSectionsOrder.map((key, index) => {
                    const config = getSectionConfig(key);
                    if (!config) return null;
                    return (
                      <SortableSectionItem
                        key={key}
                        section={config}
                        isFirst={index === 0}
                        isLast={index === mergedSectionsOrder.length - 1}
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
