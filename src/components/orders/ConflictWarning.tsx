import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Users, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

interface ConflictWarningProps {
  type: 'overbooked' | 'duplicate' | 'warning';
  message: string;
  availableRooms?: number;
  bookedRooms?: number;
  conflictingOrders?: any[];
}

export function ConflictWarning({ 
  type, 
  message, 
  availableRooms, 
  bookedRooms, 
  conflictingOrders 
}: ConflictWarningProps) {
  const isError = type === 'overbooked' || type === 'duplicate';
  
  return (
    <Alert variant={isError ? "destructive" : "default"} className="mb-4">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="flex items-center gap-2">
        {type === 'overbooked' && '⚠️ 超額預訂警告'}
        {type === 'duplicate' && '⚠️ 重複訂房警告'}
        {type === 'warning' && '💡 房間數量提醒'}
      </AlertTitle>
      <AlertDescription className="mt-2 space-y-2">
        <p>{message}</p>
        
        {availableRooms !== undefined && bookedRooms !== undefined && (
          <div className="flex gap-4 text-sm mt-2">
            <Badge variant="outline" className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              已預訂: {bookedRooms} 間
            </Badge>
            <Badge variant="outline" className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              可用: {availableRooms} 間
            </Badge>
          </div>
        )}
        
        {conflictingOrders && conflictingOrders.length > 0 && (
          <div className="mt-3 p-2 bg-muted/50 rounded-md">
            <p className="text-xs font-medium mb-2">衝突訂單：</p>
            <div className="space-y-1">
              {conflictingOrders.slice(0, 3).map((order, index) => (
                <div key={index} className="text-xs flex justify-between">
                  <span>訂單 {order.order_number}</span>
                  <span className="text-muted-foreground">
                    {format(new Date(order.check_in_date), 'MM/dd')} - {format(new Date(order.check_out_date), 'MM/dd')}
                  </span>
                </div>
              ))}
              {conflictingOrders.length > 3 && (
                <p className="text-xs text-muted-foreground">...還有 {conflictingOrders.length - 3} 筆訂單</p>
              )}
            </div>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}
