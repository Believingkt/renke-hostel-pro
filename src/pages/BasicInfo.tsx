import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Edit, MapPin, ExternalLink, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useSubdomain } from "@/hooks/use-subdomain";

const BasicInfo = () => {
  const { toast } = useToast();
  const { accommodationId } = useSubdomain();
  const [loading, setLoading] = useState(false);
  const [basicInfo, setBasicInfo] = useState({
    name: "",
    description: "",
    address: "",
    check_in_notice: ""
  });

  useEffect(() => {
    if (accommodationId) {
      loadBasicInfo();
    }
  }, [accommodationId]);

  const loadBasicInfo = async () => {
    try {
      const { data, error } = await supabase
        .from("accommodation_info")
        .select("name, description, address, check_in_notice")
        .eq("id", accommodationId)
        .single();

      if (error) throw error;
      if (data) {
        setBasicInfo(data);
      }
    } catch (error) {
      console.error("Error loading basic info:", error);
      toast({
        title: "載入失敗",
        description: "無法載入住宿基本資訊",
        variant: "destructive",
      });
    }
  };

  const handleSaveBasicInfo = async () => {
    if (!accommodationId) return;
    
    setLoading(true);
    try {
      const { error } = await supabase
        .from("accommodation_info")
        .update({
          name: basicInfo.name,
          description: basicInfo.description,
          address: basicInfo.address,
          check_in_notice: basicInfo.check_in_notice
        })
        .eq("id", accommodationId);

      if (error) throw error;

      toast({
        title: "儲存成功",
        description: "住宿基本資訊已更新",
      });
    } catch (error) {
      console.error("Error saving basic info:", error);
      toast({
        title: "儲存失敗",
        description: "無法更新住宿基本資訊",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">基本資料</h1>

      {/* 住宿基本資訊 */}
      <Card>
        <CardHeader>
          <CardTitle>住宿基本資訊</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>住宿名稱</Label>
            <Input 
              value={basicInfo.name}
              onChange={(e) => setBasicInfo({ ...basicInfo, name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>住宿描述</Label>
            <Textarea 
              value={basicInfo.description}
              onChange={(e) => setBasicInfo({ ...basicInfo, description: e.target.value })}
              rows={4}
              placeholder="請輸入住宿描述..."
            />
          </div>
          <div className="space-y-2">
            <Label>地址</Label>
            <Input 
              value={basicInfo.address}
              onChange={(e) => setBasicInfo({ ...basicInfo, address: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>入住須知</Label>
            <Textarea 
              value={basicInfo.check_in_notice}
              onChange={(e) => setBasicInfo({ ...basicInfo, check_in_notice: e.target.value })}
              rows={3}
              placeholder="請輸入入住須知..."
            />
          </div>
          <Button onClick={handleSaveBasicInfo} disabled={loading}>
            {loading ? "儲存中..." : "儲存變更"}
          </Button>
        </CardContent>
      </Card>

      {/* 聯絡人及帳務管理 */}
      <Card>
            <CardHeader>
              <CardTitle>聯絡人及帳務管理</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>聯絡人姓名</Label>
                  <Input />
                </div>
                <div className="space-y-2">
                  <Label>電子郵件</Label>
                  <Input type="email" />
                </div>
                <div className="space-y-2">
                  <Label>聯絡電話</Label>
                  <Input />
                </div>
                <div className="space-y-2">
                  <Label>傳真號碼</Label>
                  <Input />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>統一編號</Label>
                  <Input />
                </div>
              </div>

              {/* 代收房費匯款帳號 */}
              <div className="space-y-4 pt-4 border-t">
                <h3 className="font-semibold">代收房費匯款帳號</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>銀行/分行名稱</Label>
                    <Input />
                  </div>
                  <div className="space-y-2">
                    <Label>帳戶名稱</Label>
                    <Input />
                  </div>
                  <div className="space-y-2">
                    <Label>銀行帳號</Label>
                    <Input />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>帳戶類別</Label>
                  <Input />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 訂金設定 */}
          <Card>
            <CardHeader>
              <CardTitle>訂金設定</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-2">
                  <Label>使用訂金</Label>
                  <RadioGroup defaultValue="yes" className="flex gap-4">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="yes" id="deposit-yes" />
                      <Label htmlFor="deposit-yes">是</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="no" id="deposit-no" />
                      <Label htmlFor="no">否 (全額付款)</Label>
                    </div>
                  </RadioGroup>
                </div>
                <div className="space-y-2">
                  <Label>訂金比例</Label>
                  <div className="flex gap-2">
                    <Input type="number" className="flex-1" />
                    <div className="w-16 h-10 flex items-center justify-center bg-muted rounded-md">
                      <span className="text-sm">%</span>
                    </div>
                  </div>
                </div>
              </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BasicInfo;
