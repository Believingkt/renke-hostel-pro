import { supabase } from "@/integrations/supabase/client";
import { addDays, isWithinInterval, parseISO } from "date-fns";

export interface ConflictDetectionResult {
  hasConflict: boolean;
  conflictType?: 'overbooked' | 'duplicate';
  message?: string;
  availableRooms?: number;
  bookedRooms?: number;
  conflictingOrders?: any[];
}

/**
 * 檢測訂房衝突
 * @param roomTypeId 房型ID
 * @param checkInDate 入住日期
 * @param checkOutDate 退房日期
 * @param accommodationId 住宿ID
 * @param excludeOrderId 排除的訂單ID（編輯時使用）
 * @param guestInfo 客人資訊（用於檢測重複訂房）
 * @returns 衝突檢測結果
 */
export const detectBookingConflict = async (
  roomTypeId: string,
  checkInDate: string,
  checkOutDate: string,
  accommodationId: string,
  excludeOrderId?: string,
  guestInfo?: {
    guestName?: string;
    guestPhone?: string;
    guestEmail?: string;
  }
): Promise<ConflictDetectionResult> => {
  try {
    // 1. 獲取房型資訊
    const { data: roomType, error: roomTypeError } = await supabase
      .from("room_types")
      .select("room_count, name")
      .eq("id", roomTypeId)
      .single();

    if (roomTypeError || !roomType) {
      console.error("Error fetching room type:", roomTypeError);
      return { hasConflict: false };
    }

    // 2. 查詢該房型在指定日期範圍內的所有訂單（排除已取消的）
    let ordersQuery = supabase
      .from("orders")
      .select("*")
      .eq("accommodation_id", accommodationId)
      .eq("room_type_id", roomTypeId)
      .neq("order_status", "cancelled");

    // 如果是編輯模式，排除當前訂單
    if (excludeOrderId) {
      ordersQuery = ordersQuery.neq("id", excludeOrderId);
    }

    const { data: orders, error: ordersError } = await ordersQuery;

    if (ordersError) {
      console.error("Error fetching orders:", ordersError);
      return { hasConflict: false };
    }

    // 3. 檢測重複訂房（同一客人在相同或重疊日期）
    if (guestInfo && (guestInfo.guestPhone || guestInfo.guestEmail)) {
      const duplicateOrders = orders?.filter((order) => {
        // 檢查客人資訊是否匹配
        const phoneMatch = guestInfo.guestPhone && order.guest_phone === guestInfo.guestPhone;
        const emailMatch = guestInfo.guestEmail && order.guest_email === guestInfo.guestEmail;
        
        if (!phoneMatch && !emailMatch) return false;

        // 檢查日期是否重疊
        const orderCheckIn = parseISO(order.check_in_date);
        const orderCheckOut = parseISO(order.check_out_date);
        const newCheckIn = parseISO(checkInDate);
        const newCheckOut = parseISO(checkOutDate);

        // 判斷日期是否重疊
        const hasOverlap = 
          (newCheckIn >= orderCheckIn && newCheckIn < orderCheckOut) ||
          (newCheckOut > orderCheckIn && newCheckOut <= orderCheckOut) ||
          (newCheckIn <= orderCheckIn && newCheckOut >= orderCheckOut);

        return hasOverlap;
      });

      if (duplicateOrders && duplicateOrders.length > 0) {
        return {
          hasConflict: true,
          conflictType: 'duplicate',
          message: `檢測到重複訂房：該客人在相同日期已有 ${duplicateOrders.length} 筆訂單`,
          conflictingOrders: duplicateOrders
        };
      }
    }

    // 4. 檢測超額預訂 - 計算每一天的預訂數量
    const checkIn = parseISO(checkInDate);
    const checkOut = parseISO(checkOutDate);
    
    // 為每一天計算已預訂房間數
    let maxBookedRooms = 0;
    let currentDate = new Date(checkIn);
    
    while (currentDate < checkOut) {
      let bookedRoomsForDay = 0;
      
      orders?.forEach((order) => {
        const orderCheckIn = parseISO(order.check_in_date);
        const orderCheckOut = parseISO(order.check_out_date);
        
        // 檢查這一天是否在訂單的日期範圍內
        if (currentDate >= orderCheckIn && currentDate < orderCheckOut) {
          bookedRoomsForDay++;
        }
      });
      
      maxBookedRooms = Math.max(maxBookedRooms, bookedRoomsForDay);
      currentDate = addDays(currentDate, 1);
    }

    // 加上當前新訂單
    const totalBookedRooms = maxBookedRooms + 1;
    const availableRooms = roomType.room_count - maxBookedRooms;

    if (totalBookedRooms > roomType.room_count) {
      return {
        hasConflict: true,
        conflictType: 'overbooked',
        message: `超額預訂：${roomType.name} 在指定日期只剩 ${availableRooms} 間可用，但已有 ${maxBookedRooms} 間被預訂`,
        availableRooms,
        bookedRooms: maxBookedRooms,
        conflictingOrders: orders || []
      };
    }

    // 5. 如果可用房間很少，返回警告信息
    if (availableRooms <= 2 && availableRooms > 0) {
      return {
        hasConflict: false,
        message: `提醒：${roomType.name} 在指定日期只剩 ${availableRooms} 間可用`,
        availableRooms,
        bookedRooms: maxBookedRooms
      };
    }

    return {
      hasConflict: false,
      availableRooms,
      bookedRooms: maxBookedRooms
    };

  } catch (error) {
    console.error("Error in conflict detection:", error);
    return { hasConflict: false };
  }
};

