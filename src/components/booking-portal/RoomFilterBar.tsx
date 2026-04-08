import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  ArrowUpDown,
  Users,
  Building2,
  MapPin,
  SlidersHorizontal,
  X,
  DollarSign,
} from "lucide-react";
import type { RoomTypeResult } from "./RoomTypeCard";

export type SortOption = "default" | "price_asc" | "price_desc" | "capacity_asc" | "capacity_desc";

export interface RoomFilters {
  sortBy: SortOption;
  minCapacity: number;
  maxPrice: number;
  selectedAccommodation: string; // "all" or accommodation id
  selectedRegion: string; // "all" or region name
}

interface RoomFilterBarProps {
  filters: RoomFilters;
  onFiltersChange: (filters: RoomFilters) => void;
  roomTypes: RoomTypeResult[];
  accommodations: { id: string; name: string; region_1: string | null }[];
}

const RoomFilterBar = ({
  filters,
  onFiltersChange,
  roomTypes,
  accommodations,
}: RoomFilterBarProps) => {
  // Derive available options from data
  const maxPriceInData = useMemo(() => {
    const prices = roomTypes.map((rt) => rt.date_price ?? rt.base_price);
    return prices.length > 0 ? Math.max(...prices) : 10000;
  }, [roomTypes]);

  const capacityOptions = useMemo(() => {
    const caps = new Set(roomTypes.map((rt) => rt.capacity));
    return Array.from(caps).sort((a, b) => a - b);
  }, [roomTypes]);

  const regions = useMemo(() => {
    const set = new Set<string>();
    accommodations.forEach((a) => {
      if (a.region_1) set.add(a.region_1);
    });
    return Array.from(set).sort();
  }, [accommodations]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.sortBy !== "default") count++;
    if (filters.minCapacity > 0) count++;
    if (filters.maxPrice > 0 && filters.maxPrice < maxPriceInData) count++;
    if (filters.selectedAccommodation !== "all") count++;
    if (filters.selectedRegion !== "all") count++;
    return count;
  }, [filters, maxPriceInData]);

  const update = (partial: Partial<RoomFilters>) => {
    onFiltersChange({ ...filters, ...partial });
  };

  const resetAll = () => {
    onFiltersChange({
      sortBy: "default",
      minCapacity: 0,
      maxPrice: 0,
      selectedAccommodation: "all",
      selectedRegion: "all",
    });
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Sort */}
      <Select
        value={filters.sortBy}
        onValueChange={(v) => update({ sortBy: v as SortOption })}
      >
        <SelectTrigger className="w-auto h-8 text-xs gap-1.5 rounded-full border-border px-3">
          <ArrowUpDown className="h-3.5 w-3.5" />
          <SelectValue placeholder="排序" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="default">預設排序</SelectItem>
          <SelectItem value="price_asc">價格低到高</SelectItem>
          <SelectItem value="price_desc">價格高到低</SelectItem>
          <SelectItem value="capacity_asc">人數少到多</SelectItem>
          <SelectItem value="capacity_desc">人數多到少</SelectItem>
        </SelectContent>
      </Select>

      {/* Region */}
      {regions.length > 1 && (
        <Select
          value={filters.selectedRegion}
          onValueChange={(v) => update({ selectedRegion: v })}
        >
          <SelectTrigger className="w-auto h-8 text-xs gap-1.5 rounded-full border-border px-3">
            <MapPin className="h-3.5 w-3.5" />
            <SelectValue placeholder="地區" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部地區</SelectItem>
            {regions.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Accommodation */}
      {accommodations.length > 1 && (
        <Select
          value={filters.selectedAccommodation}
          onValueChange={(v) => update({ selectedAccommodation: v })}
        >
          <SelectTrigger className="w-auto h-8 text-xs gap-1.5 rounded-full border-border px-3 max-w-[160px]">
            <Building2 className="h-3.5 w-3.5 shrink-0" />
            <SelectValue placeholder="民宿" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部民宿</SelectItem>
            {accommodations.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Capacity */}
      <Select
        value={filters.minCapacity === 0 ? "all" : String(filters.minCapacity)}
        onValueChange={(v) =>
          update({ minCapacity: v === "all" ? 0 : Number(v) })
        }
      >
        <SelectTrigger className="w-auto h-8 text-xs gap-1.5 rounded-full border-border px-3">
          <Users className="h-3.5 w-3.5" />
          <SelectValue placeholder="人數" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">不限人數</SelectItem>
          {capacityOptions.map((c) => (
            <SelectItem key={c} value={String(c)}>
              {c} 人以上
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Price range */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5 rounded-full border-border px-3"
          >
            <DollarSign className="h-3.5 w-3.5" />
            {filters.maxPrice > 0 && filters.maxPrice < maxPriceInData
              ? `≤ NT$${filters.maxPrice.toLocaleString()}`
              : "價格範圍"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-4" align="start">
          <p className="text-xs font-medium text-muted-foreground mb-3">
            每晚最高價格
          </p>
          <Slider
            min={0}
            max={maxPriceInData}
            step={Math.max(100, Math.round(maxPriceInData / 50) * 100)}
            value={[filters.maxPrice || maxPriceInData]}
            onValueChange={([v]) =>
              update({ maxPrice: v >= maxPriceInData ? 0 : v })
            }
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-2">
            <span>NT$ 0</span>
            <span className="font-medium text-foreground">
              {filters.maxPrice > 0 && filters.maxPrice < maxPriceInData
                ? `NT$ ${filters.maxPrice.toLocaleString()}`
                : "不限"}
            </span>
            <span>NT$ {maxPriceInData.toLocaleString()}</span>
          </div>
        </PopoverContent>
      </Popover>

      {/* Active filter count & reset */}
      {activeFilterCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs gap-1 rounded-full text-muted-foreground hover:text-foreground px-2"
          onClick={resetAll}
        >
          <X className="h-3.5 w-3.5" />
          清除篩選
          <Badge
            variant="secondary"
            className="ml-0.5 text-[10px] px-1.5 py-0 h-4"
          >
            {activeFilterCount}
          </Badge>
        </Button>
      )}
    </div>
  );
};

export default RoomFilterBar;
