import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, ChevronDown, ChevronRight } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface SectionConfig {
  key: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  // Custom title/subtitle support
  customTitle?: string;
  customSubtitle?: string;
  defaultTitle?: string;
  defaultSubtitle?: string;
  onTitleChange?: (title: string) => void;
  onSubtitleChange?: (subtitle: string) => void;
  /** Whether this section supports custom title editing */
  editable?: boolean;
}

interface SortableSectionItemProps {
  section: SectionConfig;
  isFirst?: boolean;
  isLast?: boolean;
}

export const SortableSectionItem = ({ section, isFirst, isLast }: SortableSectionItemProps) => {
  const [expanded, setExpanded] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.key });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 1,
  };

  const isEditable = section.editable !== false && !!section.onTitleChange;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-background rounded-lg ${
        isDragging ? 'shadow-lg ring-2 ring-primary/20' : ''
      } ${!isLast ? 'border-b border-border/30' : ''}`}
    >
      <div className="flex items-center justify-between py-3 px-2">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1.5 hover:bg-muted rounded transition-colors touch-manipulation"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          {isEditable ? (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1.5 min-w-0 hover:text-primary transition-colors"
            >
              {expanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              )}
              <div className="space-y-0.5 text-left">
                <Label htmlFor={`show-${section.key}-section`} className="text-base font-medium cursor-pointer">
                  {section.label}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {section.description}
                </p>
              </div>
            </button>
          ) : (
            <div className="space-y-0.5">
              <Label htmlFor={`show-${section.key}-section`} className="text-base font-medium cursor-pointer">
                {section.label}
              </Label>
              <p className="text-xs text-muted-foreground">
                {section.description}
              </p>
            </div>
          )}
        </div>
        <Switch
          id={`show-${section.key}-section`}
          checked={section.checked}
          onCheckedChange={section.onCheckedChange}
        />
      </div>

      {/* Expanded editing area */}
      {isEditable && expanded && (
        <div className="px-2 pb-3 pl-12 space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">主標題</Label>
              <Input
                placeholder={section.defaultTitle || section.label}
                value={section.customTitle || ''}
                onChange={(e) => section.onTitleChange?.(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">副標題</Label>
              <Input
                placeholder={section.defaultSubtitle || ''}
                value={section.customSubtitle || ''}
                onChange={(e) => section.onSubtitleChange?.(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
