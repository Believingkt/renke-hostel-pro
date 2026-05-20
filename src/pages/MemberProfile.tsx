import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";

const MemberProfile = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [isSyntheticEmail, setIsSyntheticEmail] = useState(false);
  const [gender, setGender] = useState("");
  const [nationality, setNationality] = useState("");
  const [memberId, setMemberId] = useState("");

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("platform_members")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (data) {
      setMemberId(data.id);
      setName(data.name || "");
      setPhone(data.phone || "");
      setEmail(data.email || user.email || "");
      
      setGender((data as any).gender || "");
      setNationality((data as any).nationality || "");
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("platform_members")
        .update({
          name,
          phone,
          email,
          gender: gender || null,
          nationality: nationality || null,
        } as any)
        .eq("id", memberId);
      if (error) throw error;
      toast.success("資料已更新");
    } catch (error: any) {
      toast.error(error.message || "更新失敗");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>個人資料</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>姓名 <span className="text-destructive">*</span></Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>性別 <span className="text-muted-foreground text-xs">（選填）</span></Label>
          <Select value={gender} onValueChange={setGender}>
            <SelectTrigger>
              <SelectValue placeholder="請選擇" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="male">男</SelectItem>
              <SelectItem value="female">女</SelectItem>
              <SelectItem value="other">其他</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>國籍 <span className="text-muted-foreground text-xs">（選填）</span></Label>
          <Input value={nationality} onChange={(e) => setNationality(e.target.value)} placeholder="例如：台灣" />
        </div>
        <div className="space-y-2">
          <Label>手機 <span className="text-destructive">*</span></Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0912345678" />
        </div>
        <div className="space-y-2">
          <Label>Email <span className="text-destructive">*</span></Label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
        </div>
        <Button onClick={handleSave} disabled={saving} className="bg-[hsl(24,100%,50%)] hover:bg-[hsl(24,100%,45%)] text-white">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          儲存
        </Button>
      </CardContent>
    </Card>
  );
};

export default MemberProfile;
