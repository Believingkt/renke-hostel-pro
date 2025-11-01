import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RoomTypeForm } from "@/components/RoomTypeForm";
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

const Pricing = () => {
  const { currentAccommodationId } = useAccommodation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "rooms");
  
  const [roomTypes, setRoomTypes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingRoomType, setEditingRoomType] = useState<any>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingRoomType, setDeletingRoomType] = useState<any>(null);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && (tab === "rooms" || tab === "basic" || tab === "inventory")) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  useEffect(() => {
    if (currentAccommodationId && activeTab === "rooms") {
      loadRoomTypes();
    }
  }, [currentAccommodationId, activeTab]);

  const loadRoomTypes = async () => {
    if (!currentAccommodationId) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('room_types')
        .select('*')
        .eq('accommodation_id', currentAccommodationId)
        .order('display_order', { ascending: true });

      if (error) throw error;
      setRoomTypes(data || []);
    } catch (error) {
      console.error('Error loading room types:', error);
      toast.error("無法載入房型資料");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddNew = () => {
    setEditingRoomType(null);
    setShowForm(true);
  };

  const handleEdit = (roomType: any) => {
    setEditingRoomType(roomType);
    setShowForm(true);
  };

  const handleDelete = (roomType: any) => {
    setDeletingRoomType(roomType);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingRoomType) return;

    try {
      // Delete photos first
      await supabase
        .from("room_photos")
        .delete()
        .eq("room_type_id", deletingRoomType.id);

      // Delete room
      const { error } = await supabase
        .from('room_types')
        .delete()
        .eq('id', deletingRoomType.id);

      if (error) throw error;

      toast.success("房型已成功刪除");
      loadRoomTypes();
    } catch (error) {
      console.error('Error deleting room type:', error);
      toast.error("無法刪除房型，請重試");
    } finally {
      setDeleteDialogOpen(false);
      setDeletingRoomType(null);
    }
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditingRoomType(null);
    loadRoomTypes();
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setEditingRoomType(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">物件管理</h1>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-xl grid-cols-3">
          <TabsTrigger value="rooms">房型管理</TabsTrigger>
          <TabsTrigger value="basic">價格管理</TabsTrigger>
          <TabsTrigger value="inventory">庫存管理</TabsTrigger>
        </TabsList>

        <TabsContent value="rooms" className="space-y-4">
          {showForm ? (
            <RoomTypeForm
              accommodationId={currentAccommodationId || ""}
              roomType={editingRoomType}
              onSuccess={handleFormSuccess}
              onCancel={handleFormCancel}
            />
          ) : (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>房型管理</CardTitle>
                  <CardDescription className="mt-2">
                    管理住宿的各種房型資訊
                  </CardDescription>
                </div>
                <Button onClick={handleAddNew} className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  新增房型
                </Button>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    載入中...
                  </div>
                ) : roomTypes.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    尚無房型資料，請點擊「新增房型」開始建立
                  </div>
                ) : (
                  <div className="space-y-4">
                    {roomTypes.map((roomType) => (
                      <Card key={roomType.id}>
                        <CardContent className="pt-6">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-3">
                                <h3 className="text-xl font-bold">{roomType.name}</h3>
                                {roomType.name_en && (
                                  <span className="text-sm text-muted-foreground">
                                    {roomType.name_en}
                                  </span>
                                )}
                              </div>
                              
                              {roomType.description && (
                                <p className="text-sm text-muted-foreground mb-4">
                                  {roomType.description}
                                </p>
                              )}

                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <div>
                                  <span className="text-muted-foreground">坪數：</span>
                                  <span className="font-medium">
                                    {roomType.size_sqm ? `${roomType.size_sqm} m²` : '未設定'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">容納人數：</span>
                                  <span className="font-medium">{roomType.capacity} 人</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">房間數量：</span>
                                  <span className="font-medium">{roomType.room_count || 1} 間</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">顯示順序：</span>
                                  <span className="font-medium">{roomType.display_order}</span>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
                                <div>
                                  <span className="text-muted-foreground">平日價格：</span>
                                  <span className="font-bold text-primary">
                                    {roomType.weekday_price ? `NT$ ${roomType.weekday_price.toLocaleString()}` : '未設定'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">假日價格：</span>
                                  <span className="font-bold text-primary">
                                    {roomType.weekend_price ? `NT$ ${roomType.weekend_price.toLocaleString()}` : '未設定'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex gap-2 ml-4">
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => handleEdit(roomType)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => handleDelete(roomType)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="basic" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>基本價格</CardTitle>
              <CardDescription>
                設定各房型的基本房價
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">基本價格設定內容</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>專案價格</CardTitle>
              <CardDescription>
                設定特殊專案的優惠價格
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">專案價格設定內容</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inventory" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>庫存管理</CardTitle>
              <CardDescription>
                管理各房型的可售庫存數量
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">庫存管理內容</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除</AlertDialogTitle>
            <AlertDialogDescription>
              確定要刪除房型「{deletingRoomType?.name}」嗎？此操作無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Pricing;
