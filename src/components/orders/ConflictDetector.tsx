import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, CheckCircle } from "lucide-react";
import { detectBookingConflict } from "@/utils/bookingConflictDetection";
import { ConflictWarning } from "./ConflictWarning";
import { supabase } from "@/integrations/supabase/client";

interface ConflictDetectorProps {
  orders: any[]; // 使用 any 以接受完整的訂單數據
  accommodationId: string;
}

interface ConflictInfo {
  id: string;
  order_number: string;
  guest_name: string;
  guest_phone: string;
  check_in_date: string;
  check_out_date: string;
  order_status: string;
  room_type_id: string;
  conflictResult: {
    hasConflict: boolean;
    conflictType?: 'overbooked' | 'duplicate';
    message?: string;
    availableRooms?: number;
    bookedRooms?: number;
    conflictingOrders?: any[];
  };
}

export function ConflictDetector({ orders, accommodationId }: ConflictDetectorProps) {
  const [isChecking, setIsChecking] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictInfo[]>([]);
  const [lastCheckTime, setLastCheckTime] = useState<Date | null>(null);
  const [fullOrders, setFullOrders] = useState<any[]>([]);

  // 獲取完整的訂單數據（包含 room_type_id）
  const fetchFullOrders = async () => {
    if (orders.length === 0) return;
    
    const orderIds = orders.map(o => o.id);
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .in("id", orderIds);
    
    if (!error && data) {
      setFullOrders(data);
    }
  };

  useEffect(() => {
    fetchFullOrders();
  }, [orders]);

  const checkAllConflicts = async () => {
    if (fullOrders.length === 0) return;
    
    setIsChecking(true);
    setConflicts([]);

    try {
      const conflictChecks = await Promise.all(
        fullOrders
          .filter(order => order.order_status !== 'cancelled' && order.order_status !== 'checked_out')
          .map(async (order) => {
            if (!order.room_type_id) return null;
            
            const result = await detectBookingConflict(
              order.room_type_id,
              order.check_in_date,
              order.check_out_date,
              accommodationId,
              order.id,
              {
                guestName: order.guest_name,
                guestPhone: order.guest_phone,
                guestEmail: order.guest_email
              }
            );

            if (result.hasConflict || (result.availableRooms !== undefined && result.availableRooms <= 1)) {
              return {
                id: order.id,
                order_number: order.order_number,
                guest_name: order.guest_name,
                guest_phone: order.guest_phone,
                check_in_date: order.check_in_date,
                check_out_date: order.check_out_date,
                order_status: order.order_status,
                room_type_id: order.room_type_id,
                conflictResult: result
              };
            }
            return null;
          })
      );

      const foundConflicts = conflictChecks.filter((c): c is ConflictInfo => c !== null && c.conflictResult !== undefined);
      setConflicts(foundConflicts);
      setLastCheckTime(new Date());
    } catch (error) {
      console.error("Error checking conflicts:", error);
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    if (fullOrders.length > 0 && !lastCheckTime) {
      checkAllConflicts();
    }
  }, [fullOrders.length]);

  const criticalConflicts = conflicts.filter(c => c.conflictResult?.hasConflict);
  const warningConflicts = conflicts.filter(c => !c.conflictResult?.hasConflict && c.conflictResult?.availableRooms !== undefined && c.conflictResult.availableRooms <= 1);

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">衝突檢測</CardTitle>
            {criticalConflicts.length > 0 && (
              <Badge variant="destructive" className="animate-pulse">
                {criticalConflicts.length} 個衝突
              </Badge>
            )}
            {warningConflicts.length > 0 && criticalConflicts.length === 0 && (
              <Badge variant="secondary">
                {warningConflicts.length} 個提醒
              </Badge>
            )}
            {conflicts.length === 0 && lastCheckTime && (
              <Badge variant="outline" className="text-cyan-600">
                <CheckCircle className="h-3 w-3 mr-1" />
                無衝突
              </Badge>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={checkAllConflicts}
            disabled={isChecking}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isChecking ? 'animate-spin' : ''}`} />
            {isChecking ? '檢測中...' : '重新檢測'}
          </Button>
        </div>
        {lastCheckTime && (
          <p className="text-xs text-muted-foreground mt-1">
            最後檢測: {lastCheckTime.toLocaleTimeString()}
          </p>
        )}
      </CardHeader>
      
      {conflicts.length > 0 && (
        <CardContent className="space-y-3">
          {criticalConflicts.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-destructive flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                需要處理的衝突
              </h4>
              {criticalConflicts.map((conflict) => (
                <div key={conflict.id} className="border border-destructive/20 rounded-lg p-3">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-medium text-sm">訂單 {conflict.order_number}</p>
                      <p className="text-xs text-muted-foreground">
                        {conflict.guest_name} · {conflict.check_in_date} ~ {conflict.check_out_date}
                      </p>
                    </div>
                    <Badge variant="destructive">{conflict.order_status}</Badge>
                  </div>
                  {conflict.conflictResult && (
                    <ConflictWarning
                      type={conflict.conflictResult.conflictType || 'overbooked'}
                      message={conflict.conflictResult.message || ''}
                      availableRooms={conflict.conflictResult.availableRooms}
                      bookedRooms={conflict.conflictResult.bookedRooms}
                      conflictingOrders={conflict.conflictResult.conflictingOrders}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {warningConflicts.length > 0 && (
            <div className="space-y-3 mt-4">
              <h4 className="text-sm font-semibold text-orange-600 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                房間數量提醒
              </h4>
              {warningConflicts.map((conflict) => (
                <div key={conflict.id} className="border border-orange-200 rounded-lg p-3 bg-orange-50/50">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-medium text-sm">訂單 {conflict.order_number}</p>
                      <p className="text-xs text-muted-foreground">
                        {conflict.guest_name} · {conflict.check_in_date} ~ {conflict.check_out_date}
                      </p>
                    </div>
                    <Badge variant="secondary">{conflict.order_status}</Badge>
                  </div>
                  {conflict.conflictResult && (
                    <ConflictWarning
                      type="warning"
                      message={conflict.conflictResult.message || ''}
                      availableRooms={conflict.conflictResult.availableRooms}
                      bookedRooms={conflict.conflictResult.bookedRooms}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
