import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
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
  Loader2,
  Utensils,
  Search,
} from "lucide-react";
import { toast } from "sonner";

interface Facility {
  id: string;
  accommodation_id: string | null;
  category: string;
  facility_name: string;
  is_available: boolean;
  pricing_type: string | null;
  created_at: string;
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

export interface FacilityManagementRef {
  openAddDialog: () => void;
}

export const FacilityManagement = forwardRef<FacilityManagementRef, object>((_, ref) => {
  const [loading, setLoading] = useState(true);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [accommodations, setAccommodations] = useState<Record<string, string>>({});
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [scopeFilter, setScopeFilter] = useState<"shared" | "per_property" | "all">("shared");
  const [searchQuery, setSearchQuery] = useState("");

  // Dialog states
  const [showDialog, setShowDialog] = useState(false);
  const [editingFacility, setEditingFacility] = useState<Facility | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Facility | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    category: "public",
    facility_name: "",
    is_available: true,
    pricing_type: "included",
  });

  useEffect(() => {
    loadFacilities();
  }, [categoryFilter, scopeFilter]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("accommodation_info").select("id,name");
      const map: Record<string, string> = {};
      (data || []).forEach((a: any) => { map[a.id] = a.name; });
      setAccommodations(map);
    })();
  }, []);

  const loadFacilities = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("accommodation_facilities")
        .select("*")
        .order("category")
        .order("facility_name");

      if (categoryFilter !== "all") {
        query = query.eq("category", categoryFilter);
      }
      if (scopeFilter === "shared") {
        query = query.is("accommodation_id", null);
      } else if (scopeFilter === "per_property") {
        query = query.not("accommodation_id", "is", null);
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

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    openAddDialog,
  }));

  const openEditDialog = (facility: Facility) => {
    setEditingFacility(facility);
    setFormData({
      category: facility.category,
      facility_name: facility.facility_name,
      is_available: facility.is_available,
      pricing_type: facility.pricing_type || "included",
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    const trimmedName = formData.facility_name.trim();
    if (!trimmedName) {
      toast.error("請輸入設施名稱");
      return;
    }

    setSaving(true);
    try {
      // 重複檢查：共用層級（accommodation_id IS NULL）下，同 (facility_name, category) 不可重複
      const { data: dup, error: dupErr } = await supabase
        .from("accommodation_facilities")
        .select("id, facility_name, category")
        .is("accommodation_id", null)
        .eq("facility_name", trimmedName)
        .eq("category", formData.category)
        .maybeSingle();
      if (dupErr) throw dupErr;
      if (dup && (!editingFacility || dup.id !== editingFacility.id)) {
        toast.error("已有同名設施", {
          description: `「${getCategoryLabel(formData.category)} / ${trimmedName}」已存在於共用設施清單`,
        });
        setSaving(false);
        return;
      }

      if (editingFacility) {
        // Update existing
        const { error } = await supabase
          .from("accommodation_facilities")
          .update({
            category: formData.category,
            facility_name: trimmedName,
            is_available: formData.is_available,
            pricing_type: formData.pricing_type,
          })
          .eq("id", editingFacility.id);

        if (error) throw error;
        toast.success("設施已更新");
      } else {
        // Create new - 共用設施不需要 accommodation_id
        const { error } = await supabase
          .from("accommodation_facilities")
          .insert({
            accommodation_id: null, // 共用設施
            category: formData.category,
            facility_name: trimmedName,
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
      // DB 唯一索引擋下的兜底訊息
      if (error?.code === "23505") {
        toast.error("設施名稱重複", { description: "同類別下已有相同名稱的設施" });
      } else {
        toast.error("儲存失敗", { description: error.message });
      }
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

  // Group by category for display
  const groupedByCategory = filteredFacilities.reduce((acc, facility) => {
    if (!acc[facility.category]) {
      acc[facility.category] = [];
    }
    acc[facility.category].push(facility);
    return acc;
  }, {} as Record<string, Facility[]>);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <Select value={scopeFilter} onValueChange={(v) => setScopeFilter(v as any)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="shared">共用設施</SelectItem>
            <SelectItem value="per_property">各民宿設施</SelectItem>
            <SelectItem value="all">全部（共用＋民宿）</SelectItem>
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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="搜尋設施名稱..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="!pl-10"
          />
        </div>
      </div>

      {/* Facilities List */}
      <Card>
        <CardContent className="pt-6">
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
              {Object.entries(groupedByCategory).map(([category, categoryFacilities]) => (
                <div key={category} className="space-y-3">
                  <div className="flex items-center gap-2 pb-2 border-b">
                    <Badge variant="secondary">{getCategoryLabel(category)}</Badge>
                    <span className="text-sm text-muted-foreground">{categoryFacilities.length} 項</span>
                  </div>
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead>設施名稱</TableHead>
                          <TableHead>計費方式</TableHead>
                          <TableHead>狀態</TableHead>
                          <TableHead className="text-center">操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {categoryFacilities.map(facility => (
                          <TableRow key={facility.id}>
                            <TableCell className="font-medium">
                              {facility.facility_name}
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
                            <TableCell className="text-center">
                              <div className="flex justify-center gap-2">
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
              {editingFacility ? "修改設施資訊" : "新增共用設施項目"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
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
});

FacilityManagement.displayName = "FacilityManagement";
