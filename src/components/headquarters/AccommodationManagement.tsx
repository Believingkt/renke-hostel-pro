import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { toast } from "sonner";
import { Building2, Plus, Pencil, Power, PowerOff, Loader2, ExternalLink } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { AccommodationDialog } from "./AccommodationDialog";

interface Accommodation {
  id: string;
  name: string;
  type: string | null;
  registration_number: string | null;
  country: string | null;
  region_1: string | null;
  region_2: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

interface AccommodationManagementProps {
  accommodations: Accommodation[];
  onRefresh: () => void;
  loading: boolean;
}

export function AccommodationManagement({
  accommodations,
  onRefresh,
  loading,
}: AccommodationManagementProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAccommodation, setEditingAccommodation] = useState<Accommodation | null>(null);
  const [toggleDialogOpen, setToggleDialogOpen] = useState(false);
  const [togglingAccommodation, setTogglingAccommodation] = useState<Accommodation | null>(null);
  const [isToggling, setIsToggling] = useState(false);

  const handleCreate = async (data: any) => {
    try {
      // Step 1: Create the accommodation and get the ID
      const { data: newAccommodation, error: createError } = await supabase
        .from("accommodation_info")
        .insert({
          name: data.name,
          type: data.type,
          registration_number: data.registration_number || null,
          country: data.country || "台灣",
          region_1: data.region_1 || null,
          region_2: data.region_2 || null,
          address: data.address || null,
          phone: data.phone || null,
          email: data.email || null,
          description: data.description || null,
          is_active: true,
        })
        .select("id")
        .single();

      if (createError) throw createError;

      const accommodationId = newAccommodation.id;

      // Step 2: Create default settings in parallel
      const initPromises = [
        // Default booking settings
        supabase.from("booking_settings").insert({
          accommodation_id: accommodationId,
          check_in_time: "15:00",
          check_out_time: "11:00",
          use_deposit: true,
          deposit_percentage: 30,
          payment_methods: ["現金", "信用卡", "銀行轉帳"],
          cancellation_policy: "入住前7天可免費取消，入住前3天取消收取50%費用，入住前1天取消收取全額費用。",
          pet_policy: "本民宿不接受寵物入住。",
        }),

        // Default about section
        supabase.from("about_section").insert({
          accommodation_id: accommodationId,
          section_title: "關於我們",
          section_description: "歡迎來到我們的民宿，這裡提供舒適的住宿體驗。",
        }),

        // Default pricing template
        supabase.from("pricing_templates").insert({
          accommodation_id: accommodationId,
          template_name: "平日價格",
          description: "週一至週四的基本價格",
          is_default: true,
          display_order: 1,
        }),

        // Default location info
        supabase.from("location_info").insert({
          accommodation_id: accommodationId,
          location_description: data.address || "",
          driving_info: "",
          public_transport_info: "",
        }),
      ];

      // Execute all init promises but don't fail if some fail
      const results = await Promise.allSettled(initPromises);
      
      // Log any failures but don't block the creation
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          console.warn(`Failed to create default setting ${index}:`, result.reason);
        }
      });

      toast.success("民宿新增成功", {
        description: "已自動建立預訂設定、價格模板等基礎資料",
      });
      onRefresh();
    } catch (error: any) {
      console.error("Error creating accommodation:", error);
      toast.error("新增民宿失敗", { description: error.message });
      throw error;
    }
  };

  const handleEdit = async (data: any) => {
    if (!editingAccommodation) return;

    try {
      const { error } = await supabase
        .from("accommodation_info")
        .update({
          name: data.name,
          type: data.type,
          registration_number: data.registration_number || null,
          country: data.country || "台灣",
          region_1: data.region_1 || null,
          region_2: data.region_2 || null,
          address: data.address || null,
          phone: data.phone || null,
          email: data.email || null,
          description: data.description || null,
        })
        .eq("id", editingAccommodation.id);

      if (error) throw error;

      toast.success("民宿資訊已更新");
      setEditingAccommodation(null);
      onRefresh();
    } catch (error: any) {
      console.error("Error updating accommodation:", error);
      toast.error("更新民宿失敗", { description: error.message });
      throw error;
    }
  };

  const handleToggleActive = async () => {
    if (!togglingAccommodation) return;

    setIsToggling(true);
    try {
      const newStatus = !togglingAccommodation.is_active;
      const { error } = await supabase
        .from("accommodation_info")
        .update({ is_active: newStatus })
        .eq("id", togglingAccommodation.id);

      if (error) throw error;

      toast.success(newStatus ? "民宿已啟用" : "民宿已停用");
      setToggleDialogOpen(false);
      setTogglingAccommodation(null);
      onRefresh();
    } catch (error: any) {
      console.error("Error toggling accommodation:", error);
      toast.error("操作失敗", { description: error.message });
    } finally {
      setIsToggling(false);
    }
  };

  const openEditDialog = (accommodation: Accommodation) => {
    setEditingAccommodation(accommodation);
    setDialogOpen(true);
  };

  const openToggleDialog = (accommodation: Accommodation) => {
    setTogglingAccommodation(accommodation);
    setToggleDialogOpen(true);
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              民宿管理
            </CardTitle>
            <CardDescription>新增、編輯或停用民宿</CardDescription>
          </div>
          <Button onClick={() => {
            setEditingAccommodation(null);
            setDialogOpen(true);
          }} className="gap-2">
            <Plus className="h-4 w-4" />
            新增民宿
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : accommodations.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="尚無民宿資料"
              description="點擊「新增民宿」開始建立第一個民宿"
            />
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">民宿名稱</TableHead>
                    <TableHead className="font-semibold">類型</TableHead>
                    <TableHead className="font-semibold">地區</TableHead>
                    <TableHead className="font-semibold">電話</TableHead>
                    <TableHead className="font-semibold">狀態</TableHead>
                    <TableHead className="font-semibold">建立時間</TableHead>
                    <TableHead className="text-right font-semibold">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accommodations.map((acc) => (
                    <TableRow key={acc.id} className={!acc.is_active ? "opacity-60" : ""}>
                      <TableCell className="font-medium">{acc.name}</TableCell>
                      <TableCell>{acc.type || "-"}</TableCell>
                      <TableCell>
                        {acc.region_1 && acc.region_2
                          ? `${acc.region_1} ${acc.region_2}`
                          : acc.region_1 || "-"}
                      </TableCell>
                      <TableCell>{acc.phone || "-"}</TableCell>
                      <TableCell>
                        <Badge variant={acc.is_active ? "default" : "secondary"}>
                          {acc.is_active ? "營運中" : "已停用"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(acc.created_at).toLocaleDateString("zh-TW")}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(acc)}
                            title="編輯"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openToggleDialog(acc)}
                            title={acc.is_active ? "停用" : "啟用"}
                          >
                            {acc.is_active ? (
                              <PowerOff className="h-4 w-4 text-destructive" />
                            ) : (
                              <Power className="h-4 w-4 text-green-600" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            asChild
                            title="前往後台"
                          >
                            <a
                              href={`/admin?accommodation=${acc.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <AccommodationDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingAccommodation(null);
        }}
        onSubmit={editingAccommodation ? handleEdit : handleCreate}
        initialData={editingAccommodation || undefined}
        isEditing={!!editingAccommodation}
      />

      {/* Toggle Active Dialog */}
      <AlertDialog open={toggleDialogOpen} onOpenChange={setToggleDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {togglingAccommodation?.is_active ? "停用民宿" : "啟用民宿"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {togglingAccommodation?.is_active
                ? `確定要停用「${togglingAccommodation?.name}」嗎？停用後該民宿將無法接受新訂單。`
                : `確定要啟用「${togglingAccommodation?.name}」嗎？啟用後該民宿可以正常接受訂單。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isToggling}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleToggleActive}
              disabled={isToggling}
              className={togglingAccommodation?.is_active ? "bg-destructive hover:bg-destructive/90" : ""}
            >
              {isToggling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {togglingAccommodation?.is_active ? "停用" : "啟用"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
