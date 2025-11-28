import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface PricingRulesManagerProps {
  roomTypeId: string;
  roomTypeName: string;
  accommodationId: string;
}

interface PricingRule {
  id: string;
  rule_name: string;
  day_type: 'weekday' | 'weekend' | 'holiday' | 'compensatory_day_off' | 'work_on_weekend';
  price: number | null;
  price_2_meals: number | null;
  price_3_meals: number | null;
  available_rooms: number;
  is_active: boolean;
  priority: number;
}

const dayTypeLabels = {
  weekday: '平日',
  weekend: '週末',
  holiday: '國定假日',
  compensatory_day_off: '補休',
  work_on_weekend: '補班',
};

const dayTypeColors = {
  weekday: 'bg-blue-100 text-blue-800 border-blue-200',
  weekend: 'bg-orange-100 text-orange-800 border-orange-200',
  holiday: 'bg-red-100 text-red-800 border-red-200',
  compensatory_day_off: 'bg-green-100 text-green-800 border-green-200',
  work_on_weekend: 'bg-purple-100 text-purple-800 border-purple-200',
};

export function PricingRulesManager({ roomTypeId, roomTypeName, accommodationId }: PricingRulesManagerProps) {
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<PricingRule | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    rule_name: '',
    day_type: 'weekday' as PricingRule['day_type'],
    price: '',
    price_2_meals: '',
    price_3_meals: '',
    available_rooms: '',
    is_active: true,
    priority: '0',
  });

  useEffect(() => {
    loadRules();
  }, [roomTypeId]);

  const loadRules = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('pricing_rules')
        .select('*')
        .eq('room_type_id', roomTypeId)
        .order('priority', { ascending: false })
        .order('day_type');

      if (error) throw error;
      setRules((data || []) as PricingRule[]);
    } catch (error) {
      console.error('載入價格規則失敗:', error);
      toast.error('載入價格規則失敗');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (rule?: PricingRule) => {
    if (rule) {
      setEditingRule(rule);
      setFormData({
        rule_name: rule.rule_name,
        day_type: rule.day_type,
        price: rule.price?.toString() || '',
        price_2_meals: rule.price_2_meals?.toString() || '',
        price_3_meals: rule.price_3_meals?.toString() || '',
        available_rooms: rule.available_rooms.toString(),
        is_active: rule.is_active,
        priority: rule.priority.toString(),
      });
    } else {
      setEditingRule(null);
      setFormData({
        rule_name: '',
        day_type: 'weekday',
        price: '',
        price_2_meals: '',
        price_3_meals: '',
        available_rooms: '',
        is_active: true,
        priority: '0',
      });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.rule_name || !formData.available_rooms) {
      toast.error('請填寫規則名稱和可用房數');
      return;
    }

    if (!formData.price_2_meals && !formData.price_3_meals) {
      toast.error('請至少填寫一種價格（一泊二食或一泊三食）');
      return;
    }

    try {
      setSaving(true);
      const ruleData = {
        room_type_id: roomTypeId,
        accommodation_id: accommodationId,
        rule_name: formData.rule_name,
        day_type: formData.day_type,
        price: formData.price ? parseInt(formData.price) : null,
        price_2_meals: formData.price_2_meals ? parseInt(formData.price_2_meals) : null,
        price_3_meals: formData.price_3_meals ? parseInt(formData.price_3_meals) : null,
        available_rooms: parseInt(formData.available_rooms),
        is_active: formData.is_active,
        priority: parseInt(formData.priority),
      };

      if (editingRule) {
        const { error } = await supabase
          .from('pricing_rules')
          .update(ruleData)
          .eq('id', editingRule.id);

        if (error) throw error;
        toast.success('規則已更新');
      } else {
        const { error } = await supabase
          .from('pricing_rules')
          .insert(ruleData);

        if (error) throw error;
        toast.success('規則已新增');
      }

      setDialogOpen(false);
      loadRules();
    } catch (error) {
      console.error('儲存規則失敗:', error);
      toast.error('儲存規則失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (ruleId: string) => {
    if (!confirm('確定要刪除此規則嗎？')) return;

    try {
      const { error } = await supabase
        .from('pricing_rules')
        .delete()
        .eq('id', ruleId);

      if (error) throw error;
      toast.success('規則已刪除');
      loadRules();
    } catch (error) {
      console.error('刪除規則失敗:', error);
      toast.error('刪除規則失敗');
    }
  };

  const handleToggleActive = async (rule: PricingRule) => {
    try {
      const { error } = await supabase
        .from('pricing_rules')
        .update({ is_active: !rule.is_active })
        .eq('id', rule.id);

      if (error) throw error;
      toast.success(rule.is_active ? '規則已停用' : '規則已啟用');
      loadRules();
    } catch (error) {
      console.error('更新規則狀態失敗:', error);
      toast.error('更新規則狀態失敗');
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              價格規則設定
            </CardTitle>
            <CardDescription className="mt-1">
              {roomTypeName} - 自動根據日期類型套用價格和庫存
            </CardDescription>
          </div>
          <Button onClick={() => handleOpenDialog()} className="gap-2">
            <Plus className="h-4 w-4" />
            新增規則
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : rules.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-20" />
            <p className="text-lg font-medium">尚無價格規則</p>
            <p className="text-sm mt-2">建立規則後，即可一鍵套用到日曆</p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>規則名稱</TableHead>
                  <TableHead>日期類型</TableHead>
                  <TableHead className="text-right">一泊二食</TableHead>
                  <TableHead className="text-right">一泊三食</TableHead>
                  <TableHead className="text-right">可用房數</TableHead>
                  <TableHead className="text-center">優先級</TableHead>
                  <TableHead className="text-center">狀態</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{rule.rule_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("font-medium", dayTypeColors[rule.day_type])}>
                        {dayTypeLabels[rule.day_type]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {rule.price_2_meals ? `NT$ ${rule.price_2_meals.toLocaleString('zh-TW')}` : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      {rule.price_3_meals ? `NT$ ${rule.price_3_meals.toLocaleString('zh-TW')}` : '-'}
                    </TableCell>
                    <TableCell className="text-right">{rule.available_rooms} 間</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{rule.priority}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={rule.is_active}
                        onCheckedChange={() => handleToggleActive(rule)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenDialog(rule)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(rule.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingRule ? '編輯規則' : '新增規則'}</DialogTitle>
              <DialogDescription>
                設定此規則的價格和庫存，套用規則時將自動填入對應日期
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <Label htmlFor="rule_name">規則名稱 *</Label>
                  <Input
                    id="rule_name"
                    value={formData.rule_name}
                    onChange={(e) => setFormData({ ...formData, rule_name: e.target.value })}
                    placeholder="例如：平日優惠價"
                  />
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <Label htmlFor="day_type">日期類型 *</Label>
                  <Select
                    value={formData.day_type}
                    onValueChange={(value) => setFormData({ ...formData, day_type: value as PricingRule['day_type'] })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(dayTypeLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <Label htmlFor="price_2_meals">一泊二食價格</Label>
                  <Input
                    id="price_2_meals"
                    type="number"
                    value={formData.price_2_meals}
                    onChange={(e) => setFormData({ ...formData, price_2_meals: e.target.value })}
                    placeholder="0"
                  />
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <Label htmlFor="price_3_meals">一泊三食價格</Label>
                  <Input
                    id="price_3_meals"
                    type="number"
                    value={formData.price_3_meals}
                    onChange={(e) => setFormData({ ...formData, price_3_meals: e.target.value })}
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <Label htmlFor="available_rooms">可用房數 *</Label>
                  <Input
                    id="available_rooms"
                    type="number"
                    value={formData.available_rooms}
                    onChange={(e) => setFormData({ ...formData, available_rooms: e.target.value })}
                    placeholder="0"
                  />
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <Label htmlFor="priority">優先級</Label>
                  <Input
                    id="priority"
                    type="number"
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    placeholder="0"
                  />
                  <p className="text-xs text-muted-foreground mt-1">數字越大優先級越高</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <Label htmlFor="is_active">啟用此規則</Label>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? '儲存中...' : '儲存'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
