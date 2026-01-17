import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GripVertical, Pencil, Copy, Globe, Link2, Power, PowerOff, ExternalLink } from "lucide-react";
import { THEME_COLORS } from "@/constants/themes";
import { AccommodationHoverCard } from "./AccommodationHoverCard";
import { toast } from "sonner";

interface Accommodation {
  id: string;
  name: string;
  type: string | null;
  registration_number: string | null;
  country: string | null;
  region_1: string | null;
  region_2: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  description: string | null;
  short_url_alias: string | null;
  custom_domain: string | null;
  theme_preset: string | null;
  header_logo_url: string | null;
  footer_logo_url: string | null;
  is_active: boolean;
  created_at: string;
}

interface DraggableAccommodationRowProps {
  accommodation: Accommodation;
  onEdit: (acc: Accommodation) => void;
  onClone: (acc: Accommodation) => void;
  onToggle: (acc: Accommodation) => void;
  onDnsSettings: (acc: Accommodation) => void;
  onCustomDomain: (acc: Accommodation) => void;
  isDragDisabled?: boolean;
}

export function DraggableAccommodationRow({
  accommodation,
  onEdit,
  onClone,
  onToggle,
  onDnsSettings,
  onCustomDomain,
  isDragDisabled = false,
}: DraggableAccommodationRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: accommodation.id,
    disabled: isDragDisabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const theme = THEME_COLORS[accommodation.theme_preset || "default"] || THEME_COLORS.default;

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={`
        ${!accommodation.is_active ? "opacity-60" : ""}
        ${isDragging ? "opacity-50 bg-muted/50 z-50 shadow-lg" : ""}
      `}
    >
      {/* Drag handle */}
      <TableCell className="w-10 px-2">
        {!isDragDisabled && (
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-muted touch-none"
            title="拖曳排序"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </TableCell>

      {/* Name */}
      <TableCell className="font-medium">
        <AccommodationHoverCard accommodation={accommodation}>
          <span className="cursor-pointer hover:text-primary hover:underline underline-offset-2 transition-colors">
            {accommodation.name}
          </span>
        </AccommodationHoverCard>
      </TableCell>

      {/* Theme */}
      <TableCell className="w-24">
        <div className="flex items-center gap-2">
          <div
            className="w-5 h-5 rounded-full border-2 border-background shadow-sm"
            style={{ backgroundColor: theme.primary }}
            title={theme.label}
          />
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {theme.label}
          </span>
        </div>
      </TableCell>

      {/* Custom Domain */}
      <TableCell>
        {accommodation.custom_domain ? (
          <div className="flex items-center gap-1">
            <a
              href={`https://${accommodation.custom_domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline text-sm"
            >
              {accommodation.custom_domain}
            </a>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => {
                navigator.clipboard.writeText(`https://${accommodation.custom_domain}`);
                toast.success("已複製連結");
              }}
              title="複製連結"
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground hover:text-primary"
            onClick={() => onCustomDomain(accommodation)}
          >
            <Link2 className="h-3 w-3 mr-1" />
            設定網域
          </Button>
        )}
      </TableCell>

      {/* Status */}
      <TableCell>
        <Badge variant={accommodation.is_active ? "default" : "secondary"}>
          {accommodation.is_active ? "營運中" : "已停用"}
        </Badge>
      </TableCell>

      {/* Created date */}
      <TableCell>
        {new Date(accommodation.created_at).toLocaleDateString("zh-TW")}
      </TableCell>

      {/* Actions */}
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onEdit(accommodation)}
            title="編輯"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          {accommodation.custom_domain && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onCustomDomain(accommodation)}
              title="自訂網域設定"
            >
              <Link2 className="h-4 w-4 text-primary" />
            </Button>
          )}
          {accommodation.short_url_alias && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDnsSettings(accommodation)}
              title="子網域 DNS 設定"
            >
              <Globe className="h-4 w-4 text-blue-600" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onClone(accommodation)}
            title="複製"
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onToggle(accommodation)}
            title={accommodation.is_active ? "停用" : "啟用"}
          >
            {accommodation.is_active ? (
              <PowerOff className="h-4 w-4 text-destructive" />
            ) : (
              <Power className="h-4 w-4 text-green-600" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            asChild
            title="前往後台"
          >
            <a
              href={`/admin?accommodation=${accommodation.id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
