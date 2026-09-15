import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, CreditCard, Loader2, Plus, Star, Trash2, Pencil, AlertCircle, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { isMemberPreview, mockCards } from "@/lib/memberPreviewMock";

interface SavedCard {
  id: string;
  card_holder: string;
  last_four: string;
  brand: string | null;
  expiry_month: number;
  expiry_year: number;
  is_default: boolean;
  nickname: string | null;
}

const emptyForm = {
  card_holder: "",
  card_number: "",
  expiry: "",
  brand: "",
  nickname: "",
  is_default: false,
};

/** Luhn checksum. */
function luhnValid(pan: string): boolean {
  const s = pan.replace(/\D/g, "");
  if (s.length < 13 || s.length > 19) return false;
  let sum = 0, alt = false;
  for (let i = s.length - 1; i >= 0; i--) {
    let n = parseInt(s[i], 10);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n; alt = !alt;
  }
  return sum % 10 === 0;
}

function detectBrand(pan: string): string {
  const s = pan.replace(/\s+/g, "");
  if (/^4/.test(s)) return "VISA";
  if (/^(5[1-5]|2[2-7])/.test(s)) return "MASTER";
  if (/^3[47]/.test(s)) return "AMEX";
  if (/^35/.test(s)) return "JCB";
  return "";
}

function formatCardNumber(v: string, brand: string): string {
  const digits = v.replace(/\D/g, "").slice(0, brand === "AMEX" ? 15 : 19);
  if (brand === "AMEX") {
    return digits.replace(/^(\d{0,4})(\d{0,6})(\d{0,5}).*$/, (_, a, b, c) =>
      [a, b, c].filter(Boolean).join(" ")
    );
  }
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

function formatExpiry(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 4);
  if (d.length < 3) return d;
  return `${d.slice(0, 2)}/${d.slice(2)}`;
}

interface FieldErrors {
  card_holder?: string;
  card_number?: string;
  expiry?: string;
}

