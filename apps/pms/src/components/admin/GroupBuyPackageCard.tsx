import { useState, type ReactNode } from "react";
import { Card, CardContent } from "@lakeze/shared/components/ui/card";
import { Button } from "@lakeze/shared/components/ui/button";
import { Badge } from "@lakeze/shared/components/ui/badge";
import { Input } from "@lakeze/shared/components/ui/input";
import { Label } from "@lakeze/shared/components/ui/label";
import { Textarea } from "@lakeze/shared/components/ui/textarea";
import { Switch } from "@lakeze/shared/components/ui/switch";
import { Checkbox } from "@lakeze/shared/components/ui/checkbox";
import { ChevronDown, CopyPlus, Trash2 } from "lucide-react";
import GroupBuyPackagePricingFields from "@/components/groupbuy/GroupBuyPackagePricingFields";
import GroupBuyExcludedDatesField from "@/components/groupbuy/GroupBuyExcludedDatesField";
import MultiImageUploadField from "@/components/admin/MultiImageUploadField";
import GroupBuyPackageChildRulesSection from "@/components/admin/GroupBuyPackageChildRulesSection";


export interface PackageCardRow {
  id: string;
  room_type_id: string | null;
  room_type_ids: string[] | null;
  display_name: string;
  description: string | null;
  short_summary: string | null;
  image_url: string | null;
  image_urls: string[] | null;
  group_buy_price: number;
  weekday_price: number | null;
  peak_price: number | null;
  holiday_price: number | null;
  disabled_date_types: ("weekday" | "peak" | "holiday")[] | null;
  excluded_dates: string[] | null;
  original_price: number | null;
  max_quantity: number | null;
  max_guests: number | null;
  /** 方案售價已包含的入住人數；null＝沿用最多入住人數 */
  included_guest_count: number | null;
  /** 團購頁是否顯示「入住人數」選擇器 */
  show_guest_selector: boolean | null;
  /** 團購頁是否顯示「入住房型」固定文字 */
  show_room_type_display: boolean | null;
  /** 「入住房型」固定顯示文字 */
  room_type_display_text: string | null;
  /** 方案層兒童分齡規則（PER PACKAGE，正式 SoT） */
  child_age_rules: unknown | null;
  is_active: boolean;
}

interface Props {
  pkg: PackageCardRow;
  roomTypes: { id: string; name: string }[];
  accommodationId: string;
  stayStart: string | null;
  stayEnd: string | null;
  onPatch: (patch: Partial<PackageCardRow>) => void;
  onSave: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  /** 方案尚未設定兒童規則時的 COPY ONCE 來源（活動層或民宿規則） */
  fallbackChildRules?: unknown;
  /** 新建立／正在編輯的方案可預設展開；其餘預設收合 */
  defaultExpanded?: boolean;
}

const twd = (n: number | null | undefined) => `NT$${Math.round(Number(n) || 0).toLocaleString("en-US")}`;

/** 收合區塊：僅切換顯示，不 unmount 內容，避免未儲存的表單狀態被重置 */
function Section({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="rounded-lg border">
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium"
        onClick={() => setOpen((v) => !v)}
      >
        {title}
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <div className={open ? "grid gap-3 border-t p-3 md:grid-cols-2" : "hidden"}>{children}</div>
    </div>
  );
}

