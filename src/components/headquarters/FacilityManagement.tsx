import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  Plus,
  Edit,
  Trash2,
  Building2,
  Loader2,
  Utensils,
  Search,
} from "lucide-react";
import { toast } from "sonner";

interface Facility {
  id: string;
  accommodation_id: string;
  category: string;
  facility_name: string;
  is_available: boolean;
  pricing_type: string | null;
  created_at: string;
}

interface FacilityManagementProps {
  accommodations: { id: string; name: string }[];
}

const CATEGORY_OPTIONS = [
  { value: "public", label: "公共區設施服務" },
  { value: "dining", label: "餐飲設施" },
  { value: "safety", label: "安全設施" },
  { value: "entertainment", label: "休閒娛樂設施" },
  { value: "language", label: "服務語言" },
];

const PRICING_TYPE_OPTIONS = [
  { value: "included", label: "包含於房價" },
  { value: "free", label: "免費提供" },
  { value: "paid", label: "需額外付費" },
];

export function FacilityManagement({ accommodations }: FacilityManagementProps) {
  const [loading, setLoading] = useState(true);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [accommodationFilter, setAccommodationFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Dialog states
  const [showDialog, setShowDialog] = useState(false);
  const [editingFacility, setEditingFacility] = useState<Facility | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Facility | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    accommodation_id: "",
    category: "public",
    facility_name: "",
    is_available: true,
    pricing_type: "included",
  });

  useEffect(() => {
    loadFacilities();
  }, [accommodationFilter, categoryFilter]);

  const loadFacilities = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("accommodation_facilities")
        .select("*")
        .order("category")
        .order("facility_name");

      if (accommodationFilter !== "all") {
        query = query.eq("accommodation_id", accommodationFilter);
      }

      if (categoryFilter !== "all") {
        query = query.eq("category", categoryFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setFacilities(data || []);
    } catch (error) {
      console.error("Error loading facilities:", error);
      toast.error("載入設施資料失敗");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      accommodation_id: accommodationFilter !== "all" ? accommodationFilter : "",
      category: "public",
      facility_name: "",
      is_available: true,
      pricing_type: "included",
    });
  };

  const openAddDialog = () => {
    resetForm();
    setEditingFacility(null);
    setShowDialog(true);
  };

  const openEditDialog = (facility: Facility) => {
    setEditingFacility(facility);
    setFormData({
      accommodation_id: facility.accommodation_id,
      category: facility.category,
      facility_name: facility.facility_name,
      is_available: facility.is_available,
      pricing_type: facility.pricing_type || "included",
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!formData.accommodation_id) {
      toast.error("請選擇民宿");
      return;
    }

    if (!formData.facility_name.trim()) {
      toast.error("請輸入設施名稱");
      return;
    }

    setSaving(true);
    try {
      if (editingFacility) {
        // Update existing
        const { error } = await supabase
          .from("accommodation_facilities")
          .update({
            category: formData.category,
            facility_name: formData.facility_name.trim(),
            is_available: formData.is_available,
            pricing_type: formData.pricing_type,
          })
          .eq("id", editingFacility.id);

        if (error) throw error;
        toast.success("設施已更新");
      } else {
        // Create new
        const { error } = await supabase
          .from("accommodation_facilities")
          .insert({
            accommodation_id: formData.accommodation_id,
            category: formData.category,
            facility_name: formData.facility_name.trim(),
            is_available: formData.is_available,
            pricing_type: formData.pricing_type,
          });

        if (error) throw error;
        toast.success("設施已新增");
      }

      setShowDialog(false);
      setEditingFacility(null);
      await loadFacilities();
    } catch (error: any) {
      console.error("Error saving facility:", error);
      toast.error("儲存失敗", { description: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      const { error } = await supabase
        .from("accommodation_facilities")
        .delete()
        .eq("id", deleteTarget.id);

      if (error) throw error;
      toast.success("設施已刪除");
      setDeleteTarget(null);
      await loadFacilities();
    } catch (error: any) {
      console.error("Error deleting facility:", error);
      toast.error("刪除失敗", { description: error.message });
    }
  };

  const getAccommodationName = (id: string) => {
    return accommodations.find(a => a.id === id)?.name || "未知";
  };

  const getCategoryLabel = (value: string) => {
    return CATEGORY_OPTIONS.find(c => c.value === value)?.label || value;
  };

  const getPricingTypeLabel = (value: string | null) => {
    if (!value) return "-";
    return PRICING_TYPE_OPTIONS.find(p => p.value === value)?.label || value;
  };

  // Filter by search query
  const filteredFacilities = facilities.filter(f => 
    f.facility_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group by accommodation for display
  const groupedByAccommodation = filteredFacilities.reduce((acc, facility) => {
    if (!acc[facility.accommodation_id]) {
      acc[facility.accommodation_id] = [];
    }
    acc[facility.accommodation_id].push(facility);
    return acc;
  }, {} as Record<string, Facility[]>);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <Select value={accommodationFilter} onValueChange={setAccommodationFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="全部民宿" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部民宿</SelectItem>
            {accommodations.map(acc => (
              <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="全部類別" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部類別</SelectItem>
            {CATEGORY_OPTIONS.map(cat => (
              <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜尋設施名稱..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <Button onClick={openAddDialog} className="ml-auto">
          <Plus className="h-4 w-4 mr-2" />
          新增設施
        </Button>
      </div>

      {/* Facilities List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Utensils className="h-5 w-5" />
            設施管理
          </CardTitle>
          <CardDescription>
            管理各民宿的設施服務項目，共 {filteredFacilities.length} 項
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredFacilities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Utensils className="h-12 w-12 mb-4 opacity-50" />
              <p>尚無設施資料</p>
              <p className="text-sm">請點擊「新增設施」建立設施項目</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedByAccommodation).map(([accId, accFacilities]) => (
                <div key={accId} className="space-y-3">
                  <div className="flex items-center gap-2 pb-2 border-b">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold">{getAccommodationName(accId)}</span>
                    <Badge variant="outline">{accFacilities.length} 項</Badge>
                  </div>
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead>設施名稱</TableHead>
                          <TableHead>類別</TableHead>
                          <TableHead>計費方式</TableHead>
                          <TableHead>狀態</TableHead>
                          <TableHead className="text-right">操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {accFacilities.map(facility => (
                          <TableRow key={facility.id}>
                            <TableCell className="font-medium">
                              {facility.facility_name}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">
                                {getCategoryLabel(facility.category)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {getPricingTypeLabel(facility.pricing_type)}
                            </TableCell>
                            <TableCell>
                              {facility.is_available ? (
                                <Badge className="bg-primary">啟用</Badge>
                              ) : (
                                <Badge variant="outline">停用</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => openEditDialog(facility)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => setDeleteTarget(facility)}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingFacility ? "編輯設施" : "新增設施"}</DialogTitle>
            <DialogDescription>
              {editingFacility ? "修改設施資訊" : "新增設施項目到指定民宿"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>民宿 *</Label>
              <Select
                value={formData.accommodation_id}
                onValueChange={(v) => setFormData(prev => ({ ...prev, accommodation_id: v }))}
                disabled={!!editingFacility}
              >
                <SelectTrigger>
                  <SelectValue placeholder="選擇民宿" />
                </SelectTrigger>
                <SelectContent>
                  {accommodations.map(acc => (
                    <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>設施名稱 *</Label>
              <Input
                value={formData.facility_name}
                onChange={(e) => setFormData(prev => ({ ...prev, facility_name: e.target.value }))}
                placeholder="例如：免費 WiFi"
              />
            </div>

            <div className="space-y-2">
              <Label>類別</Label>
              <Select
                value={formData.category}
                onValueChange={(v) => setFormData(prev => ({ ...prev, category: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>計費方式</Label>
              <Select
                value={formData.pricing_type}
                onValueChange={(v) => setFormData(prev => ({ ...prev, pricing_type: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRICING_TYPE_OPTIONS.map(pt => (
                    <SelectItem key={pt.value} value={pt.value}>{pt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <Label>啟用狀態</Label>
              <Switch
                checked={formData.is_available}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_available: checked }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={saving}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingFacility ? "儲存變更" : "新增設施"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確定要刪除此設施？</AlertDialogTitle>
            <AlertDialogDescription>
              即將刪除「{deleteTarget?.facility_name}」，此操作無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
