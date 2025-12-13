import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package, Home } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { toast } from "sonner";
import { RoomInventoryCalendar } from "@/components/RoomInventoryCalendar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

interface RoomType {
  id: string;
  name: string;
}

export default function RoomInventory() {
  const { currentAccommodationId } = useAccommodation();
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [selectedRoomType, setSelectedRoomType] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentAccommodationId) {
      loadRoomTypes();
    }
  }, [currentAccommodationId]);

  const loadRoomTypes = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('room_types')
        .select('id, name')
        .eq('accommodation_id', currentAccommodationId)
        .order('display_order', { ascending: true });

      if (error) throw error;

      setRoomTypes(data || []);
      if (data && data.length > 0) {
        setSelectedRoomType(data[0].id);
      }
    } catch (error) {
      console.error('載入房型失敗:', error);
      toast.error('載入房型資料失敗');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/admin" className="flex items-center hover:opacity-70 transition-opacity">
                <Home className="h-4 w-4" />
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink className="text-muted-foreground">訂單資訊</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>預訂管理</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader title="預訂管理" icon={Package} />

      <Card>
        <CardHeader>
          <CardTitle>選擇房型</CardTitle>
          <CardDescription>
            查看並管理各房型的每日價格與庫存數量
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : roomTypes.length === 0 ? (
            <div className="flex items-center justify-center min-h-[200px] text-muted-foreground">
              <div className="text-center space-y-2">
                <Package className="h-16 w-16 mx-auto opacity-20" />
                <p className="text-lg font-medium">尚無房型資料</p>
                <p className="text-sm">請先前往房型管理新增房型</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <Select value={selectedRoomType} onValueChange={setSelectedRoomType}>
                <SelectTrigger className="w-full md:w-[300px] h-12 md:h-10 text-base md:text-sm touch-manipulation">
                  <SelectValue placeholder="選擇房型" />
                </SelectTrigger>
                <SelectContent className="bg-background border-border z-50">
                  {roomTypes.map((room) => (
                    <SelectItem key={room.id} value={room.id}>
                      {room.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedRoomType && currentAccommodationId && (
                <RoomInventoryCalendar
                  roomTypeId={selectedRoomType}
                  roomTypeName={roomTypes.find(r => r.id === selectedRoomType)?.name || ''}
                  accommodationId={currentAccommodationId}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