export function GroupBuyPackageCard({
  pkg: p,
  roomTypes,
  accommodationId,
  stayStart,
  stayEnd,
  onPatch,
  onSave,
  onDuplicate,
  onDelete,
  fallbackChildRules,
  defaultExpanded = false,
}: Props) {
  /** 整張方案卡收合：僅隱藏（非 unmount），未儲存的編輯狀態完整保留 */
  const [expanded, setExpanded] = useState(defaultExpanded);
  const disabled = p.disabled_date_types ?? [];
  const priceText = (label: string, off: boolean, value: number | null) =>
    `${label} ${off ? "不適用" : twd(value ?? p.group_buy_price)}`;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        {/* 摘要列（永遠顯示） */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium">{p.display_name || "未命名方案"}</span>
              <Badge variant={p.is_active ? "default" : "secondary"}>{p.is_active ? "上架中" : "已下架"}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {priceText("平日", disabled.includes("weekday"), p.weekday_price)}・
              {priceText("旺日", disabled.includes("peak"), p.peak_price)}・
              {priceText("假日", disabled.includes("holiday"), p.holiday_price)}
            </p>
            <p className="text-xs text-muted-foreground">
              最多入住 {p.max_guests ? `${p.max_guests} 人` : "依房型設定"}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" size="sm" onClick={onDelete}>
              <Trash2 className="mr-1 h-4 w-4" /> 刪除
            </Button>
            <Button variant="outline" size="sm" onClick={onDuplicate}>
              <CopyPlus className="mr-1 h-4 w-4" /> 複製
            </Button>
            <Button size="sm" onClick={onSave}>
              儲存
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={expanded}
              aria-label={expanded ? "收合方案" : "展開方案"}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "收合" : "展開"}
              <ChevronDown className={`ml-1 h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
            </Button>
          </div>
        </div>

        {/* 展開後的完整編輯區：以 hidden 切換，避免 unmount 重置表單 */}
        <div className={expanded ? "space-y-3" : "hidden"}>
        {/* 1. 基本設定 */}
        <Section title="1. 基本設定" defaultOpen>
          <div className="md:col-span-2">
            <Label>方案名稱</Label>
            <Input
              className="mt-1"
              value={p.display_name}
              onChange={(e) => onPatch({ display_name: e.target.value })}
            />
          </div>
          <div>
            <Label>對應房型（可複選，庫存依據）</Label>
            <div className="mt-1 max-h-36 space-y-2 overflow-y-auto rounded-md border border-input p-2">
              {roomTypes.length === 0 && <p className="text-sm text-muted-foreground">此館別尚未建立房型</p>}
              {roomTypes.map((rt) => {
                const selected = (p.room_type_ids ?? []).includes(rt.id);
                return (
                  <label key={rt.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={selected}
                      onCheckedChange={(v) => {
                        const cur = p.room_type_ids ?? [];
                        const next = v === true ? [...cur, rt.id] : cur.filter((id) => id !== rt.id);
                        onPatch({ room_type_ids: next, room_type_id: next[0] ?? null });
                      }}
                    />
                    <span>{rt.name}</span>
                  </label>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              勾選多個房型時，系統會依「分配優先順序」逐一比對真實庫存，指派第一個有空房的房型。
            </p>
          </div>
          <div>
            {(p.room_type_ids ?? []).length > 1 && (
              <div className="rounded-md border border-input p-2">
                <p className="mb-1 text-xs font-medium">分配優先順序（由上而下）</p>
                <div className="space-y-1">
                  {(p.room_type_ids ?? []).map((rtId, order) => {
                    const move = (delta: number) => {
                      const cur = [...(p.room_type_ids ?? [])];
                      const to = order + delta;
                      if (to < 0 || to >= cur.length) return;
                      [cur[order], cur[to]] = [cur[to], cur[order]];
                      onPatch({ room_type_ids: cur, room_type_id: cur[0] ?? null });
                    };
                    return (
                      <div key={rtId} className="flex items-center gap-2 text-sm">
                        <span className="w-5 text-muted-foreground tabular-nums">{order + 1}.</span>
                        <span className="flex-1 truncate">{roomTypes.find((rt) => rt.id === rtId)?.name ?? rtId}</span>
                        <Button type="button" size="sm" variant="ghost" className="h-7 px-2" disabled={order === 0} onClick={() => move(-1)}>
                          ↑
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          disabled={order === (p.room_type_ids ?? []).length - 1}
                          onClick={() => move(1)}
                        >
                          ↓
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <div>
            <Label>單筆可下訂最多棟數（可留空）</Label>
            <Input
              type="number"
              value={p.max_quantity ?? ""}
              onChange={(e) => onPatch({ max_quantity: e.target.value === "" ? null : Number(e.target.value) })}
            />
            <p className="mt-1 text-xs text-muted-foreground">限制單筆訂單最多可下訂的包棟數量。</p>

          </div>
          <div>
            <Label>最多入住人數（可留空）</Label>
            <Input
              type="number"
              min={1}
              value={p.max_guests ?? ""}
              onChange={(e) => onPatch({ max_guests: e.target.value === "" ? null : Number(e.target.value) })}
            />
            <p className="mt-1 text-xs text-muted-foreground">留空則依房型原本人數上限。</p>
          </div>
          <div>
            <Label>方案售價已包含人數（可留空）</Label>
            <Input
              type="number"
              min={1}
              value={p.included_guest_count ?? ""}
              onChange={(e) =>
                onPatch({ included_guest_count: e.target.value === "" ? null : Number(e.target.value) })
              }
            />
            <p className="mt-1 text-xs text-muted-foreground">
              售價已包含的人頭數。此人數內的兒童／幼兒不再另收加價，超出才依兒童分齡規則計價。留空則沿用「最多入住人數」。
            </p>
          </div>
          <div className="flex items-center gap-2 md:col-span-2">
            <Switch
              checked={p.show_guest_selector !== false}
              onCheckedChange={(v) => onPatch({ show_guest_selector: v })}
            />
            <span className="text-sm">團購頁顯示「入住人數」選擇器（關閉＝團購頁不顯示入住人數）</span>
          </div>
          <div className="flex items-center gap-2 md:col-span-2">
            <Switch
              checked={p.show_room_type_display === true}
              onCheckedChange={(v) => onPatch({ show_room_type_display: v })}
            />
            <span className="text-sm">團購頁顯示「入住房型」（固定文字，客人不可修改）</span>
          </div>
          {p.show_room_type_display === true && (
            <div className="md:col-span-2">
              <Label>入住房型（固定顯示文字）</Label>
              <Textarea
                rows={2}
                value={p.room_type_display_text ?? ""}
                onChange={(e) => onPatch({ room_type_display_text: e.target.value })}
                placeholder="例如：雙人房 2 間＋四人房 2 間"
              />
              {!String(p.room_type_display_text ?? "").trim() && (
                <p className="mt-1 text-xs text-destructive">請填寫入住房型內容。</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                純顯示文字，不影響庫存、計價與系統自動指派的房型。
              </p>
            </div>
          )}
          <div className="flex items-center gap-2 md:col-span-2">
            <Switch checked={p.is_active} onCheckedChange={(v) => onPatch({ is_active: v })} />
            <span className="text-sm">上架販售</span>
          </div>
        </Section>

        {/* 1.5 兒童分齡規則（方案層） */}
        <Section title="兒童分齡規則（本方案）">
          <GroupBuyPackageChildRulesSection
            value={p.child_age_rules}
            fallbackRaw={fallbackChildRules}
            onChange={(rules) => onPatch({ child_age_rules: rules })}
          />
        </Section>

        {/* 2. 價格與適用日期 */}
        <Section title="2. 價格與適用日期">
          <GroupBuyPackagePricingFields
            value={{
              group_buy_price: p.group_buy_price,
              weekday_price: p.weekday_price,
              peak_price: p.peak_price,
              holiday_price: p.holiday_price,
              original_price: p.original_price,
              disabled_date_types: disabled,
            }}
            onChange={(patch) => onPatch(patch as Partial<PackageCardRow>)}
          />
          <GroupBuyExcludedDatesField
            value={p.excluded_dates ?? []}
            min={stayStart}
            max={stayEnd}
            onChange={(dates) => onPatch({ excluded_dates: dates })}
          />
        </Section>

        {/* 3. 圖片與方案內容 */}
        <Section title="3. 圖片與方案內容">
          <div className="md:col-span-2">
            <Label>方案圖片（可多張，第一張為主圖）</Label>
            <p className="mb-1.5 text-xs text-muted-foreground">
              建議尺寸 1200×900（4:3）以上，橫式拍攝、主體置中；第一張會作為方案卡大圖。
            </p>
            <MultiImageUploadField
              value={p.image_urls?.length ? p.image_urls : p.image_url ? [p.image_url] : []}
              onChange={(urls) => onPatch({ image_urls: urls, image_url: urls[0] ?? null })}
              pathPrefix={`${accommodationId}/group-buy/package`}
              aspect="aspect-[4/3]"
            />
          </div>
          <div className="md:col-span-2">
            <Label>方案短摘要（團購頁方案卡第二行，建議 30 字內）</Label>
            <Input
              value={p.short_summary ?? ""}
              placeholder="例：2 大 2 小・含早餐・可帶寵物"
              onChange={(e) => onPatch({ short_summary: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <Label>方案說明</Label>
            <Textarea rows={3} value={p.description ?? ""} onChange={(e) => onPatch({ description: e.target.value })} />
          </div>
        </Section>
        </div>
      </CardContent>
    </Card>
  );
}

export default GroupBuyPackageCard;
