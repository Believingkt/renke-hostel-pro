/**
 * /trips/:tripId/edit — 行程編輯器（行動優先）
 * 拖拉排序 / 刪除 / 調整數量與時段，即時重算總時長與總價並寫回 trips.items / total_price。
 * 僅行程 owner 可編輯（RLS + 前端守衛）。
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, GripVertical, Plus, Trash2, ShoppingCart } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { normalizeLang, pickLang, tripText, type TripLang } from "@/lib/tripI18n";
import { readCart, writeCart, type CartItem } from "@/lib/tripCart";
import { toast } from "sonner";

interface TripItem {
  ref_type: "product" | "room";
  ref_id: string;
  qty?: number;
  day?: number;
  order?: number;
  start_time?: string;
}

interface ProductRow {
  id: string;
  type: string;
  name: unknown;
  description: unknown;
  price: number | null;
  duration_min: number | null;
  cover_url?: string | null;
}

interface RoomRow {
  id: string;
  name: string;
  base_price: number | null;
  accommodation_id: string;
}

const PRODUCT_TYPES = ["attraction", "ticket", "experience", "meal"];

function SortableRow({
  id,
  children,
}: {
  id: string;
  children: (handle: React.HTMLAttributes<HTMLElement>) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}
      className="rounded-xl border border-border bg-card p-3"
    >
      {children({ ...attributes, ...listeners } as React.HTMLAttributes<HTMLElement>)}
    </div>
  );
}

export default function TripEdit() {
  const { tripId } = useParams<{ tripId: string }>();
  const [params] = useSearchParams();
  const lang = normalizeLang(params.get("lang")) as TripLang;
  const t = tripText(lang);
  const navigate = useNavigate();

  const [loaded, setLoaded] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [title, setTitle] = useState("");
  const [items, setItems] = useState<TripItem[]>([]);
  const [products, setProducts] = useState<Record<string, ProductRow>>({});
  const [rooms, setRooms] = useState<Record<string, RoomRow>>({});
  const [catalog, setCatalog] = useState<ProductRow[]>([]);
  const [roomCatalog, setRoomCatalog] = useState<RoomRow[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const { data } = await supabase
        .from("trips")
        .select("id, title, items, owner_id")
        .eq("id", tripId)
        .maybeSingle();
      if (cancelled) return;
      const ownerId = (data as any)?.owner_id ?? null;
      setAllowed(!!data && !!auth?.user?.id && ownerId === auth.user.id);
      setTitle(pickLang((data as any)?.title, lang));
      const list: TripItem[] = Array.isArray((data as any)?.items) ? (data as any).items : [];
      setItems([...list].sort((a, b) => (a.day ?? 1) - (b.day ?? 1) || (a.order ?? 0) - (b.order ?? 0)));
      setLoaded(true);

      const [{ data: prods }, { data: roomRows }] = await Promise.all([
        supabase
          .from("trip_products")
          .select("id, type, name, description, price, duration_min, cover_url")
          .eq("is_active", true),
        supabase.from("room_types").select("id, name, base_price, accommodation_id").eq("is_active", true),
      ]);
      if (cancelled) return;
      const pMap: Record<string, ProductRow> = {};
      for (const p of (prods as ProductRow[]) || []) pMap[p.id] = p;
      setProducts(pMap);
      setCatalog((prods as ProductRow[]) || []);
      const rMap: Record<string, RoomRow> = {};
      for (const r of (roomRows as RoomRow[]) || []) rMap[r.id] = r;
      setRooms(rMap);
      setRoomCatalog((roomRows as RoomRow[]) || []);
    })();
    return () => {
      cancelled = true;
    };
  }, [tripId, lang]);

  const unitPrice = (item: TripItem) =>
    item.ref_type === "product"
      ? Number(products[item.ref_id]?.price || 0)
      : Number(rooms[item.ref_id]?.base_price || 0);

  const totalPrice = useMemo(
    () => items.reduce((sum, i) => sum + unitPrice(i) * (i.qty || 1), 0),
    [items, products, rooms],
  );
  const totalMinutes = useMemo(
    () =>
      items.reduce(
        (sum, i) => sum + (i.ref_type === "product" ? products[i.ref_id]?.duration_min ?? 0 : 0),
        0,
      ),
    [items, products],
  );

  const persist = async (next: TripItem[]) => {
    setItems(next);
    if (!tripId) return;
    const price = next.reduce((sum, i) => sum + unitPrice(i) * (i.qty || 1), 0);
    setSaving(true);
    const { error } = await supabase
      .from("trips")
      .update({ items: next as never, total_price: price })
      .eq("id", tripId);
    setSaving(false);
    if (error) toast.error(error.message);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = items.findIndex((_, i) => rowKey(items[i], i) === active.id);
    const to = items.findIndex((_, i) => rowKey(items[i], i) === over.id);
    if (from < 0 || to < 0) return;
    const next = arrayMove(items, from, to).map((it, idx) => ({ ...it, order: idx }));
    persist(next);
  };

  const rowKey = (item: TripItem, idx: number) => `${item.ref_type}-${item.ref_id}-${idx}`;

  const addProduct = (p: ProductRow) => {
    persist([...items, { ref_type: "product", ref_id: p.id, qty: 1, day: 1, order: items.length }]);
  };
  const addRoom = (r: RoomRow) => {
    persist([...items, { ref_type: "room", ref_id: r.id, qty: 1, day: 1, order: items.length }]);
  };

  const addAllToCart = () => {
    const cart = readCart();
    const next: CartItem[] = [...cart.items];
    for (const it of items) {
      if (it.ref_type === "product") {
        const p = products[it.ref_id];
        if (!p) continue;
        next.push({
          kind: "product",
          key: `p-${p.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          productId: p.id,
          name: pickLang(p.name, lang),
          type: p.type,
          unitPrice: Number(p.price || 0),
          qty: it.qty || 1,
          coverUrl: p.cover_url ?? null,
        });
      }
    }
    writeCart({ tripId: tripId ?? null, items: next });
    toast.success(lang === "ja" ? "カートに追加しました" : lang === "en" ? "Added to cart" : "已加入購物車");
    navigate(`/cart?lang=${lang}`);
  };

  if (!loaded) return null;

  if (!allowed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted-foreground">
          {lang === "ja" ? "この行程を編集する権限がありません" : lang === "en" ? "You cannot edit this trip" : "你沒有編輯這個行程的權限"}
        </p>
        <Link to={`/trips/${tripId}?lang=${lang}`} className="text-sm font-medium text-primary underline">
          {t.back}
        </Link>
      </div>
    );
  }

  const filteredCatalog = typeFilter === "all" ? catalog : catalog.filter((p) => p.type === typeFilter);

  return (
    <div className="min-h-screen bg-background pb-32">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <Link to={`/trips/${tripId}?lang=${lang}`} aria-label={t.back} className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-secondary">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-base font-bold text-foreground">{title}</h1>
        {saving && <span className="text-xs text-muted-foreground">…</span>}
      </header>

      <div className="mx-auto max-w-2xl px-4 py-4">
        <p className="mb-3 text-xs text-muted-foreground">
          {t.totalDuration((totalMinutes / 60).toFixed(1))}
        </p>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={items.map((it, i) => rowKey(it, i))} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {items.map((item, idx) => {
                const isRoom = item.ref_type === "room";
                const name = isRoom
                  ? rooms[item.ref_id]?.name ?? t.stayLabel
                  : pickLang(products[item.ref_id]?.name, lang);
                return (
                  <SortableRow key={rowKey(item, idx)} id={rowKey(item, idx)}>
                    {(handle) => (
                      <div className="flex items-center gap-2">
                        <button {...handle} aria-label="drag" className="cursor-grab p-1 text-muted-foreground">
                          <GripVertical className="h-4 w-4" />
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-foreground">{name}</p>
                          <div className="mt-1 flex items-center gap-2">
                            <Input
                              type="time"
                              value={item.start_time ?? ""}
                              onChange={(e) =>
                                persist(items.map((it, i) => (i === idx ? { ...it, start_time: e.target.value } : it)))
                              }
                              className="h-8 w-28 text-xs"
                            />
                            <Input
                              type="number"
                              min={1}
                              value={item.qty ?? 1}
                              onChange={(e) =>
                                persist(
                                  items.map((it, i) =>
                                    i === idx ? { ...it, qty: Math.max(1, Number(e.target.value) || 1) } : it,
                                  ),
                                )
                              }
                              className="h-8 w-16 text-xs"
                            />
                            <span className="text-xs tabular-nums text-muted-foreground">
                              NT$ {(unitPrice(item) * (item.qty || 1)).toLocaleString()}
                            </span>
                          </div>
                        </div>
                        <button
                          aria-label="delete"
                          onClick={() => persist(items.filter((_, i) => i !== idx).map((it, i) => ({ ...it, order: i })))}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </div>
                    )}
                  </SortableRow>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">{t.total}</p>
            <p className="text-lg font-bold tabular-nums text-foreground">NT$ {totalPrice.toLocaleString()}</p>
          </div>
          <div className="flex items-center gap-2">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm">
                  <Plus className="mr-1 h-4 w-4" />
                  {lang === "ja" ? "追加" : lang === "en" ? "Add" : "新增"}
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>
                    {lang === "ja" ? "スポット / チケット / 食事" : lang === "en" ? "Attractions / Tickets / Meals" : "新增景點 / 票券 / 餐飲"}
                  </SheetTitle>
                </SheetHeader>
                <div className="mt-3 flex flex-wrap gap-2">
                  {["all", ...PRODUCT_TYPES].map((tp) => (
                    <button
                      key={tp}
                      onClick={() => setTypeFilter(tp)}
                      className={`rounded-full px-3 py-1 text-xs ${typeFilter === tp ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
                    >
                      {tp}
                    </button>
                  ))}
                </div>
                <ul className="mt-3 space-y-2">
                  {filteredCatalog.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{pickLang(p.name, lang)}</p>
                        <p className="text-xs text-muted-foreground">NT$ {Number(p.price || 0).toLocaleString()}</p>
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => addProduct(p)}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                  {roomCatalog.slice(0, 30).map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-border p-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{r.name}</p>
                        <p className="text-xs text-muted-foreground">{t.stayLabel}</p>
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => addRoom(r)}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </SheetContent>
            </Sheet>
            <Button size="sm" onClick={addAllToCart}>
              <ShoppingCart className="mr-1 h-4 w-4" />
              {lang === "ja" ? "カートへ" : lang === "en" ? "To cart" : "加入購物車"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
