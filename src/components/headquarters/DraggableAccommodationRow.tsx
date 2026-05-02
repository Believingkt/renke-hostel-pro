import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { GripVertical, Pencil, Copy, Check, Power, PowerOff, Trash2, Star } from "lucide-react";

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
  onDelete: (acc: Accommodation) => void;
  isDragDisabled?: boolean;
}

export function DraggableAccommodationRow({
  accommodation,
  onEdit,
  onClone,
  onToggle,
  onDelete,
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

  const [copied, setCopied] = useState(false);

  const handleCopy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("已複製連結", { description: url });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("複製失敗");
    }
  };

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


      {/* Booking Portal Link */}
      <TableCell>
        {(() => {
          const slug = accommodation.short_url_alias || accommodation.id;
          const displayUrl = `booking.lakeze.com/${slug}`;
          const fullUrl = `https://${displayUrl}`;
          return (
            <div className="flex items-center gap-1">
              <a
                href={fullUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline text-sm"
              >
                {displayUrl}
              </a>
              <TooltipProvider delayDuration={150}>
                <Tooltip open={copied ? true : undefined}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleCopy(fullUrl)}
                      aria-label="複製連結"
                    >
                      {copied ? (
                        <Check className="h-3 w-3 text-primary" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {copied ? "已複製!" : "複製連結"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          );
        })()}
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
      <TableCell>
        <div className="flex items-center justify-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onEdit(accommodation)}
            title="編輯"
          >
            <Pencil className="h-4 w-4" />
          </Button>
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
            onClick={() => onDelete(accommodation)}
            title="刪除"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
