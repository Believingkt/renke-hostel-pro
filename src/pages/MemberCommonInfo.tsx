import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, Loader2, Save, Mail, Phone, MapPin, UserRound, Bed, Utensils, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { isMemberPreview, mockCommonInfo } from "@/lib/memberPreviewMock";

interface CommonInfo {
  contact_email: string;
  contact_phone: string;
  address: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  preferred_bed_type: string;
  dietary_notes: string;
  special_requests: string;
}

const empty: CommonInfo = {
  contact_email: "", contact_phone: "", address: "",
  emergency_contact_name: "", emergency_contact_phone: "",
  preferred_bed_type: "", dietary_notes: "", special_requests: "",
};

const MemberCommonInfo = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [form, setForm] = useState<CommonInfo>(empty);

  useEffect(() => { load(); }, []);

  const load = async () => {
    if (isMemberPreview()) {
      setForm({ ...empty, ...mockCommonInfo });
      setLoading(false);
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data: member } = await supabase.from("platform_members").select("id, email, phone, address").eq("user_id", user.id).maybeSingle();
    if (!member) { setLoading(false); return; }
    setMemberId(member.id);

    const { data } = await (supabase as any).from("member_common_info").select("*").eq("member_id", member.id).maybeSingle();
    setForm({
      contact_email: data?.contact_email ?? member.email ?? "",
      contact_phone: data?.contact_phone ?? member.phone ?? "",
      address: data?.address ?? member.address ?? "",
      emergency_contact_name: data?.emergency_contact_name ?? "",
      emergency_contact_phone: data?.emergency_contact_phone ?? "",
      preferred_bed_type: data?.preferred_bed_type ?? "",
      dietary_notes: data?.dietary_notes ?? "",
      special_requests: data?.special_requests ?? "",
    });
    setLoading(false);
  };

  const save = async () => {
    if (isMemberPreview()) {
      toast({ title: "已儲存（預覽模式）" });
      return;
    }
    if (!memberId) return;
    setSaving(true);
    const payload: any = { member_id: memberId, ...form };
    const { error } = await (supabase as any).from("member_common_info").upsert(payload, { onConflict: "member_id" });
    setSaving(false);
    if (error) { toast({ title: "儲存失敗", description: error.message, variant: "destructive" }); return; }
    toast({ title: "已儲存常用資訊" });
  };

  const set = (k: keyof CommonInfo, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-1">
        <button onClick={() => navigate("/member/profile")} className="p-1 -ml-1 text-muted-foreground hover:text-foreground" aria-label="返回">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold flex-1">常用資訊</h1>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <Section title="聯絡資訊" hint="下次預訂會自動帶入，方便快速結帳。">
            <Field label="電子郵件" icon={Mail}>
              <Input value={form.contact_email} onChange={(e) => set("contact_email", e.target.value)} placeholder="you@example.com" type="email" />
            </Field>
            <Field label="電話號碼" icon={Phone}>
              <Input value={form.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} placeholder="+886-912-345-678" inputMode="tel" />
            </Field>
            <Field label="地址" icon={MapPin}>
              <Input value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="街道地址" />
            </Field>
          </Section>

          <Section title="緊急聯絡人" hint="入住時如發生突發狀況可協助聯繫。">
            <Field label="姓名" icon={UserRound}>
              <Input value={form.emergency_contact_name} onChange={(e) => set("emergency_contact_name", e.target.value)} placeholder="家人 / 朋友" />
            </Field>
            <Field label="電話" icon={Phone}>
              <Input value={form.emergency_contact_phone} onChange={(e) => set("emergency_contact_phone", e.target.value)} placeholder="+886-987-654-321" inputMode="tel" />
            </Field>
          </Section>

          <Section title="住宿偏好" hint="讓民宿更了解您的需求。">
            <Field label="偏好床型" icon={Bed}>
              <Input value={form.preferred_bed_type} onChange={(e) => set("preferred_bed_type", e.target.value)} placeholder="雙人床 / 兩張單人床 / 加大床" />
            </Field>
            <Field label="飲食備註" icon={Utensils}>
              <Input value={form.dietary_notes} onChange={(e) => set("dietary_notes", e.target.value)} placeholder="素食、過敏、忌口食材..." />
            </Field>
            <Field label="特別需求" icon={Sparkles}>
              <Textarea value={form.special_requests} onChange={(e) => set("special_requests", e.target.value)} placeholder="例：安靜樓層、高樓層、早到寄放行李" rows={3} />
            </Field>
          </Section>

          <Button onClick={save} disabled={saving} className="w-full bg-[hsl(24,100%,50%)] hover:bg-[hsl(24,100%,45%)] text-white">
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            儲存變更
          </Button>
        </>
      )}
    </div>
  );
};

const Section = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
  <Card className="p-4 space-y-3">
    <div>
      <div className="text-sm font-semibold">{title}</div>
      {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
    </div>
    <div className="space-y-3">{children}</div>
  </Card>
);

const Field = ({ label, icon: Icon, children }: { label: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) => (
  <div>
    <Label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
      <Icon className="h-3.5 w-3.5" /> {label}
    </Label>
    {children}
  </div>
);

export default MemberCommonInfo;