const MemberCards = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SavedCard | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    if (isMemberPreview()) { setCards(mockCards as any); setLoading(false); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data: member } = await supabase.from("platform_members").select("id").eq("user_id", user.id).maybeSingle();
    if (!member) { setLoading(false); return; }
    setMemberId(member.id);
    const { data } = await (supabase as any)
      .from("member_saved_cards").select("*").eq("member_id", member.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });
    setCards(data || []);
    setLoading(false);
  };

  const openAdd = () => {
    setEditing(null); setForm({ ...emptyForm }); setErrors({}); setTouched({}); setDialogOpen(true);
  };
  const openEdit = (c: SavedCard) => {
    setEditing(c);
    setForm({
      card_holder: c.card_holder,
      card_number: `•••• •••• •••• ${c.last_four}`,
      expiry: `${String(c.expiry_month).padStart(2, "0")}/${String(c.expiry_year).slice(-2)}`,
      brand: c.brand || "",
      nickname: c.nickname || "",
      is_default: c.is_default,
    });
    setErrors({}); setTouched({}); setDialogOpen(true);
  };

  const brand = useMemo(
    () => (editing ? editing.brand || "" : detectBrand(form.card_number)),
    [form.card_number, editing]
  );

  const validate = (partial = false): FieldErrors => {
    const e: FieldErrors = {};
    if (!form.card_holder.trim()) e.card_holder = "請輸入持卡人姓名";
    else if (form.card_holder.trim().length < 2) e.card_holder = "姓名太短";
    else if (!/^[A-Za-z\u4e00-\u9fa5 ]+$/.test(form.card_holder.trim())) e.card_holder = "僅可輸入中英文";

    if (!editing) {
      const digits = form.card_number.replace(/\D/g, "");
      if (!digits) e.card_number = "請輸入卡號";
      else if (digits.length < 13) e.card_number = "卡號長度不足";
      else if (!luhnValid(digits)) e.card_number = "卡號格式錯誤";
    }

    const ed = form.expiry.replace(/\D/g, "");
    if (ed.length !== 4) e.expiry = "請輸入 MM/YY";
    else {
      const mm = parseInt(ed.slice(0, 2), 10);
      const yy = parseInt(ed.slice(2), 10);
      if (mm < 1 || mm > 12) e.expiry = "月份需在 01–12";
      else {
        const now = new Date();
        const y = 2000 + yy;
        const endOfMonth = new Date(y, mm, 0, 23, 59, 59);
        if (endOfMonth < now) e.expiry = "此卡已到期";
      }
    }
    if (partial) {
      // Only surface errors on touched fields
      const filtered: FieldErrors = {};
      (Object.keys(e) as (keyof FieldErrors)[]).forEach((k) => { if (touched[k]) filtered[k] = e[k]; });
      return filtered;
    }
    return e;
  };

  useEffect(() => { setErrors(validate(true)); /* eslint-disable-next-line */ }, [form, touched]);

  const setField = (k: keyof typeof emptyForm, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const markTouched = (k: string) => setTouched((t) => ({ ...t, [k]: true }));

  const save = async () => {
    setTouched({ card_holder: true, card_number: true, expiry: true });
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      toast({ title: "請修正表單錯誤", variant: "destructive" });
      return;
    }
    const ed = form.expiry.replace(/\D/g, "");
    const em = parseInt(ed.slice(0, 2), 10);
    const ey = 2000 + parseInt(ed.slice(2), 10);
    const detected = brand || null;
    setSaving(true);

    if (isMemberPreview()) {
      if (editing) {
        setCards((prev) => prev.map((x) => x.id === editing.id
          ? { ...editing, card_holder: form.card_holder, expiry_month: em, expiry_year: ey, brand: detected, nickname: form.nickname || null, is_default: form.is_default }
          : (form.is_default ? { ...x, is_default: false } : x)));
      } else {
        const last_four = form.card_number.replace(/\D/g, "").slice(-4);
        const nu: SavedCard = { id: `mock-${Date.now()}`, card_holder: form.card_holder, last_four, brand: detected, expiry_month: em, expiry_year: ey, is_default: form.is_default, nickname: form.nickname || null };
        setCards((prev) => form.is_default ? [nu, ...prev.map((x) => ({ ...x, is_default: false }))] : [nu, ...prev]);
      }
      setDialogOpen(false); setSaving(false);
      toast({ title: editing ? "已更新卡片" : "已新增卡片" });
      return;
    }

    if (!memberId) { setSaving(false); return; }

    if (editing) {
      const { error } = await (supabase as any).from("member_saved_cards").update({
        card_holder: form.card_holder, expiry_month: em, expiry_year: ey,
        brand: detected, nickname: form.nickname || null, is_default: form.is_default,
      }).eq("id", editing.id);
      if (error) { toast({ title: "更新失敗", description: error.message, variant: "destructive" }); setSaving(false); return; }
    } else {
      const last_four = form.card_number.replace(/\D/g, "").slice(-4);
      const { error } = await (supabase as any).from("member_saved_cards").insert({
        member_id: memberId, card_holder: form.card_holder, last_four,
        brand: detected, expiry_month: em, expiry_year: ey,
        nickname: form.nickname || null, is_default: form.is_default,
      });
      if (error) { toast({ title: "新增失敗", description: error.message, variant: "destructive" }); setSaving(false); return; }
    }
    setDialogOpen(false); setSaving(false);
    toast({ title: editing ? "已更新卡片" : "已新增卡片" });
    load();
  };

  const doDelete = async () => {
    if (!deleteId) return;
    if (isMemberPreview()) setCards((prev) => prev.filter((x) => x.id !== deleteId));
    else {
      const { error } = await (supabase as any).from("member_saved_cards").delete().eq("id", deleteId);
      if (error) { toast({ title: "刪除失敗", description: error.message, variant: "destructive" }); return; }
      setCards((prev) => prev.filter((x) => x.id !== deleteId));
    }
    setDeleteId(null);
    toast({ title: "已刪除卡片" });
  };

  const setDefault = async (c: SavedCard) => {
    if (c.is_default) return;
    if (isMemberPreview()) { setCards((prev) => prev.map((x) => ({ ...x, is_default: x.id === c.id }))); return; }
    const { error } = await (supabase as any).from("member_saved_cards").update({ is_default: true }).eq("id", c.id);
    if (error) { toast({ title: "設定失敗", description: error.message, variant: "destructive" }); return; }
    load();
  };

  const errBorder = "border-red-400 focus-visible:ring-red-400/40";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-1">
        <button onClick={() => navigate("/member/profile")} className="p-1 -ml-1 text-muted-foreground hover:text-foreground" aria-label="返回">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold flex-1">卡片管理</h1>
      </div>

      <Card className="p-3 bg-gradient-to-br from-orange-50 to-white border-orange-100 text-xs text-muted-foreground flex gap-2">
        <ShieldCheck className="h-4 w-4 text-[hsl(24,100%,50%)] shrink-0 mt-0.5" />
        <span>為安全起見，我們僅保存卡片<strong>後 4 碼</strong>與到期日；完整卡號與 CVV 不會存放在系統中。</span>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="space-y-2">
            {cards.map((c) => (
              <Card key={c.id} className="p-4 relative overflow-hidden">
                {c.is_default && (
                  <div className="absolute top-2 right-2 flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-[hsl(24,100%,50%)]/10 text-[hsl(24,100%,50%)] font-medium">
                    <Star className="h-3 w-3 fill-current" /> 預設
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <div className="h-10 w-14 rounded-md bg-gradient-to-br from-[hsl(24,100%,52%)] to-[hsl(14,90%,55%)] flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                    {c.brand || "CARD"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-mono tracking-wider">•••• •••• •••• {c.last_four}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {c.card_holder} · {String(c.expiry_month).padStart(2, "0")}/{String(c.expiry_year).slice(-2)}
                    </div>
                    {c.nickname && <div className="text-[11px] text-muted-foreground mt-0.5">{c.nickname}</div>}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                  {!c.is_default && (
                    <Button size="sm" variant="ghost" onClick={() => setDefault(c)} className="text-xs h-8">
                      <Star className="h-3.5 w-3.5 mr-1" /> 設為預設
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => openEdit(c)} className="text-xs h-8">
                    <Pencil className="h-3.5 w-3.5 mr-1" /> 編輯
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleteId(c.id)} className="text-xs h-8 text-red-500 hover:text-red-600 hover:bg-red-50">
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> 刪除
                  </Button>
                </div>
              </Card>
            ))}
            {cards.length === 0 && (
              <Card className="p-10 text-center">
                <CreditCard className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                <div className="text-sm text-muted-foreground">尚未新增任何卡片</div>
              </Card>
            )}
          </div>

          <Button onClick={openAdd} className="w-full bg-[hsl(24,100%,50%)] hover:bg-[hsl(24,100%,45%)] text-white">
            <Plus className="h-4 w-4 mr-1" /> 新增卡片
          </Button>
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "編輯卡片" : "新增卡片"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>持卡人姓名</Label>
              <Input
                value={form.card_holder}
                onChange={(e) => setField("card_holder", e.target.value.toUpperCase())}
                onBlur={() => markTouched("card_holder")}
                placeholder="WANG XIAOMING"
                className={errors.card_holder ? errBorder : ""}
                autoComplete="cc-name"
              />
              {errors.card_holder && (
                <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.card_holder}</p>
              )}
            </div>
            <div>
              <Label>卡號{editing && <span className="text-xs text-muted-foreground ml-2">（僅可修改其他欄位）</span>}</Label>
              <div className="relative">
                <Input
                  value={form.card_number}
                  onChange={(e) => setField("card_number", editing ? form.card_number : formatCardNumber(e.target.value, detectBrand(e.target.value)))}
                  onBlur={() => markTouched("card_number")}
                  placeholder="1234 5678 9012 3456"
                  disabled={!!editing}
                  inputMode="numeric"
                  autoComplete="cc-number"
                  className={`font-mono tracking-wider ${errors.card_number ? errBorder : ""} ${brand ? "pr-16" : ""}`}
                />
                {brand && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold px-2 py-0.5 rounded bg-muted text-muted-foreground">
                    {brand}
                  </span>
                )}
              </div>
              {errors.card_number ? (
                <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.card_number}</p>
              ) : !editing && (
                <p className="text-[11px] text-muted-foreground mt-1">送出後僅保留後 4 碼，完整卡號不會存進系統。</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>到期日</Label>
                <Input
                  value={form.expiry}
                  onChange={(e) => setField("expiry", formatExpiry(e.target.value))}
                  onBlur={() => markTouched("expiry")}
                  placeholder="MM/YY"
                  inputMode="numeric"
                  maxLength={5}
                  autoComplete="cc-exp"
                  className={errors.expiry ? errBorder : ""}
                />
                {errors.expiry && (
                  <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.expiry}</p>
                )}
              </div>
              <div>
                <Label>備註名稱（選填）</Label>
                <Input value={form.nickname} onChange={(e) => setField("nickname", e.target.value)} placeholder="例：主要信用卡" maxLength={20} />
              </div>
            </div>
            <div className="flex items-center justify-between pt-2">
              <Label>設為預設卡片</Label>
              <Switch checked={form.is_default} onCheckedChange={(v) => setField("is_default", v)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={save} disabled={saving} className="bg-[hsl(24,100%,50%)] hover:bg-[hsl(24,100%,45%)] text-white">
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              儲存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除卡片？</AlertDialogTitle>
            <AlertDialogDescription>刪除後將無法恢復，需重新新增。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="bg-red-500 hover:bg-red-600">確認刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default MemberCards;
