import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Users, Calendar, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { AlternativeRoomSuggestion } from "@/utils/bookingConflictDetection";

interface ConflictWarningProps {
  type: 'overbooked' | 'duplicate' | 'warning';
  message: string;
  availableRooms?: number;
  bookedRooms?: number;
  conflictingOrders?: any[];
  alternativeRooms?: AlternativeRoomSuggestion[];
  onSelectAlternative?: (roomTypeId: string) => void;
}

export function ConflictWarning({ 
  type, 
  message, 
  availableRooms, 
  bookedRooms, 
  conflictingOrders,
  alternativeRooms,
  onSelectAlternative
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

        {alternativeRooms && alternativeRooms.length > 0 && type === 'overbooked' && (
          <div className="mt-3 p-3 bg-primary/5 border border-primary/20 rounded-md">
            <p className="text-sm font-medium mb-2 flex items-center gap-2">
              <ArrowRight className="h-4 w-4" />
              推薦替代房型
            </p>
            <div className="space-y-2">
              {alternativeRooms.slice(0, 3).map((suggestion) => (
                <div key={suggestion.roomTypeId} className="flex items-center justify-between p-2 bg-background rounded border">
                  <div className="flex-1">
                    <p className="font-medium text-sm">{suggestion.roomTypeName}</p>
                    <div className="flex gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">
                        <Users className="h-3 w-3 mr-1" />
                        可住 {suggestion.capacity} 人
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        NT$ {suggestion.basePrice.toLocaleString()}
                      </Badge>
                    </div>
                  </div>
                  {onSelectAlternative && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onSelectAlternative(suggestion.roomTypeId)}
                      className="ml-2"
                    >
                      選擇
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}
