import { useEffect, useRef, useState } from "react";
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
import { Loader2, Save, UserRound, Camera, Trash2 } from "lucide-react";
import { isMemberPreview, mockProfile } from "@/lib/memberPreviewMock";
import { isUsableEmail, SYNTHETIC_EMAIL_RE } from "@/components/member/MissingEmailNotice";
import { resolveMemberAvatarUrl, uploadMemberAvatar } from "@/lib/memberAvatar";

const MAX_AVATAR_MB = 5;

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
  const [userId, setUserId] = useState("");
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    if (isMemberPreview()) {
      setMemberId(mockProfile.id);
      setName(mockProfile.name);
      setPhone(mockProfile.phone);
      setEmail(mockProfile.email);
      setGender(mockProfile.gender);
      setNationality(mockProfile.nationality);
      setIsSyntheticEmail(false);
      setLoading(false);
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const { data } = await supabase
      .from("platform_members")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (data) {
      setMemberId(data.id);
      setName(data.name || "");
      setPhone(data.phone || "");
      const storedEmail = data.email || user.email || "";
      const synthetic = SYNTHETIC_EMAIL_RE.test(storedEmail);
      setIsSyntheticEmail(synthetic);
      setEmail(synthetic ? "" : storedEmail);
      setGender((data as any).gender || "");
      setNationality((data as any).nationality || "");
      const storedAvatar = (data as any).avatar_url || null;
      setAvatarPath(storedAvatar);
      setAvatarPreview(await resolveMemberAvatarUrl(storedAvatar));
    }
    setLoading(false);
  };

  const handleAvatarPick = async (file?: File | null) => {
    if (!file) return;
    if (isMemberPreview()) {
      toast.info("預覽模式：頭貼不會實際儲存");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("請選擇圖片檔（JPG / PNG / WebP）");
      return;
    }
    if (file.size > MAX_AVATAR_MB * 1024 * 1024) {
      toast.error(`圖片請小於 ${MAX_AVATAR_MB} MB`);
      return;
    }
    setUploadingAvatar(true);
    try {
      const path = await uploadMemberAvatar(userId, file);
      const { error } = await supabase
        .from("platform_members")
        .update({ avatar_url: path } as any)
        .eq("id", memberId);
      if (error) throw error;
      setAvatarPath(path);
      setAvatarPreview(await resolveMemberAvatarUrl(path));
      toast.success("頭貼已更新");
    } catch (error: any) {
      toast.error(error.message || "頭貼上傳失敗");
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleAvatarRemove = async () => {
    if (isMemberPreview()) {
      toast.info("預覽模式：頭貼不會實際儲存");
      return;
    }
    setUploadingAvatar(true);
    try {
      const { error } = await supabase
        .from("platform_members")
        .update({ avatar_url: null } as any)
        .eq("id", memberId);
      if (error) throw error;
      setAvatarPath(null);
      setAvatarPreview(null);
      toast.success("已移除頭貼");
    } catch (error: any) {
      toast.error(error.message || "移除失敗");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    if (isMemberPreview()) {
      toast.info("預覽模式：資料不會實際儲存");
      return;
    }
    if (!isUsableEmail(email)) {
      toast.error("請填寫有效的 Email，才能收到訂房確認信與付款通知信");
      return;
    }
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
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="h-20 w-20 rounded-full overflow-hidden bg-gradient-to-br from-[hsl(24,100%,55%)] to-[hsl(14,90%,55%)] flex items-center justify-center ring-2 ring-white shadow-md">
              {avatarPreview ? (
                <img src={avatarPreview} alt="會員頭貼" className="h-full w-full object-cover" />
              ) : (
                <UserRound className="h-9 w-9 text-white" />
              )}
            </div>
            {uploadingAvatar && (
              <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-white" />
              </div>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploadingAvatar}
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera className="mr-2 h-4 w-4" />
                {avatarPath ? "更換頭貼" : "上傳頭貼"}
              </Button>
              {avatarPath && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={uploadingAvatar}
                  onClick={handleAvatarRemove}
                  className="text-muted-foreground"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  移除
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">支援 JPG／PNG／WebP，檔案小於 {MAX_AVATAR_MB} MB</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleAvatarPick(e.target.files?.[0])}
          />
        </div>

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
          <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder={isSyntheticEmail ? "請輸入您的 Email" : ""} />
          {isSyntheticEmail && (
            <p className="text-xs text-amber-700">
              您使用 LINE／Facebook 登入，社群帳號未提供 Email。請填寫可收信的 Email，才能收到訂房確認信與付款通知信。
            </p>
          )}
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