/**
 * 獲取房型在指定日期範圍內的可用數量
 */
export const getAvailableRoomCount = async (
  roomTypeId: string,
  checkInDate: string,
  checkOutDate: string,
  accommodationId: string,
  excludeOrderId?: string
): Promise<number> => {
  const result = await detectBookingConflict(
    roomTypeId,
    checkInDate,
    checkOutDate,
    accommodationId,
    excludeOrderId
  );
  
  return result.availableRooms || 0;
};

export interface AlternativeRoomSuggestion {
  roomType: {
    id: string;
    name: string;
    capacity: number;
    base_price: number;
    weekday_price: number | null;
    weekend_price: number | null;
    description: string | null;
  };
  availableRooms: number;
  priceEstimate: number;
}

/**
 * 獲取替代房型建議
 * @param currentRoomTypeId 當前已滿的房型ID
 * @param checkInDate 入住日期
 * @param checkOutDate 退房日期
 * @param accommodationId 住宿ID
 * @param guestCount 客人數量
 * @returns 可用的替代房型列表
 */
export const getAlternativeRoomSuggestions = async (
  currentRoomTypeId: string,
  checkInDate: string,
  checkOutDate: string,
  accommodationId: string,
  guestCount: number = 2
): Promise<AlternativeRoomSuggestion[]> => {
  try {
    // 獲取所有房型（排除當前房型）
    const { data: roomTypes, error: roomTypesError } = await supabase
      .from("room_types")
      .select("id, name, capacity, base_price, weekday_price, weekend_price, description")
      .eq("accommodation_id", accommodationId)
      .neq("id", currentRoomTypeId)
      .gte("capacity", guestCount) // 只推薦容量足夠的房型
      .order("base_price", { ascending: true });

    if (roomTypesError || !roomTypes) {
      console.error("Error fetching room types:", roomTypesError);
      return [];
    }

    // 檢查每個房型的可用性
    const suggestions: AlternativeRoomSuggestion[] = [];
    
    for (const roomType of roomTypes) {
      const conflictResult = await detectBookingConflict(
        roomType.id,
        checkInDate,
        checkOutDate,
        accommodationId
      );

      // 只推薦有空房的房型
      if (!conflictResult.hasConflict && conflictResult.availableRooms && conflictResult.availableRooms > 0) {
        // 估算價格（簡單使用基礎價格，實際應用中可能需要更複雜的計算）
        const priceEstimate = roomType.weekday_price || roomType.base_price;
        
        suggestions.push({
          roomType,
          availableRooms: conflictResult.availableRooms,
          priceEstimate
        });
      }
    }

    return suggestions;
  } catch (error) {
    console.error("Error getting alternative room suggestions:", error);
    return [];
  }
};
