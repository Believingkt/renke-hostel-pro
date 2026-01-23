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
import { LayoutGrid } from "lucide-react";

// Section key to label mapping
const SECTION_LABELS: Record<string, { label: string; description: string }> = {
  about: { label: '關於我們區塊', description: '控制首頁是否顯示關於我們區塊' },
  rooms: { label: '房型介紹區塊', description: '控制首頁是否顯示房型介紹區塊' },
  facilities: { label: '設施服務區塊', description: '控制首頁是否顯示設施服務區塊' },
  gallery: { label: '精選照片區塊', description: '控制首頁是否顯示精選照片區塊' },
  reviews: { label: '旅客評價區塊', description: '控制首頁是否顯示旅客評價區塊' },
  faq: { label: '常見問題區塊', description: '控制首頁是否顯示常見問題區塊' },
  location: { label: '地點交通區塊', description: '控制首頁是否顯示地點交通區塊' },
  booking_info: { label: '訂房須知區塊', description: '控制首頁是否顯示訂房須知區塊' },
};

interface HomepageSectionsBlockProps {
  sectionsOrder: string[];
  showAboutSection: boolean;
  showRoomsSection: boolean;
  showFacilitiesSection: boolean;
  showGallerySection: boolean;
  showReviewsSection: boolean;
  showFaqSection: boolean;
  showLocationSection: boolean;
  showBookingInfoSection: boolean;
  onSectionsOrderChange: (newOrder: string[]) => void;
  onShowAboutSectionChange: (value: boolean) => void;
  onShowRoomsSectionChange: (value: boolean) => void;
  onShowFacilitiesSectionChange: (value: boolean) => void;
  onShowGallerySectionChange: (value: boolean) => void;
  onShowReviewsSectionChange: (value: boolean) => void;
  onShowFaqSectionChange: (value: boolean) => void;
  onShowLocationSectionChange: (value: boolean) => void;
  onShowBookingInfoSectionChange: (value: boolean) => void;
}

export const HomepageSectionsBlock = ({
  sectionsOrder,
  showAboutSection,
  showRoomsSection,
  showFacilitiesSection,
  showGallerySection,
  showReviewsSection,
  showFaqSection,
  showLocationSection,
  showBookingInfoSection,
  onSectionsOrderChange,
  onShowAboutSectionChange,
  onShowRoomsSectionChange,
  onShowFacilitiesSectionChange,
  onShowGallerySectionChange,
  onShowReviewsSectionChange,
  onShowFaqSectionChange,
  onShowLocationSectionChange,
  onShowBookingInfoSectionChange,
}: HomepageSectionsBlockProps) => {
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

  const handleSectionDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = sectionsOrder.indexOf(active.id as string);
      const newIndex = sectionsOrder.indexOf(over.id as string);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(sectionsOrder, oldIndex, newIndex);
        onSectionsOrderChange(newOrder);
      }
    }
  };

  const getSectionConfig = (key: string) => {
    const config = SECTION_LABELS[key];
    if (!config) return null;

    const visibilityMap: Record<string, { checked: boolean; onChange: (v: boolean) => void }> = {
      about: { checked: showAboutSection, onChange: onShowAboutSectionChange },
      rooms: { checked: showRoomsSection, onChange: onShowRoomsSectionChange },
      facilities: { checked: showFacilitiesSection, onChange: onShowFacilitiesSectionChange },
      gallery: { checked: showGallerySection, onChange: onShowGallerySectionChange },
      reviews: { checked: showReviewsSection, onChange: onShowReviewsSectionChange },
      faq: { checked: showFaqSection, onChange: onShowFaqSectionChange },
      location: { checked: showLocationSection, onChange: onShowLocationSectionChange },
      booking_info: { checked: showBookingInfoSection, onChange: onShowBookingInfoSectionChange },
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
          <div>
            <CardTitle>首頁區塊顯示</CardTitle>
            <CardDescription>
              設定首頁各區塊的顯示與否及排列順序
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
                items={sectionsOrder}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-1">
                  {sectionsOrder.map((key, index) => {
                    const config = getSectionConfig(key);
                    if (!config) return null;
                    return (
                      <SortableSectionItem
                        key={key}
                        section={config}
                        isFirst={index === 0}
                        isLast={index === sectionsOrder.length - 1}
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
