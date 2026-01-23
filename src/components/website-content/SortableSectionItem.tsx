import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface SectionConfig {
  key: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}

interface SortableSectionItemProps {
  section: SectionConfig;
  isFirst?: boolean;
  isLast?: boolean;
}

export const SortableSectionItem = ({ section, isFirst, isLast }: SortableSectionItemProps) => {
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between py-3 px-2 bg-background rounded-lg ${
        isDragging ? 'shadow-lg ring-2 ring-primary/20' : ''
      } ${!isLast ? 'border-b border-border/30' : ''}`}
    >
      <div className="flex items-center gap-3">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1.5 hover:bg-muted rounded transition-colors touch-manipulation"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="space-y-0.5">
          <Label htmlFor={`show-${section.key}-section`} className="text-base font-medium cursor-pointer">
            {section.label}
          </Label>
          <p className="text-xs text-muted-foreground">
            {section.description}
          </p>
        </div>
      </div>
      <Switch
        id={`show-${section.key}-section`}
        checked={section.checked}
        onCheckedChange={section.onCheckedChange}
      />
    </div>
  );
};
