import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";

export default function KolReferralJoin() {
  const { code } = useParams<{ code: string }>();
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [inviter, setInviter] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: "", ig_handle: "", contact: "" });

  useEffect(() => {
    (async () => {
      if (!code) return;
      const { data, error } = await supabase.functions.invoke("kol-referral-join", {
        body: { invite_code: code, action: "lookup" },
      });
      if (error || (data as any)?.error) {
        setInvalid(true);
      } else {
        setInviter((data as any).inviter_name ?? null);
        if ((data as any).status === "joined") setDone(true);
      }
      setLoading(false);
    })();
  }, [code]);

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error("請填寫姓名／暱稱");
      return;
    }
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("kol-referral-join", {
      body: { invite_code: code, action: "signup", ...form },
    });
    setSubmitting(false);
    if (error || (data as any)?.error) {
      const e = (data as any)?.error;
      toast.error(e === "already_joined" ? "此邀請連結已被使用" : "送出失敗，請稍後再試");
      return;
    }
    setDone(true);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-primary/10 via-background to-background px-5 py-10">
      <Card className="w-full max-w-md">
        {invalid ? (
          <CardContent className="py-12 text-center text-muted-foreground">邀請連結無效或已停用。</CardContent>
        ) : done ? (
          <CardContent className="space-y-3 py-12 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
            <p className="font-semibold text-foreground">已收到你的資料</p>
            <p className="text-sm text-muted-foreground">
              總部審核通過後會與你聯繫並開通專屬折扣碼與分潤儀表板。
            </p>
          </CardContent>
        ) : (
          <>
            <CardHeader>
              <CardTitle className="text-xl">創作者合作邀請</CardTitle>
              <p className="text-sm text-muted-foreground">
                {inviter ? `由 ${inviter} 邀請你加入` : "歡迎加入創作者計畫"}，填寫以下資料即可申請。
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="kj-name">姓名／暱稱</Label>
                <Input
                  id="kj-name"
                  value={form.name}
                  maxLength={100}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="kj-ig">Instagram 帳號</Label>
                <Input
                  id="kj-ig"
                  placeholder="@yourhandle"
                  value={form.ig_handle}
                  maxLength={100}
                  onChange={(e) => setForm((f) => ({ ...f, ig_handle: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="kj-contact">聯絡方式（手機／Email／LINE ID）</Label>
                <Input
                  id="kj-contact"
                  value={form.contact}
                  maxLength={200}
                  onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
                />
              </div>
              <Button className="w-full" onClick={submit} disabled={submitting}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                送出申請
              </Button>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
